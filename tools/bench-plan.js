/* The planner, measured by outcomes: made-up semesters walked day by day through the REAL app, with a made-up student who
   follows the plan. test-planner.js asks "does today's plan break a rule?"; this asks "if a student does what the plan says
   every day for four weeks, what happens?" — work handed in late, days the plan overloaded, night-before cramming, how often the
   plan reshuffled under them, hours left unused while work was waiting, and how close the estimates were.
   Built 2026-10-28 (Emiel: "build before applying, so we can make sure it's actually better") so a candidate planner is judged
   here before a line of it reaches app/index.html.

   How it runs: the public build in a headless Chrome of its own (port 9334, fresh profile), the clock faked at document start
   (window.Date is replaced; __clockSet moves it), Phoenix time. Each scenario is a Canvas payload through the real
   applyCanvasPayload. Each day: the clock moves to 9 AM, loadData + render rebuild the plan, plan-rules.js checks H1-H11 and
   reads the plan, then __simWork (injected) plays the student: the day's plan rows in order, up to the minutes the student
   truly has (which the planner does not know), study sessions via prepMark, finished work through store.done + recordDuration
   the way the "About right / Longer" answer records it, sprint minutes into store.spent when the scenario says the student
   tracks. Work due today and still open is done anyway if time remains (a "rescue" the plan did not make).

   Candidates: tools/plan-candidates/<name>.js, plain JS evaluated in the page after the app loads. A candidate reassigns the
   planner's function declarations (computePlan, remainingMins, ...). "current" is the app as shipped. Every candidate sees the
   same world: the true minutes per item, the student's true hours and skipped days are drawn once per scenario from a seeded
   RNG, before any candidate runs.

   Assumptions, so they can be argued with: true minutes are lognormal around 1.2x the planner's default for the size (students
   underestimate; sigma 0.4); a student's true day is 0.8-1.1x the stated hours, and a skipped day is 0 with the scenario's
   probability; the student does rows in the order shown and never works past the hours they have; the estimate they confirm
   is quantised the way the live ask is (0.6x / 1x / 1.6x); the student keeps overdue work (taps "Still worth it") and takes a
   suggested head start half the time.

   Run: node tools/bench-plan.js [--only <candidate>] [--scen <substring>] [--days 28] [--tz America/New_York]
        (needs :8899 serving ~/lmk-web; starts and stops its own Chrome). Results: a table, and JSON in the scratchpad. */
const {execSync, spawn} = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const {CHECK} = require('./plan-rules');
const ARG = process.argv.slice(2), opt = (k, d) => { const i = ARG.indexOf(k); return i >= 0 ? ARG[i + 1] : d; };
const DAYS = +opt('--days', 28), ONLY = opt('--only', null), SCEN_F = opt('--scen', null), TZ = opt('--tz', 'America/Phoenix');
const PORT = 9334, CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let id = 0;
const send = (ws, m, p = {}) => new Promise(r => { const mid = ++id; const h = e => { const x = JSON.parse(e.data); if (x.id === mid) { ws.removeEventListener('message', h); r(x.result); } }; ws.addEventListener('message', h); ws.send(JSON.stringify({id: mid, method: m, params: p})); });
const ev = (ws, e) => send(ws, 'Runtime.evaluate', {expression: e, returnByValue: true, awaitPromise: true}).then(r => { if (r && r.exceptionDetails) throw new Error('page: ' + ((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text || '').slice(0, 300)); return r && r.result ? r.result.value : undefined; });

/* ---- the world: Phoenix is UTC-7 all year, so instants are computed without the page's zone ---- */
const ORIGIN = Date.UTC(2026, 8, 14, 16, 0);   // Mon Sep 14 2026, 9:00 AM Phoenix
const ZONE_OFF = TZ === 'America/Phoenix' ? 7 : null;   // another zone: the page's own clock decides; dates below are still Phoenix instants
const at = (day, h = 23, m = 59) => new Date(ORIGIN + day * 864e5 + (h - 9) * 3600e3 + m * 60e3).toISOString();
const C = ['ECN 212', 'PSY 101', 'MAT 210', 'HST 102'], CID = {'ECN 212': '1', 'PSY 101': '2', 'MAT 210': '3', 'HST 102': '4'};
const SIZE_BASE = {quick: 18, medium: 54, big: 144}, AHEAD_P = 0.5;   // the student takes a suggested head start half the time   // 1.2x the planner's default (15 / 45 / 120)
function rng(seed){ let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = s => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const lognorm = (R, base, sigma) => { const u = Math.max(1e-9, R()), v = R(); return base * Math.exp(sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)); };
/* an item: [aid, course, title, dueDay | null, {h, size, k, st, open, pts, grp}] */
const item = (aid, c, t, d, o = {}) => ({aid: String(aid), c, t, d, o});
const many = (n, from, span, size, c0 = 0) => Array.from({length: n}, (_, i) => item(500 + i, C[(i + c0) % 4], `Problem set ${i + 1}`, from + (i % span), {size}));
function payload(items, when, groups){
  const out = {};
  for (const x of items) out[x.aid] = {t: x.t, c: x.c, cid: CID[x.c], due: x.d === null ? '' : at(x.d, x.o.h == null ? 23 : x.o.h, x.o.h == null ? 59 : 0), pts: x.o.pts == null ? 10 : x.o.pts, st: x.o.st || 'online_upload', grp: x.o.grp || 'g', k: x.o.k || '', sub: '', score: null, url: '', desc: x.o.desc || '', rub: '', fb: '', open: x.o.open == null ? '' : at(x.o.open, 0, 1), lock: ''};
  return {lmk: 'canvas', v: 3, at: when, host: 'canvas.asu.edu', items: out, groups: groups || {}, ann: [], courses: C.map(c => ({id: CID[c], tag: c, wt: !!groups}))};
}
/* scenarios: the brief's list (heavy exam week, same-day deadlines, a long ambiguous project, incomplete Canvas data, overdue work,
   limited time, unexpected work, missed days, conflicting priorities, uneven courses), plus a light week as the floor */
const SCEN = [
  {name: 'light week', items: [item(11, 'ECN 212', 'Problem set 4', 2), item(12, 'PSY 101', 'Reading response', 4), item(13, 'MAT 210', 'Homework 5.1', 5), item(14, 'HST 102', 'Discussion post', 6, {k: 'discussion'}), item(15, 'ECN 212', 'Problem set 5', 9), ...many(8, 10, 14, 'medium')]},
  {name: 'heavy exam week (two exams five days apart)', items: [item(41, 'PSY 101', 'Exam 2', 6, {st: 'on_paper', h: 9}), item(44, 'MAT 210', 'Midterm', 11, {st: 'on_paper', h: 10}), item(42, 'PSY 101', 'Chapter 7 homework', 4), item(43, 'ECN 212', 'Problem set 8', 5), item(45, 'MAT 210', 'Practice midterm', 9, {size: 'medium'}), item(46, 'HST 102', 'Reading response 5', 8), ...many(8, 12, 12, 'medium', 1)]},
  {name: 'three big things due the same Thursday', items: [item(51, 'ECN 212', 'Industry report', 3, {size: 'big'}), item(52, 'PSY 101', 'Lab write-up', 3, {size: 'big'}), item(53, 'HST 102', 'Essay 2', 3, {size: 'big'}), item(54, 'MAT 210', 'Homework 6.2', 2), ...many(8, 5, 12, 'medium')]},
  {name: 'a long ambiguous project (8 h, due in 12 days, no description)', items: [item(61, 'HST 102', 'Final research paper', 12, {size: 'big'}), item(62, 'ECN 212', 'Problem set 10', 4), item(63, 'PSY 101', 'Reading response 6', 7), ...many(8, 2, 20, 'quick')], truth: {a61: 480}},
  {name: 'incomplete Canvas data (no dates, no points, no type)', items: [item(71, 'MAT 210', 'Project proposal', null), item(72, 'ECN 212', 'Worksheet 3', 3, {pts: 0}), item(73, 'PSY 101', 'Reflection', 5, {st: 'none'}), item(74, 'HST 102', 'Map exercise', null, {k: 'quiz'}), ...many(10, 1, 14, 'medium')]},
  {name: 'two overdue things kept, on top of a normal week', items: [item(33, 'MAT 210', 'Homework 4.4', -2, {size: 'medium'}), item(34, 'HST 102', 'Response 3', -3), ...many(10, 1, 10, 'medium')], store: {triaged: {a33: 1, a34: 1}}},
  {name: 'limited time (the budget says 2 h, the student truly has 1)', items: many(12, 1, 12, 'medium'), avail: {weekday: 60, weekend: 90}},
  {name: 'unexpected work (three things land on day 5, due in 2-4 days)', items: many(8, 2, 14, 'medium'), later: [{day: 5, items: [item(81, 'ECN 212', 'Pop quiz prep sheet', 7, {size: 'medium'}), item(82, 'PSY 101', 'Surprise essay', 9, {size: 'big'}), item(83, 'MAT 210', 'Extra homework', 8)]}]},
  {name: 'missed days (the student skips a third of them)', items: many(14, 1, 16, 'medium'), skipP: 0.35},
  {name: 'conflicting priorities (10 h paper day 9, exam day 8, nightly posts)', items: [item(91, 'HST 102', 'Research paper', 9, {size: 'big'}), item(92, 'MAT 210', 'Exam 1', 8, {st: 'on_paper', h: 9}), item(93, 'ECN 212', 'Programming assignment 3', 4, {size: 'big'}), ...Array.from({length: 9}, (_, i) => item(100 + i, 'PSY 101', `Discussion ${i + 1}`, 1 + i, {k: 'discussion'})), ...many(6, 11, 14, 'medium')], truth: {a91: 600, a93: 240}},
  {name: 'uneven courses (one heavy, three light)', items: [...Array.from({length: 8}, (_, i) => item(200 + i, 'MAT 210', `Lab ${i + 1}`, 2 + i * 3, {size: 'big'})), ...many(9, 1, 24, 'quick', 1)]},
];
function world(sc){
  const R = rng(hash(sc.name)), all = sc.items.concat(...(sc.later || []).map(l => l.items));
  const truth = {};
  for (const x of all) { const size = x.o.size || (/exam|midterm/i.test(x.t) ? 'big' : x.o.k === 'quiz' || x.o.k === 'discussion' ? 'quick' : /project|essay|paper|report/i.test(x.t) ? 'big' : 'medium'); truth['a' + x.aid] = Math.round(lognorm(R, SIZE_BASE[size], 0.4)); }
  Object.assign(truth, sc.truth || {});
  for (const x of all) if (/exam|midterm/i.test(x.t) && x.o.st === 'on_paper') truth['a' + x.aid] = 0;   // an exam is sat, not worked
  const av = sc.avail || {weekday: 120, weekend: 180}, avail = [];
  for (let d = 0; d < DAYS; d++) { const dow = new Date(ORIGIN + d * 864e5).getUTCDay(); const base = dow === 0 || dow === 6 ? av.weekend : av.weekday; avail.push(R() < (sc.skipP || 0) ? 0 : Math.round(base * (0.8 + 0.3 * R()))); }
  const ahead = Array.from({length: DAYS}, () => R() < AHEAD_P);   // drawn after truth and hours, so earlier worlds are unchanged
  return {truth, avail, ahead, tracks: sc.tracks !== false};
}
/* ---- the student, inside the page ---- */
const SIM = `window.__simWork = function(avail, tracks, ahead){
  const today = startOfDay(now()), k = dayKey(today), T = window.__truth; let worked = 0, cram = 0, rescued = 0; const done = [];
  const doPiece = (e, mins) => { const id = e.id; if (!(id in T.left)) return 0; const spend = Math.min(mins, T.left[id], avail - worked); if (spend <= 0) return 0;
    T.left[id] -= spend; worked += spend; if (tracks) { store.spent = store.spent || {}; store.spent[id] = (store.spent[id] || 0) + spend; }
    if (dayKey(e.due) === k && T.total[id] >= 90) cram += spend;
    if (T.left[id] <= 0) { const pred = learnedMins(e).mins, r = T.total[id] / pred, f = r < .8 ? .6 : r > 1.3 ? 1.6 : 1;
      store.done[e.id] = Date.now(); store.handDone = store.handDone || {}; store.handDone[e.id] = 1; markDoneToday(); recordDuration(e.id, pred * f, 'ask', pred); done.push(e.id); }
    return spend; };
  const pass = () => { const d = PLAN[k]; if (!d) return; for (const c of d.items) { if (worked >= avail) break;
    if (c.prep) { const m = Math.min(c.mins, avail - worked); if (m < 10) continue; prepMark(c.prep.x); worked += m; continue; }
    if (store.done[c.e.id]) continue; doPiece(c.e, c.mins); } };
  pass();
  if (done.length && worked < avail - 15) { save(); loadData(); computeBundles(); computePlan(); pass(); }   // the app re-plans after a finish; a pulled-in piece gets done too
  if (ahead) for (const x of (AHEAD[k] || [])) { if (worked >= avail) break; if (!store.done[x.e.id]) doPiece(x.e, x.mins); }   // a head start, taken
  for (const e of EVENTS.filter(open)) { if (worked >= avail) break; if (e.exam || e.kind === 'inclass' || e.kind === 'fyi' || store.done[e.id] || !(e.due instanceof Date) || dayKey(e.due) !== k) continue; rescued += doPiece(e, T.left[e.id] || 0); }
  save(); loadData(); render();
  return JSON.stringify({worked, cram, rescued, done});
};`;
const CLOCK = off => `(function(){ const R = Date; let off = ${off};
  class D extends R { constructor(...a){ a.length ? super(...a) : super(R.now() + off); } static now(){ return R.now() + off; } }
  window.__clockSet = ms => { off = ms - R.now(); }; window.Date = D; })()`;
function candidates(){
  const dir = path.join(__dirname, 'plan-candidates'), list = [{name: 'current', src: null}];
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()) list.push({name: f.replace(/\.js$/, ''), src: fs.readFileSync(path.join(dir, f), 'utf8')});
  return ONLY ? list.filter(c => c.name === ONLY || c.name === 'current') : list;
}
async function runOne(sc, W, cand, tab){
  const {ws} = tab, seed = Object.assign({onboarded: 1, profile: {name: 'Sam'}, ext: null, capacity: {weekday: 2, weekend: 3}}, sc.store || {});
  const s1 = await send(ws, 'Page.addScriptToEvaluateOnNewDocument', {source: `try{ if (location.port === '8899') { localStorage.clear(); localStorage.setItem('duenorth_v1', ${JSON.stringify(JSON.stringify(seed))}); localStorage.setItem('lmk_ai', 'off'); } }catch(_){}`});
  const s2 = await send(ws, 'Page.addScriptToEvaluateOnNewDocument', {source: CLOCK(ORIGIN - Date.now())});
  await send(ws, 'Page.navigate', {url: 'about:blank'}); await sleep(100);
  await send(ws, 'Page.navigate', {url: 'http://localhost:8899/app/'}); await sleep(2200);
  await send(ws, 'Page.removeScriptToEvaluateOnNewDocument', {identifier: s1.identifier}); await send(ws, 'Page.removeScriptToEvaluateOnNewDocument', {identifier: s2.identifier});
  const groups = sc.groups || null;
  await ev(ws, `window.postMessage({lmk:'ext-hello', version:'0.9.15'}, '*'); window.postMessage({lmk:'canvas-payload', payload:${JSON.stringify(payload(sc.items, ORIGIN - 3600e3, groups))}}, '*'); 1`); await sleep(700);
  if (cand.src) await ev(ws, cand.src + '\n; 1');
  await ev(ws, SIM + `; window.__truth = {total: ${JSON.stringify(W.truth)}, left: ${JSON.stringify(W.truth)}}; 1`);
  const days = [], later = sc.later || []; let prevFirst = null, items = sc.items.slice();
  for (let d = 0; d < DAYS; d++) {
    const dayMs = ORIGIN + d * 864e5, key = new Date(dayMs - 7 * 3600e3).toISOString().slice(0, 10);   // Phoenix day key
    await ev(ws, `__clockSet(${dayMs}); 1`);
    const add = later.find(l => l.day === d);
    if (add) { items = items.concat(add.items); await ev(ws, `window.postMessage({lmk:'canvas-payload', payload:${JSON.stringify(payload(items, dayMs - 60e3, groups))}}, '*'); 1`); await sleep(500); }
    await ev(ws, `(() => { store.triaged = store.triaged || {}; for (const e of EVENTS) if (!store.done[e.id] && !store.dropped[e.id] && e.due instanceof Date && e.due < now() && !store.triaged[e.id]) store.triaged[e.id] = Date.now(); save(); })(); loadData(); computeBundles(); computePlan(); computeAhead(); 1`);   // overdue work is kept, as a student tapping "Still worth it" would
    const r = JSON.parse(await ev(ws, CHECK));
    const rows = r.v.length ? JSON.parse(await ev(ws, `JSON.stringify(Object.values(PLAN).filter(d => d.items.length).map(d => [d.key, d.cap, d.mins, d.items.map(c => (c.prep ? 'prep:' + c.prep.x.name + '#' + c.prep.s.n + '/' + c.prep.s.of : c.e.id + '#' + c.part + '/' + c.parts) + ':' + c.mins + (c.late ? 'L' : '') + '>' + dayKey(c.dueDay))]))`)) : null;
    const td = JSON.parse(await ev(ws, `JSON.stringify((d => ({mins: d ? d.mins : 0, cap: d ? d.cap : 0, n: d ? d.items.length : 0, pending: EVENTS.filter(open).filter(e => !e.exam && e.kind !== 'inclass' && e.kind !== 'fyi' && e.due instanceof Date && e.due > now() && e.due - now() < 7 * 864e5).length}))(PLAN[dayKey(startOfDay(now()))]))`));
    const first = {}; for (const kp in r.map) { const i = kp.split('#')[0]; if (!first[i] || r.map[kp] < first[i]) first[i] = r.map[kp]; }
    let moved = 0, compared = 0;
    if (prevFirst) for (const i in prevFirst) { if (!(i in first) || prevFirst[i] < key) continue; compared++; if (first[i] !== prevFirst[i]) moved++; }
    const w = JSON.parse(await ev(ws, `__simWork(${W.avail[d]}, ${W.tracks}, ${W.ahead[d]})`));
    for (const i of w.done) delete first[i];
    prevFirst = first;
    days.push({key, viol: r.v, rows, ms: r.ms, planned: td.mins, cap: td.cap, over: Math.max(0, td.mins - td.cap), avail: W.avail[d], worked: w.worked, idle: td.pending && W.avail[d] - w.worked > 15 ? W.avail[d] - w.worked : 0, cram: w.cram, rescued: w.rescued, moved, compared, done: w.done.length});
  }
  const end = JSON.parse(await ev(ws, `JSON.stringify({done: store.done, dur: store.dur || {}})`));
  /* late: due inside the window, work (not an exam / in class / ungraded), finished after its due instant or never */
  const late = [], all = items; let lateMins = 0, lateDays = 0;
  for (const x of all) { if (x.d === null || x.d < 0 || x.d >= DAYS) continue; if (x.o.st === 'on_paper' || x.o.k === 'inclass' || x.o.k === 'fyi') continue; const due = Date.parse(at(x.d, x.o.h == null ? 23 : x.o.h, x.o.h == null ? 59 : 0)), t = end.done['a' + x.aid]; if (!t || t > due) { const dl = t ? Math.ceil((t - due) / 864e5) : DAYS - x.d; late.push('a' + x.aid + ' +' + dl + 'd' + (t ? '' : ' (never)')); lateMins += W.truth['a' + x.aid] || 0; lateDays += dl; } }
  let estN = 0, estOk = 0; for (const i in end.dur) for (const x of end.dur[i]) { if (!x.p) continue; estN++; if (Math.abs(x.m - x.p) / x.p <= .25 || Math.abs(x.m - x.p) <= 10) estOk++; }
  const sum = f => days.reduce((t, d) => t + f(d), 0);
  return {late: late.length, lateMins, lateDays, lateIds: late, overDays: days.filter(d => d.over > 0).length, overMins: sum(d => d.over), cram: sum(d => d.cram), rescued: sum(d => d.rescued), idle: sum(d => d.idle), moved: sum(d => d.moved), compared: sum(d => d.compared), viol: sum(d => d.viol.length), violSample: days.flatMap(d => d.viol).slice(0, 3), ms: Math.round(sum(d => d.ms) / days.length * 10) / 10, estOk, estN, done: sum(d => d.done), days};
}
(async () => {
  try { execSync('curl -sf http://localhost:8899/app/ -o /dev/null'); } catch(_) { console.log('HARNESS: nothing serves :8899 — run `cd ~/lmk-web && python3 -m http.server 8899` first'); process.exit(2); }
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'lmk-bench-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--window-size=1100,900', 'about:blank'], {stdio: 'ignore'});
  const bye = () => { try { chrome.kill(); } catch(_){} try { fs.rmSync(prof, {recursive: true, force: true}); } catch(_){} };
  process.on('exit', bye); process.on('SIGINT', () => { bye(); process.exit(2); });
  for (let i = 0; i < 60; i++) { try { execSync(`curl -sf http://localhost:${PORT}/json/version -o /dev/null`); break; } catch(_) { await sleep(150); } }
  const cands = candidates(), scen = SCEN.filter(s => !SCEN_F || s.name.includes(SCEN_F)), results = {};
  console.log(`bench-plan: ${scen.length} scenario(s) x ${cands.map(c => c.name).join(', ')} · ${DAYS} days from ${new Date(ORIGIN).toISOString().slice(0, 10)} · ${TZ}`);
  for (const sc of scen) {
    const W = world(sc); results[sc.name] = {};
    for (const cand of cands) {
      const t = JSON.parse(execSync(`curl -s http://localhost:${PORT}/json/new -X PUT`).toString());
      const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
      const errs = []; ws.addEventListener('message', e => { const x = JSON.parse(e.data); if (x.method === 'Runtime.exceptionThrown') errs.push(String((x.params.exceptionDetails.exception || {}).description || x.params.exceptionDetails.text || '').slice(0, 200)); });
      await send(ws, 'Page.enable'); await send(ws, 'Runtime.enable'); await send(ws, 'Network.setCacheDisabled', {cacheDisabled: true});
      await send(ws, 'Emulation.setTimezoneOverride', {timezoneId: TZ}); await send(ws, 'Emulation.setDeviceMetricsOverride', {width: 1100, height: 900, deviceScaleFactor: 1, mobile: false});
      let res; try { res = await runOne(sc, W, cand, {ws}); } catch(e) { res = {error: String(e.message).slice(0, 300)}; }
      res.pageErrors = errs.slice(0, 3);
      results[sc.name][cand.name] = res;
      ws.close(); try { execSync(`curl -s http://localhost:${PORT}/json/close/${t.id}`, {stdio: 'pipe'}); } catch(_){}
      process.stdout.write(`  ${sc.name.slice(0, 48).padEnd(50)} ${cand.name.padEnd(12)} ${res.error ? 'ERROR ' + res.error : `late ${res.late} (${res.lateMins}m, ${res.lateDays}d)  over-days ${res.overDays} (${res.overMins}m)  cram ${res.cram}m  rescued ${res.rescued}m  idle ${res.idle}m  moved ${res.moved}/${res.compared}  viol ${res.viol}  est ${res.estOk}/${res.estN}  ${res.ms}ms${res.pageErrors.length ? '  PAGE ERRORS ' + res.pageErrors[0] : ''}`}\n`);
    }
  }
  /* the table: one row per scenario per candidate, then totals per candidate */
  console.log('\n  ' + 'scenario'.padEnd(50) + 'candidate'.padEnd(13) + '  late  lateMin  lateDays  overDays  overMin  cram  rescued  idle  moved/cmp  viol  estOk   ms');
  const tot = {};
  for (const sn in results) for (const cn in results[sn]) { const r = results[sn][cn]; if (r.error) continue;
    const t = tot[cn] = tot[cn] || {late: 0, lateMins: 0, lateDays: 0, overDays: 0, overMins: 0, cram: 0, rescued: 0, idle: 0, moved: 0, compared: 0, viol: 0, estOk: 0, estN: 0, ms: 0, n: 0};
    for (const k of ['late', 'lateMins', 'lateDays', 'overDays', 'overMins', 'cram', 'rescued', 'idle', 'moved', 'compared', 'viol', 'estOk', 'estN', 'ms']) t[k] += r[k]; t.n++;
    console.log('  ' + sn.slice(0, 48).padEnd(50) + cn.padEnd(13) + `${String(r.late).padStart(6)}${String(r.lateMins).padStart(9)}${String(r.lateDays).padStart(10)}${String(r.overDays).padStart(10)}${String(r.overMins).padStart(9)}${String(r.cram).padStart(6)}${String(r.rescued).padStart(9)}${String(r.idle).padStart(6)}${(r.moved + '/' + r.compared).padStart(11)}${String(r.viol).padStart(6)}${(r.estOk + '/' + r.estN).padStart(7)}${String(r.ms).padStart(5)}`); }
  console.log('  ' + '-'.repeat(140));
  for (const cn in tot) { const t = tot[cn]; console.log('  ' + 'TOTAL'.padEnd(50) + cn.padEnd(13) + `${String(t.late).padStart(6)}${String(t.lateMins).padStart(9)}${String(t.lateDays).padStart(10)}${String(t.overDays).padStart(10)}${String(t.overMins).padStart(9)}${String(t.cram).padStart(6)}${String(t.rescued).padStart(9)}${String(t.idle).padStart(6)}${(t.moved + '/' + t.compared).padStart(11)}${String(t.viol).padStart(6)}${(t.estOk + '/' + t.estN).padStart(7)}${String(Math.round(t.ms / t.n * 10) / 10).padStart(5)}`); }
  const out = path.join(process.env.LMK_BENCH_OUT || os.tmpdir(), `bench-plan-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`);
  fs.writeFileSync(out, JSON.stringify({at: new Date().toISOString(), days: DAYS, tz: TZ, origin: new Date(ORIGIN).toISOString(), results}, null, 1));
  console.log('\n  late = work due in the window handed in after its due time or never · over = today\'s plan past the budget · cram = minutes on a 90+ min item on its due day');
  console.log('  rescued = due today, not in the plan, done anyway · idle = free minutes unused with work due within a week · moved = items whose first planned day changed overnight (of those compared)');
  console.log(`  JSON: ${out}`);
  const bad = Object.values(results).flatMap(x => Object.values(x)).filter(r => r.error || r.pageErrors.length);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });

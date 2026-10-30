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
   tracks. Work due today and still open, or overdue and kept, is done anyway if time remains (a "rescue" the plan did not make;
   overdue work joined the rescue on 2026-10-28 — before that the student idled beside an overdue assignment whenever the plan's
   part of it was done, which made a levelling candidate look worse for taking the small finishes away from those days).

   Candidates: tools/plan-candidates/<name>.js, plain JS evaluated in the page after the app loads. A candidate reassigns the
   planner's function declarations (computePlan, remainingMins, ...). "current" is the app as shipped. Every candidate sees the
   same world: the true minutes per item, the student's true hours and skipped days are drawn once per scenario from a seeded
   RNG, before any candidate runs.

   Assumptions, so they can be argued with: true minutes are lognormal around 1.2x the planner's default for the size (students
   underestimate; sigma 0.4); a student's true day is 0.8-1.1x the stated hours, and a skipped day is 0 with the scenario's
   probability; the student does rows in the order shown and never works past the hours they have; the estimate they confirm
   is quantised the way the live ask is (0.6x / 1x / 1.6x); the student keeps overdue work (taps "Still worth it") and takes a
   suggested head start half the time.

   Run: node tools/bench-plan.js [--only <candidate>] [--scen <substring>] [--days 28] [--tz America/New_York] [--app <url>] [--port 9334]
        [--student follows|behind|early|inconsistent|variable|ignores] [--set base|heldout|all] [--hours 1|2|3 (the student's true weekday hours)]
        (needs :8899 serving ~/lmk-web; starts and stops its own Chrome). Results: a table, and JSON in the scratchpad. */
const {execSync, spawn} = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const {CHECK} = require('./plan-rules');
const ARG = process.argv.slice(2), opt = (k, d) => { const i = ARG.indexOf(k); return i >= 0 ? ARG[i + 1] : d; };
const DAYS = +opt('--days', 28), ONLY = opt('--only', null), SCEN_F = opt('--scen', null), TZ = opt('--tz', 'America/Phoenix');
/* --app: which build to walk (default the working tree on :8899; an older build served elsewhere gives a true before/after, e.g. v77.1
   on :8904). --port: this run's Chrome debug port, so two benches can run side by side. --student: the behaviour model (below).
   --set base|heldout|all: the 11 tuning worlds, the held-out worlds (never used to pick a candidate), or both. */
const APP = opt('--app', 'http://localhost:8899/app/'), APP_PORT = new URL(APP).port || '80', PORT = +opt('--port', 9334), STUDENT = opt('--student', 'follows'), SET = opt('--set', 'base');
/* --hours <h>: the simulated student's TRUE weekday hours (weekends 1.5x), default 2 — the planner never sees it (Phase 5, 2026-10-29). The default
   student happens to have the hours the old 2 h / 3 h default assumed, which flatters any planner that fills days to 2 h; a planner with no hours in it
   has to hold up for the 1-hour student and the 3-hour student too, so a candidate is read at --hours 1, 2 and 3 before it is chosen. */
const HOURS = +opt('--hours', 2);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
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
/* Held-out worlds (2026-10-29, directive §7): never used to choose a candidate; a candidate picked on the 11 above is checked here
   afterwards, so a rule tuned to the tuning set shows up as a loss here. `changes` moves a due date mid-run (the professor's doing);
   `truth` overrides the drawn minutes (an estimate that is badly wrong). */
const HELDOUT = [
  {name: 'HO heavy semester (three bigs, twelve mediums, two quizzes a week)', items: [item(301, 'HST 102', 'Research essay', 6, {size: 'big'}), item(302, 'ECN 212', 'Term project part 1', 13, {size: 'big'}), item(303, 'PSY 101', 'Lab report', 10, {size: 'big'}), ...many(12, 1, 14, 'medium'), ...Array.from({length: 8}, (_, i) => item(320 + i, C[i % 4], `Weekly quiz ${i + 1}`, 2 + i * 3, {k: 'quiz'}))]},
  {name: 'HO light semester (one thing every three days)', items: many(9, 2, 27, 'medium')},
  {name: 'HO a professor moves two deadlines (one earlier, one later)', items: [item(401, 'ECN 212', 'Case analysis', 9, {size: 'big'}), item(402, 'PSY 101', 'Reading response 7', 6), ...many(8, 1, 14, 'medium')], changes: [{day: 3, aid: '401', d: 6}, {day: 2, aid: '402', d: 11}]},
  {name: 'HO a 6-hour assignment estimated at 45 minutes', items: [item(411, 'MAT 210', 'Assignment 4', 7, {size: 'medium'}), ...many(8, 1, 14, 'medium')], truth: {a411: 360}},
  {name: 'HO nothing is described (no type, no points, titles only)', items: [item(421, 'HST 102', 'Assignment 3', 5, {pts: 0, st: 'none'}), item(422, 'ECN 212', 'Assignment 4', 8, {pts: 0, st: 'none'}), item(423, 'PSY 101', 'Week 5', 4, {pts: 0, st: 'none'}), ...many(8, 1, 16, 'medium')], truth: {a421: 200, a422: 300}},
  {name: 'HO two surprises and a cancelled week of hours', items: many(10, 1, 14, 'medium'), later: [{day: 4, items: [item(431, 'HST 102', 'Make-up essay', 8, {size: 'big'})]}, {day: 9, items: [item(432, 'MAT 210', 'Extra credit set', 12, {size: 'medium'})]}], availDays: {5: 0, 6: 0, 7: 0}},
  {name: 'HO exam, paper and a quiz a day in the same week', items: [item(441, 'MAT 210', 'Exam 2', 7, {st: 'on_paper', h: 10}), item(442, 'HST 102', 'Position paper', 8, {size: 'big'}), ...Array.from({length: 7}, (_, i) => item(450 + i, 'PSY 101', `Daily quiz ${i + 1}`, 2 + i, {k: 'quiz'})), ...many(6, 9, 14, 'medium')], truth: {a442: 420}},
];
/* The student's behaviour (directive §7: more than one model). All draw from the world's seeded RNG after truth and hours, so the
   `follows` worlds are unchanged. follows: the plan in order, keeps overdue work, a head start half the time. behind: works only 60 % of
   the hours they have, never a head start, rescues only what is due today. early: the plan, then every head start, then the next due
   open thing until the hours are gone. inconsistent: each row with probability 0.7 (a row skipped is not done that day). variable: hours
   swing 0.2x-1.6x day to day. ignores: skips one course's rows (PSY 101) unless due today. */
const STUDENTS = {follows: {}, behind: {frac: 0.6, ahead: 0, rescueOverdue: false}, early: {ahead: 1, eager: true}, inconsistent: {rowP: 0.7}, variable: {swing: true}, ignores: {skipCourse: 'PSY 101'}};
function world(sc){
  const R = rng(hash(sc.name)), all = sc.items.concat(...(sc.later || []).map(l => l.items));
  const truth = {};
  for (const x of all) { const size = x.o.size || (/exam|midterm/i.test(x.t) ? 'big' : x.o.k === 'quiz' || x.o.k === 'discussion' ? 'quick' : /project|essay|paper|report/i.test(x.t) ? 'big' : 'medium'); truth['a' + x.aid] = Math.round(lognorm(R, SIZE_BASE[size], 0.4)); }
  Object.assign(truth, sc.truth || {});
  for (const x of all) if (/exam|midterm/i.test(x.t) && x.o.st === 'on_paper') truth['a' + x.aid] = 0;   // an exam is sat, not worked
  const av = sc.avail || {weekday: Math.round(HOURS * 60), weekend: Math.round(HOURS * 90)}, avail = [];
  for (let d = 0; d < DAYS; d++) { const dow = new Date(ORIGIN + d * 864e5).getUTCDay(); const base = dow === 0 || dow === 6 ? av.weekend : av.weekday; avail.push(R() < (sc.skipP || 0) ? 0 : Math.round(base * (0.8 + 0.3 * R()))); }
  const ahead = Array.from({length: DAYS}, () => R() < AHEAD_P);   // drawn after truth and hours, so earlier worlds are unchanged
  const M = STUDENTS[STUDENT]; if (!M) { console.log('no such student model: ' + STUDENT + ' (' + Object.keys(STUDENTS).join(', ') + ')'); process.exit(2); }
  for (const d in (sc.availDays || {})) avail[d] = sc.availDays[d];
  if (M.swing) for (let d = 0; d < DAYS; d++) avail[d] = Math.round(avail[d] * (0.2 + 1.4 * R()));
  if (M.frac) for (let d = 0; d < DAYS; d++) avail[d] = Math.round(avail[d] * M.frac);
  const rowP = Array.from({length: DAYS}, () => Array.from({length: 40}, () => R()));   // per-row draws for the inconsistent student
  return {truth, avail, ahead: M.ahead == null ? ahead : ahead.map(() => M.ahead >= 1), rowP, tracks: sc.tracks !== false, M};
}
/* ---- the student, inside the page ---- */
const SIM = `window.__simWork = function(avail, tracks, ahead, M, rowP){
  const today = startOfDay(now()), k = dayKey(today), T = window.__truth; let worked = 0, cram = 0, rescued = 0, aheadM = 0, planShort = 0, unfinished = 0, ri = 0; const done = [];
  const doPiece = (e, mins) => { const id = e.id; if (!(id in T.left)) return 0; const spend = Math.min(mins, T.left[id], avail - worked); if (spend <= 0) return 0;
    T.left[id] -= spend; worked += spend; if (tracks) { store.spent = store.spent || {}; store.spent[id] = (store.spent[id] || 0) + spend; }
    if (dayKey(e.due) === k && T.total[id] >= 90) cram += spend;
    if (T.left[id] <= 0) { const pred = learnedMins(e).mins, r = T.total[id] / pred, f = r < .8 ? .6 : r > 1.3 ? 1.6 : 1;
      store.done[e.id] = Date.now(); store.handDone = store.handDone || {}; store.handDone[e.id] = 1; markDoneToday(); recordDuration(e.id, pred * f, 'ask', pred); done.push(e.id); }
    return spend; };
  const pass = () => { const d = PLAN[k]; if (!d) return; for (const c of d.items) { if (worked >= avail) { planShort += c.mins; continue; }
    if (M.rowP != null && rowP[ri++] > M.rowP) { planShort += c.mins; continue; }   // the inconsistent student: a row skipped today
    if (M.skipCourse && !c.prep && c.e.course === M.skipCourse && dayKey(c.e.due) !== k) { planShort += c.mins; continue; }
    if (c.prep) { const m = Math.min(c.mins, avail - worked); if (m < 10) { planShort += c.mins; continue; } prepMark(c.prep.x); worked += m; continue; }
    if (store.done[c.e.id]) continue; const got = doPiece(c.e, c.mins); if (got >= c.mins && !store.done[c.e.id] && window.__confirmPart) window.__confirmPart(c); if (got < c.mins && !(c.e.id in T.left && T.left[c.e.id] <= 0)) planShort += c.mins - got; else if (got >= c.mins && c.part === c.parts && T.left[c.e.id] > 0) unfinished++; } };   // __confirmPart: a candidate's part-level confirmation (Phase 3) — the student taps it only for a planned part worked in full   // worked its last planned part in full and still open: the estimate was low
  pass();
  if (done.length && worked < avail - 15) { save(); loadData(); computeBundles(); computePlan(); pass(); }   // the app re-plans after a finish; a pulled-in piece gets done too
  if (ahead) for (const x of (AHEAD[k] || [])) { if (worked >= avail) break; if (!store.done[x.e.id]) aheadM += doPiece(x.e, x.mins); }   // a head start, taken
  for (const e of EVENTS.filter(open)) { if (worked >= avail) break; if (e.exam || e.kind === 'inclass' || e.kind === 'fyi' || store.done[e.id] || !(e.due instanceof Date) || !(dayKey(e.due) === k || (M.rescueOverdue !== false && e.due < now() && store.triaged[e.id]))) continue; rescued += doPiece(e, T.left[e.id] || 0); }   // due today, or overdue and kept: a student with time left keeps going on it
  if (M.eager) for (const e of EVENTS.filter(open).filter(e => !e.exam && e.kind !== 'inclass' && e.kind !== 'fyi' && !store.done[e.id] && e.due instanceof Date && e.due > now()).sort((a, b) => a.due - b.due)) { if (worked >= avail) break; aheadM += doPiece(e, Math.min(90, T.left[e.id] || 0)); }   // the early student: the next due thing, a part at a time
  save(); loadData(); render();
  return JSON.stringify({worked, cram, rescued, done, aheadM, planShort, unfinished});
};`;
const CLOCK = off => `(function(){ const R = Date; let off = ${off};
  class D extends R { constructor(...a){ a.length ? super(...a) : super(R.now() + off); } static now(){ return R.now() + off; } }
  window.__clockSet = ms => { off = ms - R.now(); }; window.Date = D; })()`;
function candidates(){
  const dir = path.join(__dirname, 'plan-candidates'), list = [{name: 'current', src: null}];
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()) list.push({name: f.replace(/\.js$/, ''), src: fs.readFileSync(path.join(dir, f), 'utf8')});
  const only = ONLY ? ONLY.split(',') : null; return only ? list.filter(c => only.includes(c.name) || c.name === 'current') : list;   // --only a,b runs those beside current
}
async function runOne(sc, W, cand, tab){
  const {ws} = tab, seed = Object.assign({onboarded: 1, profile: {name: 'Sam'}, ext: null, capacity: {weekday: 2, weekend: 3}}, sc.store || {});
  const s1 = await send(ws, 'Page.addScriptToEvaluateOnNewDocument', {source: `try{ if (location.port === '${APP_PORT}') { localStorage.clear(); localStorage.setItem('duenorth_v1', ${JSON.stringify(JSON.stringify(seed))}); localStorage.setItem('lmk_ai', 'off'); } }catch(_){}`});
  const s2 = await send(ws, 'Page.addScriptToEvaluateOnNewDocument', {source: CLOCK(ORIGIN - Date.now())});
  await send(ws, 'Page.navigate', {url: 'about:blank'}); await sleep(100);
  await send(ws, 'Page.navigate', {url: APP}); await sleep(2200);
  await send(ws, 'Page.removeScriptToEvaluateOnNewDocument', {identifier: s1.identifier}); await send(ws, 'Page.removeScriptToEvaluateOnNewDocument', {identifier: s2.identifier});
  const groups = sc.groups || null;
  await ev(ws, `window.postMessage({lmk:'ext-hello', version:'0.9.15'}, '*'); window.postMessage({lmk:'canvas-payload', payload:${JSON.stringify(payload(sc.items, ORIGIN - 3600e3, groups))}}, '*'); 1`); await sleep(700);
  if (cand.src) await ev(ws, cand.src + '\n; 1');
  await ev(ws, SIM + `; window.__truth = {total: ${JSON.stringify(W.truth)}, left: ${JSON.stringify(W.truth)}}; 1`);
  const days = [], later = sc.later || [], changes = sc.changes || []; let prevFirst = null, prev = null, items = sc.items.slice(); const est0 = {}, earliest = {};
  for (let d = 0; d < DAYS; d++) {
    const dayMs = ORIGIN + d * 864e5, key = new Date(dayMs - 7 * 3600e3).toISOString().slice(0, 10);   // Phoenix day key
    await ev(ws, `__clockSet(${dayMs}); 1`);
    const add = later.find(l => l.day === d), chg = changes.filter(c => c.day === d);
    if (chg.length) items = items.map(x => { const c = chg.find(c => c.aid === x.aid); return c ? item(x.aid, x.c, x.t, c.d, x.o) : x; });   // the professor moved a deadline
    if (add || chg.length) { if (add) items = items.concat(add.items); await ev(ws, `window.postMessage({lmk:'canvas-payload', payload:${JSON.stringify(payload(items, dayMs - 60e3, groups))}}, '*'); 1`); await sleep(500); }
    await ev(ws, `(() => { store.triaged = store.triaged || {}; for (const e of EVENTS) if (!store.done[e.id] && !store.dropped[e.id] && e.due instanceof Date && e.due < now() && !store.triaged[e.id]) store.triaged[e.id] = Date.now(); save(); })(); loadData(); computeBundles(); computePlan(); computeAhead(); 1`);   // overdue work is kept, as a student tapping "Still worth it" would
    const r = JSON.parse(await ev(ws, CHECK));
    const rows = (r.v.length || process.env.LMK_BENCH_ROWS) ? JSON.parse(await ev(ws, `JSON.stringify(Object.values(PLAN).filter(d => d.items.length).map(d => [d.key, d.cap, d.mins, d.items.map(c => (c.prep ? 'prep:' + c.prep.x.name + '#' + c.prep.s.n + '/' + c.prep.s.of : c.e.id + '#' + c.part + '/' + c.parts) + ':' + c.mins + (c.late ? 'L' : '') + '>' + dayKey(c.dueDay))]))`)) : null;
    const td = JSON.parse(await ev(ws, `JSON.stringify((d => ({mins: d ? d.mins : 0, cap: d ? d.cap : 0, n: d ? d.items.length : 0, offer: (AHEAD[dayKey(startOfDay(now()))] || []).map(x => x.e.id + ':' + x.mins + ':' + x.why.slice(0, 40)), pending: EVENTS.filter(open).filter(e => !e.exam && e.kind !== 'inclass' && e.kind !== 'fyi' && e.due instanceof Date && e.due > now() && e.due - now() < 7 * 864e5).length}))(PLAN[dayKey(startOfDay(now()))]))`));
    const first = {}; for (const kp in r.map) { const i = kp.split('#')[0]; if (!first[i] || r.map[kp] < first[i]) first[i] = r.map[kp]; }
    /* Phase 5 (2026-10-29, fourth directive): the plan's shape and what it rests on, read each morning. peak / mean / cv — minutes on the horizon's
       heaviest planned day, the mean over its days with work, and the spread (sd/mean): balance relative to the student's own workload, no hours.
       est — every open item's estimate the first morning it is seen (compared with the truth at the end: under / severe / over, and whether the
       estimator's own range covers it). shrunk — items the planner holds for fewer minutes than their estimate with no confirmed progress and no
       done mark: fabricated completion, which must stay 0. */
    const xt = JSON.parse(await ev(ws, `JSON.stringify((() => { const ds = Object.values(PLAN).filter(d => d.items.length).map(d => d.mins); const mean = ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : 0; const sd = ds.length ? Math.sqrt(ds.reduce((a, b) => a + (b - mean) ** 2, 0) / ds.length) : 0; const est = {}; let shrunk = 0; for (const e of EVENTS.filter(open)) { if (e.exam || e.kind === 'inclass' || e.kind === 'fyi' || !(e.due instanceof Date)) continue; const l = learnedMins(e); est[e.id] = {m: l.mins, lo: l.hint ? l.hint.lo : null, hi: l.hint ? l.hint.hi : null}; if (remainingMins(e) < l.mins && extProgress(e) == null && !store.done[e.id]) shrunk++; } return {peak: ds.length ? Math.max(...ds) : 0, mean: Math.round(mean), cv: mean ? Math.round(sd / mean * 100) / 100 : 0, est, shrunk}; })())`));
    for (const i in xt.est) if (!est0[i]) est0[i] = xt.est[i];
    for (const i in first) if (!earliest[i] || first[i] < earliest[i]) earliest[i] = first[i];
    /* Why did the plan change overnight? (2026-10-29, directive §2.) Each item whose first planned day differs from yesterday's plan is
       attributed to the day's situation, coarsely and honestly: 'new' — Canvas changed (an item arrived or a deadline moved) since
       yesterday's plan; 'behind' — the student left some of yesterday's plan undone; 'extra' — they did more than the plan (a head start,
       a rescue); 'planner' — none of the above: the same student did exactly the plan, nothing changed, and the plan still moved it. */
    /* 'unfinished' — the student worked an item's last planned part in full and it is still open (the estimate was low; the plan has to
       hold it again); 'relearn' — a finish changed what LMK expects other items to take (learnedMins), so parts were re-cut; 'done' — a
       finish, and the plan pulled work in (or let it settle); 'planner' — none of these. */
    const est = {}; for (const i in r.cum) est[i] = Object.values(r.cum[i]).reduce((a, b) => a + b, 0);
    let relearned = 0; if (prev) for (const i in est) if (prev.est[i] != null && prev.est[i] !== est[i]) relearned++;
    const cause = (add || chg.length) ? 'new' : !prev ? 'planner' : prev.planShort > 0 ? 'behind' : prev.unfinished > 0 ? 'unfinished' : (prev.aheadM > 0 || prev.rescued > 0) ? 'extra' : relearned ? 'relearn' : prev.done.length ? 'done' : 'planner';
    const CAUSES = ['new', 'behind', 'unfinished', 'extra', 'relearn', 'done', 'planner'];
    let moved = 0, compared = 0, movedLater = 0; const mv = Object.fromEntries(CAUSES.map(k => [k, 0])), mvLater = Object.fromEntries(CAUSES.map(k => [k, 0])), moves = [];
    if (prevFirst) for (const i in prevFirst) { if (!(i in first) || prevFirst[i] < key) continue; compared++; if (first[i] !== prevFirst[i]) { moved++; mv[cause]++; if (first[i] > prevFirst[i]) { movedLater++; mvLater[cause]++; } if (moves.length < 40) moves.push(i + ' ' + prevFirst[i].slice(5) + '>' + first[i].slice(5)); } }
    const w = JSON.parse(await ev(ws, `__simWork(${W.avail[d]}, ${W.tracks}, ${W.ahead[d]}, ${JSON.stringify(W.M)}, ${JSON.stringify(W.rowP[d])})`));
    for (const i of w.done) delete first[i];
    prevFirst = first; prev = Object.assign(w, {est});
    days.push({key, viol: r.v, rows, ms: r.ms, planned: td.mins, cap: td.cap, over: Math.max(0, td.mins - td.cap), overTrue: Math.max(0, td.mins - W.avail[d]), peak: xt.peak, mean: xt.mean, cv: xt.cv, shrunk: xt.shrunk, avail: W.avail[d], worked: w.worked, idle: td.pending && W.avail[d] - w.worked > 15 ? W.avail[d] - w.worked : 0, cram: w.cram, rescued: w.rescued, ahead: w.aheadM, planShort: w.planShort, offer: td.offer, moved, movedLater, compared, cause, mv, mvLater, moves, done: w.done.length});
  }
  const end = JSON.parse(await ev(ws, `JSON.stringify({done: store.done, dur: store.dur || {}})`));
  /* exam prep (2026-10-29): sessions the planner wanted for each exam inside the window vs sessions the student sat — the bench was blind
     to study until now (an exam is sat, not worked), which made 'due work first' look free when it crowded study sessions out */
  const pr = JSON.parse(await ev(ws, `JSON.stringify((() => { let want = 0, done = 0, n = 0; for (const x of examList()) { if (x.gap || !x.due) continue; const t = x.due.getTime ? x.due.getTime() : Date.parse(x.due); if (!(t >= ${ORIGIN} && t <= ${ORIGIN + DAYS * 864e5})) continue; const p = prepPlan(x); if (!p) continue; want += p.N; done += Math.min(p.N, p.done.length); n++; } return {n, want, done}; })())`));
  /* late: due inside the window, work (not an exam / in class / ungraded), finished after its due instant or never */
  const late = [], all = items; let lateMins = 0, lateDays = 0;
  for (const x of all) { if (x.d === null || x.d < 0 || x.d >= DAYS) continue; if (x.o.st === 'on_paper' || x.o.k === 'inclass' || x.o.k === 'fyi') continue; const due = Date.parse(at(x.d, x.o.h == null ? 23 : x.o.h, x.o.h == null ? 59 : 0)), t = end.done['a' + x.aid]; if (!t || t > due) { const dl = t ? Math.ceil((t - due) / 864e5) : DAYS - x.d; late.push('a' + x.aid + ' +' + dl + 'd' + (t ? '' : ' (never)')); lateMins += W.truth['a' + x.aid] || 0; lateDays += dl; } }
  let estN = 0, estOk = 0; for (const i in end.dur) for (const x of end.dur[i]) { if (!x.p) continue; estN++; if (Math.abs(x.m - x.p) / x.p <= .25 || Math.abs(x.m - x.p) <= 10) estOk++; }
  const sum = f => days.reduce((t, d) => t + f(d), 0);
  /* started too late: a thing that truly takes 3 h or more, due inside the window, whose earliest planned day was its due day or the day before */
  const dayIdx = key => Math.round((Date.parse(key + 'T16:00:00Z') - ORIGIN) / 864e5);
  let bigLate = 0, bigN = 0; for (const x of all) { const id = 'a' + x.aid, tr = W.truth[id] || 0; if (x.d === null || x.d < 0 || x.d >= DAYS || tr < 180 || x.o.st === 'on_paper') continue; bigN++; if (!earliest[id] || dayIdx(earliest[id]) >= x.d - 1) bigLate++; }
  /* the estimator against the truth, first estimate per item: under = below three quarters, SEVERE = below a third, over = above one and a half */
  let estUnder = 0, estSevere = 0, estOver = 0, estHit = 0, estCover = 0, estCoverN = 0, estItems = 0; for (const id in est0) { const tr = W.truth[id]; if (!(tr > 0)) continue; const e = est0[id]; estItems++; if (e.m < tr / 3) estSevere++; else if (e.m < tr * 0.75) estUnder++; else if (e.m > tr * 1.5) estOver++; else estHit++; if (e.lo != null) { estCoverN++; if (tr >= e.lo && tr <= e.hi) estCover++; } }
  const mvSum = f => { const o = {}; for (const k of ['new', 'behind', 'unfinished', 'extra', 'relearn', 'done', 'planner']) o[k] = sum(d => f(d)[k]); return o; };
  return {late: late.length, lateMins, lateDays, lateIds: late, prepWant: pr.want, prepDone: pr.done, exams: pr.n, overDays: days.filter(d => d.over > 0).length, overMins: sum(d => d.over), overTrueDays: days.filter(d => d.overTrue > 0).length, overTrueMins: sum(d => d.overTrue), peakMax: Math.max(0, ...days.map(d => d.peak)), peakAvg: Math.round(sum(d => d.peak) / days.length), cvAvg: Math.round(sum(d => d.cv) / days.length * 100) / 100, bigLate, bigN, estUnder, estSevere, estOver, estHit, estCover, estCoverN, estItems, shrunk: sum(d => d.shrunk), cram: sum(d => d.cram), rescued: sum(d => d.rescued), idle: sum(d => d.idle), moved: sum(d => d.moved), movedLater: sum(d => d.movedLater), compared: sum(d => d.compared), mv: mvSum(d => d.mv), mvLater: mvSum(d => d.mvLater), viol: sum(d => d.viol.length), violSample: days.flatMap(d => d.viol).slice(0, 3), violBy: days.flatMap(d => d.viol).reduce((m, s) => { const k = (s.match(/^H[0-9]+/) || ['?'])[0]; m[k] = (m[k] || 0) + 1; return m; }, {}), ms: Math.round(sum(d => d.ms) / days.length * 10) / 10, estOk, estN, done: sum(d => d.done), days};
}
(async () => {
  try { execSync('curl -sf http://localhost:8899/app/ -o /dev/null'); } catch(_) { console.log('HARNESS: nothing serves :8899 — run `cd ~/lmk-web && python3 -m http.server 8899` first'); process.exit(2); }
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'lmk-bench-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--window-size=1100,900', 'about:blank'], {stdio: 'ignore'});
  const bye = () => { try { chrome.kill(); } catch(_){} try { fs.rmSync(prof, {recursive: true, force: true}); } catch(_){} };
  process.on('exit', bye); process.on('SIGINT', () => { bye(); process.exit(2); });
  for (let i = 0; i < 60; i++) { try { execSync(`curl -sf http://localhost:${PORT}/json/version -o /dev/null`); break; } catch(_) { await sleep(150); } }
  const cands = candidates(), scen = (SET === 'heldout' ? HELDOUT : SET === 'all' ? SCEN.concat(HELDOUT) : SCEN).filter(s => !SCEN_F || s.name.includes(SCEN_F)), results = {};
  console.log(`bench-plan: ${scen.length} scenario(s) x ${cands.map(c => c.name).join(', ')} · ${DAYS} days from ${new Date(ORIGIN).toISOString().slice(0, 10)} · ${TZ} · app ${APP} · student ${STUDENT} (${HOURS} h weekdays) · set ${SET}`);
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
      process.stdout.write(`  ${sc.name.slice(0, 48).padEnd(50)} ${cand.name.padEnd(12)} ${res.error ? 'ERROR ' + res.error : `late ${res.late} (${res.lateMins}m, ${res.lateDays}d)  big-late ${res.bigLate}/${res.bigN}  over-true ${res.overTrueDays}d (${res.overTrueMins}m)  over-stated ${res.overDays}d (${res.overMins}m)  peak ${res.peakMax}/${res.peakAvg}m cv ${res.cvAvg}  est u${res.estUnder}/S${res.estSevere}/o${res.estOver} of ${res.estItems}${res.estCoverN ? ' cover ' + res.estCover + '/' + res.estCoverN : ''}  shrunk ${res.shrunk}  cram ${res.cram}m  rescued ${res.rescued}m  idle ${res.idle}m  prep ${res.prepDone}/${res.prepWant}  moved ${res.moved}/${res.compared} (${res.movedLater} later; ${Object.keys(res.mv).filter(k => res.mv[k]).map(k => k + ' ' + res.mv[k] + '/' + res.mvLater[k] + 'L').join(' ')})  viol ${res.viol}${res.viol ? ' (' + Object.entries(res.violBy).map(([k, v]) => k + ':' + v).join(' ') + ')' : ''}  est ${res.estOk}/${res.estN}  ${res.ms}ms${res.pageErrors.length ? '  PAGE ERRORS ' + res.pageErrors[0] : ''}`}\n`);
    }
  }
  /* the table: one row per scenario per candidate, then totals per candidate (peak and cv are averaged over the rows in a total) */
  const line = (r, n) => `${String(r.late).padStart(6)}${String(r.lateMins).padStart(9)}${String(r.lateDays).padStart(10)}${(r.bigLate + '/' + r.bigN).padStart(9)}${(r.overTrueDays + '/' + r.overTrueMins).padStart(17)}${(r.overDays + '/' + r.overMins).padStart(12)}${(r.peakMax + '/' + Math.round(r.peakAvg / n)).padStart(15)}${String(Math.round(r.cvAvg / n * 100) / 100).padStart(6)}${String(r.cram).padStart(6)}${String(r.idle).padStart(6)}${((r.prepDone || 0) + '/' + (r.prepWant || 0)).padStart(6)}${(r.moved + '/' + r.compared + ' (' + (r.movedLater || 0) + ')').padStart(18)}${String(r.viol).padStart(6)}${(r.estUnder + '/' + r.estSevere + '/' + r.estOver).padStart(12)}${String(r.shrunk).padStart(8)}${String(Math.round(r.ms / n * 10) / 10).padStart(5)}`;
  console.log('\n  ' + 'scenario'.padEnd(50) + 'candidate'.padEnd(13) + '  late  lateMin  lateDays  bigLate  overTrue(d/min)  overStated  peak(max/avg)    cv  cram  idle  prep  moved/cmp(later)  viol  est(u/S/o)  shrunk   ms');
  const tot = {};
  for (const sn in results) for (const cn in results[sn]) { const r = results[sn][cn]; if (r.error) continue;
    const t = tot[cn] = tot[cn] || {late: 0, lateMins: 0, lateDays: 0, overDays: 0, overMins: 0, overTrueDays: 0, overTrueMins: 0, peakMax: 0, peakAvg: 0, cvAvg: 0, bigLate: 0, bigN: 0, estUnder: 0, estSevere: 0, estOver: 0, estHit: 0, estCover: 0, estCoverN: 0, estItems: 0, shrunk: 0, cram: 0, rescued: 0, idle: 0, moved: 0, movedLater: 0, compared: 0, viol: 0, estOk: 0, estN: 0, ms: 0, prepWant: 0, prepDone: 0, n: 0, mv: {new: 0, behind: 0, unfinished: 0, extra: 0, relearn: 0, done: 0, planner: 0}, mvLater: {new: 0, behind: 0, unfinished: 0, extra: 0, relearn: 0, done: 0, planner: 0}};
    for (const k of ['late', 'lateMins', 'lateDays', 'overDays', 'overMins', 'overTrueDays', 'overTrueMins', 'peakAvg', 'cvAvg', 'bigLate', 'bigN', 'estUnder', 'estSevere', 'estOver', 'estHit', 'estCover', 'estCoverN', 'estItems', 'shrunk', 'cram', 'rescued', 'idle', 'moved', 'movedLater', 'compared', 'viol', 'estOk', 'estN', 'ms', 'prepWant', 'prepDone']) t[k] += r[k] || 0; t.peakMax = Math.max(t.peakMax, r.peakMax || 0); t.n++;
    for (const k in t.mv) { t.mv[k] += r.mv[k]; t.mvLater[k] += r.mvLater[k]; }
    console.log('  ' + sn.slice(0, 48).padEnd(50) + cn.padEnd(13) + line(r, 1)); }
  console.log('  ' + '-'.repeat(140));
  for (const cn in tot) { const t = tot[cn]; console.log('  ' + 'TOTAL'.padEnd(50) + cn.padEnd(13) + line(t, t.n)); }
  console.log('\n  why the plan moved overnight (items whose first day changed; in brackets, moved LATER): new = Canvas changed · behind = yesterday\'s plan left undone · unfinished = worked its planned minutes, still open (estimate low) · extra = did more than the plan · relearn = a finish changed other estimates · done = a finish, pull-ins · planner = same student did the plan, nothing new, and it still moved');
  for (const cn in tot) { const t = tot[cn]; console.log('  ' + cn.padEnd(13) + Object.keys(t.mv).map(k => `${k} ${t.mv[k]} (${t.mvLater[k]})`).join('   ')); }
  const out = path.join(process.env.LMK_BENCH_OUT || os.tmpdir(), `bench-plan-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`);
  fs.writeFileSync(out, JSON.stringify({at: new Date().toISOString(), days: DAYS, tz: TZ, origin: new Date(ORIGIN).toISOString(), app: APP, student: STUDENT, hours: HOURS, set: SET, results}, null, 1));
  console.log('\n  late = work due in the window handed in after its due time or never · bigLate = things that truly take 3 h+ whose earliest planned day was the due day or the day before · overTrue = today\'s plan past the minutes the simulated student truly has (an outcome measure, never a planner input) · overStated = past the 2 h / 3 h hours the seed states (legacy: the product no longer plans to hours) · peak = the heaviest planned day in view (max over mornings / mean) · cv = spread of the planned days (sd/mean) · est = first estimates under / SEVERELY under / over the truth · shrunk = items held for fewer minutes than estimated with no confirmed progress (must be 0) · cram = minutes on a 90+ min item on its due day');
  console.log('  rescued = due today or overdue, beyond the plan, done anyway · prep = study sessions sat / wanted for the exams in the window · idle = free minutes unused with work due within a week · moved = items whose first planned day changed overnight (of those compared; in brackets, how many moved LATER — earlier is the plan pulling work in as things get done, later is work slipping)');
  console.log(`  JSON: ${out}`);
  const bad = Object.values(results).flatMap(x => Object.values(x)).filter(r => r.error || r.pageErrors.length);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });

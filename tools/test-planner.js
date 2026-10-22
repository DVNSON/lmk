/* The planner, as a whole: made-up semesters through the real computePlan, checked for the rules it must never break and
   measured for how good the plan is. Every feature has its own suite; this one watches the plan itself (v76.2, after the
   "LMK Intelligence" handoff asked for a baseline before any AI touches planning).
   Hard rules, in every scenario (any break fails the suite):
     H1 nothing lands after its due day (a study session after its exam)      H2 nothing before the LMS opens it
     H3 nothing done, dropped, an exam, in class or ungraded becomes work     H4 a day goes over budget only with work due THAT day
     H5 overdue work joins only once the student kept it                     H6 one part of a thing a day, unless it is due that day
     H7 nothing due inside the 14 days is silently left unplanned             H8 today never holds more than the time left in it
     H9 finishing one thing never pushes other work LATER: by any day, each other item has at least as many minutes planned
        as before (pieces may swap labels; the work done by a date may only grow)        H10 an item's parts are numbered in date order
   Measured, printed as a table: pieces, overloaded days and minutes over, night-before cramming (a split item finishing
   on its due day), and the planner's time. The whole bank runs twice: in Phoenix (no clock change) and in New York (a
   clock change whenever one falls inside the window).
   Run: node tools/test-planner.js   (needs :8899 serving ~/lmk-web and one headless Chrome on :9333) */
const {execSync} = require('child_process');
let pass = 0, fail = 0; const check = (n, ok, d) => { console.log((ok ? 'ok   ' : 'FAIL ') + n + (ok ? '' : '  -> ' + (d === undefined ? '' : JSON.stringify(d)).slice(0, 400))); ok ? pass++ : fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let id = 0;
const send = (ws, m, p = {}) => new Promise(r => { const mid = ++id; const h = e => { const x = JSON.parse(e.data); if (x.id === mid) { ws.removeEventListener('message', h); r(x.result); } }; ws.addEventListener('message', h); ws.send(JSON.stringify({id: mid, method: m, params: p})); });
const ev = (ws, e) => send(ws, 'Runtime.evaluate', {expression: e, returnByValue: true, awaitPromise: true}).then(r => r && r.result ? r.result.value : (r && r.exceptionDetails ? 'EXC ' + JSON.stringify(r.exceptionDetails).slice(0, 400) : undefined));

const at = (days, h = 23, m = 59) => { const d = new Date(); d.setHours(h, m, 0, 0); d.setDate(d.getDate() + days); return d.toISOString(); };
const C = ['ECN 212', 'PSY 101', 'MAT 210', 'HST 102'], CID = {'ECN 212': '1', 'PSY 101': '2', 'MAT 210': '3', 'HST 102': '4'};
function world(list, extra = {}){   // list: [aid, course, title, dueInDays, {size, k, st, open, h}]
  const items = {}, effortOv = {};
  for (const [aid, c, t, d, o = {}] of list) {
    items[aid] = {t, c, cid: CID[c], due: d === null ? '' : at(d, o.h == null ? 23 : o.h, o.h == null ? 59 : 0), pts: 10, st: o.st || 'online_upload', grp: 'g', k: o.k || '', sub: '', score: null, url: '', desc: '', rub: '', fb: '', open: o.open == null ? '' : at(o.open, 0, 1), lock: ''};
    if (o.size) effortOv['a' + aid] = o.size;
  }
  return {payload: {lmk: 'canvas', v: 3, at: Date.now(), host: 'canvas.asu.edu', items, groups: {}, ann: [], courses: C.map(c => ({id: CID[c], tag: c, wt: false}))},
          store: Object.assign({onboarded: 1, profile: {name: 'Sam'}, ext: null, capacity: {weekday: 2, weekend: 3}, effortOv}, extra)};
}
const many = (n, from, span, size) => Array.from({length: n}, (_, i) => [String(500 + i), C[i % 4], `Problem set ${i + 1}`, from + (i % span), {size}]);
const SCEN = [
  ['light week', world([['11', 'ECN 212', 'Problem set 4', 2], ['12', 'PSY 101', 'Reading response', 4], ['13', 'MAT 210', 'Homework 5.1', 5], ['14', 'HST 102', 'Discussion post', 6, {k: 'discussion'}], ['15', 'ECN 212', 'Problem set 5', 9]])],
  ['dense week (more work than hours)', world(many(12, 1, 4, 'big'))],
  ['weekend off (0 hours Saturday and Sunday)', Object.assign(world(many(6, 1, 9, 'medium')), {}), {capacity: {weekday: 2, weekend: 0}}],
  ['opens in 3 days, due in 6', world([['21', 'MAT 210', 'Lab 3 report', 6, {size: 'big', open: 3}], ['22', 'ECN 212', 'Problem set 6', 7]])],
  ['done, dropped, overdue kept and not', world([['31', 'ECN 212', 'Problem set 7', 3], ['32', 'PSY 101', 'Quiz prep sheet', 4], ['33', 'MAT 210', 'Homework 4.4', -2, {size: 'medium'}], ['34', 'HST 102', 'Response 3', -3]]), {done: {a31: Date.now() - 864e5}, dropped: {a32: Date.now()}, triaged: {a33: Date.now()}}],
  ['an exam with study, and homework before it', world([['41', 'PSY 101', 'Exam 2', 6, {st: 'on_paper', h: 9}], ['42', 'PSY 101', 'Chapter 7 homework', 4], ['43', 'ECN 212', 'Problem set 8', 5]])],
  ['in class and ungraded items', world([['51', 'WPC 101'.slice(0, 0) + 'HST 102', 'Week 9 Attendance', 2, {k: 'inclass', st: 'none'}], ['52', 'MAT 210', 'Optional practice', 3, {k: 'fyi'}], ['53', 'ECN 212', 'Problem set 9', 3]])],
  ['a long project (10 hours, due in 10 days)', world([['61', 'HST 102', 'Final research paper', 10, {size: 'big'}], ['62', 'ECN 212', 'Problem set 10', 4]]), {effortOv: {a61: 'big'}, dur: {a61: [{m: 600, src: 'manual', at: Date.now() - 864e5}]}}],
  ['a day kept free (capOv 0 tomorrow)', world(many(5, 1, 5, 'medium')), {}],
  ['due later today', world([['71', 'MAT 210', 'Quick quiz', 0, {size: 'quick', h: 23}], ['72', 'ECN 212', 'Problem set 11', 0, {size: 'medium', h: 23}]])],
  ['150 assignments (speed)', world(many(150, 0, 40, 'medium'))],
];
// the free day needs its own capOv (tomorrow's key, in the page's own time zone): set in the page before computePlan
const FREE_DAY = 'a day kept free (capOv 0 tomorrow)';
const CHECK = `(function(){
  const t0 = performance.now(); computePlan(); const ms = performance.now() - t0;
  const days = Object.values(PLAN).sort((a, b) => a.date - b.date), v = [], today = startOfDay(now()), end = addDays(today, HORIZON);
  const all = []; days.forEach(d => d.items.forEach(c => all.push([d, c])));
  for (const [d, c] of all) {
    const e = c.e, id = e.id;
    if (c.prep) { if (d.date > startOfDay(c.prep.x.due)) v.push('H1 study after its exam: ' + id + ' on ' + d.key); continue; }
    if (store.done[id]) v.push('H3 done work planned: ' + id);
    if (store.dropped[id]) v.push('H3 dropped work planned: ' + id);
    if (e.exam || e.kind === 'inclass' || e.kind === 'fyi') v.push('H3 not work, planned: ' + id + ' (' + (e.exam ? 'exam' : e.kind) + ')');
    if (!c.late && d.date > startOfDay(e.due)) v.push('H1 after its due day: ' + id + ' on ' + d.key);
    const op = opensAt(e); if (op && d.date < startOfDay(op)) v.push('H2 before it opens: ' + id + ' on ' + d.key);
    if (c.late && !store.triaged[id]) v.push('H5 overdue work planned without being kept: ' + id);
  }
  for (const d of days) {
    const must = d.items.filter(c => !c.late && !c.prep && startOfDay(c.e.due).getTime() === d.date.getTime());
    const rest = d.mins - must.reduce((s, c) => s + c.mins, 0);
    if (rest > d.cap) v.push('H4 over budget with work not due that day: ' + d.key + ' ' + d.mins + '/' + d.cap);
    const ids = d.items.filter(c => !must.includes(c)).map(c => c.grp || c.e.id);
    if (new Set(ids).size !== ids.length) v.push('H6 two parts of one thing on one day: ' + d.key);
  }
  const lost = [];
  EVENTS.filter(open).filter(e => e.kind !== 'inclass' && e.kind !== 'fyi' && !e.exam && e.due >= now() && startOfDay(e.due) <= end && !store.done[e.id] && !store.dropped[e.id]).forEach(e => {
    const placed = all.filter(([d, c]) => !c.prep && c.e.id === e.id).reduce((s, [d, c]) => s + c.mins, 0);
    if (placed < remainingMins(e)) lost.push(e.id + ' ' + placed + '/' + remainingMins(e));
  });
  if (lost.length) v.push('H7 due in the window but not fully planned: ' + lost.join(', '));
  const td = PLAN[dayKey(today)]; if (td && td.cap > Math.ceil((addDays(today, 1) - now()) / 6e4) + 1) v.push('H8 today holds ' + td.cap + ' min, more than is left of it');
  const overDays = days.filter(d => d.mins > d.cap);
  const night = new Set(all.filter(([d, c]) => !c.late && !c.prep && c.parts > 1 && startOfDay(c.e.due).getTime() === d.date.getTime() && days.some(x => x.date < d.date && x.date >= startOfDay(c.release) && x.mins + c.mins <= x.cap)).map(([d, c]) => c.e.id)).size;
  const order = {}; for (const [d, c] of all) if (!c.prep && c.parts > 1) (order[c.e.id] = order[c.e.id] || []).push([d.key, c.part]);
  for (const id in order) { const p = order[id].sort((a, b) => a[0].localeCompare(b[0])).map(x => x[1]); if (p.some((x, i) => i && x < p[i - 1])) v.push('H10 parts out of order by date: ' + id + ' ' + JSON.stringify(order[id])); }
  const cum = {}; for (const [d, c] of all) if (!c.prep) (cum[c.e.id] = cum[c.e.id] || {})[d.key] = ((cum[c.e.id] || {})[d.key] || 0) + c.mins;
  return JSON.stringify({v, cum, ms: Math.round(ms * 10) / 10, chunks: all.length, prep: all.filter(([d, c]) => c.prep).length, overDays: overDays.length, overMins: overDays.reduce((s, d) => s + d.mins - d.cap, 0), night,
    map: Object.fromEntries(all.filter(([d, c]) => !c.prep).map(([d, c]) => [c.e.id + '#' + c.part, d.key]))});
})()`;

(async () => {
  const t = JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
  await send(ws, 'Page.enable'); await send(ws, 'Runtime.enable'); await send(ws, 'Network.setCacheDisabled', {cacheDisabled: true});
  const errs = []; ws.addEventListener('message', e => { const x = JSON.parse(e.data); if (x.method === 'Runtime.exceptionThrown') errs.push(x.params.exceptionDetails.exception ? x.params.exceptionDetails.exception.description : x.params.exceptionDetails.text); });
  await send(ws, 'Emulation.setDeviceMetricsOverride', {width: 1100, height: 900, deviceScaleFactor: 1, mobile: false});
  const rows = [];
  for (const tz of ['America/Phoenix', 'America/New_York']) {
    await send(ws, 'Emulation.setTimezoneOverride', {timezoneId: tz});
    for (const [name, w, extra] of SCEN) {
      const seed = Object.assign({}, w.store, extra || {});
      const s = `try{ if (location.port==='8899') { localStorage.clear(); localStorage.setItem('duenorth_v1', ${JSON.stringify(JSON.stringify(seed))}); localStorage.setItem('lmk_ai','off'); } }catch(_){}`;
      const {identifier} = await send(ws, 'Page.addScriptToEvaluateOnNewDocument', {source: s});
      await send(ws, 'Page.navigate', {url: 'about:blank'}); await sleep(120); await send(ws, 'Page.navigate', {url: 'http://localhost:8899/app/'}); await sleep(2300);
      await send(ws, 'Page.removeScriptToEvaluateOnNewDocument', {identifier});
      await ev(ws, `window.postMessage({lmk:'ext-hello', version:'0.9.13'}, '*'); window.postMessage({lmk:'canvas-payload', payload:${JSON.stringify(w.payload)}}, '*'); 1`); await sleep(900);
      if (name === FREE_DAY) await ev(ws, `store.capOv = {[dayKey(addDays(startOfDay(now()), 1))]: 0}; save(); loadData(); 1`);
      const r = JSON.parse(await ev(ws, CHECK));
      const tag = `[${tz.split('/')[1]}] ${name}`;
      check(`${tag}: no hard rule broken (${r.chunks} pieces${r.prep ? `, ${r.prep} study sessions` : ''})`, r.v.length === 0, r.v.slice(0, 4));
      rows.push([tz.split('/')[1], name, r.chunks, r.overDays, r.overMins, r.night, r.ms]);
      // scenario-specific expectations
      if (name === FREE_DAY) { const k = JSON.parse(await ev(ws, `JSON.stringify((PLAN[dayKey(addDays(startOfDay(now()), 1))] || {items: []}).items.filter(c => !(startOfDay(c.e.due).getTime() === addDays(startOfDay(now()), 1).getTime())).length)`)); check(`${tag}: the free day holds nothing that is not due that day`, k === 0, k); }
      if (name.startsWith('weekend off')) { const wk = JSON.parse(await ev(ws, `JSON.stringify(Object.values(PLAN).filter(d => (d.date.getDay() === 0 || d.date.getDay() === 6) && d.items.some(c => startOfDay(c.e.due).getTime() !== d.date.getTime())).map(d => d.key))`)); check(`${tag}: nothing is planned on a 0-hour weekend day unless it is due then`, wk.length === 0, wk); }
      if (name.startsWith('an exam')) check(`${tag}: the exam gets study sessions, not a work item`, r.prep > 0 && !Object.keys(r.map).some(k => k.startsWith('a41#')), {prep: r.prep, map: r.map});
      if (name.startsWith('done, dropped')) check(`${tag}: the kept overdue item is planned from today; the one not kept is not`, Object.keys(r.map).some(k => k.startsWith('a33#')) && !Object.keys(r.map).some(k => k.startsWith('a34#')), r.map);
      if (name.startsWith('a long project')) check(`${tag}: a 10-hour project is split into parts, one a day, all before it is due`, Object.keys(r.map).filter(k => k.startsWith('a61#')).length >= 5 && new Set(Object.entries(r.map).filter(([k]) => k.startsWith('a61#')).map(([, d]) => d)).size === Object.keys(r.map).filter(k => k.startsWith('a61#')).length, r.map);
      if (name.startsWith('150')) check(`${tag}: the planner takes under 150 ms for 150 assignments (${r.ms} ms)`, r.ms < 150, r.ms);
      if (name.startsWith('dense week')) {   // H9: finishing one thing never pushes other work later
        const before = r.map, first = Object.keys(before).sort((a, b) => before[a].localeCompare(before[b]))[0].split('#')[0];
        await ev(ws, `store.done['${first}'] = Date.now(); store.handDone = store.handDone || {}; store.handDone['${first}'] = 1; save(); loadData(); 1`);
        const after = JSON.parse(await ev(ws, CHECK));
        const keys = [...new Set(Object.values(before).concat(Object.values(after.map)))].sort(), later = [];
        for (const id in r.cum) { if (id === first) continue; let a = 0, b = 0; for (const k of keys) { b += (r.cum[id] || {})[k] || 0; a += (after.cum[id] || {})[k] || 0; if (a < b) { later.push(id + ' by ' + k + ': ' + a + ' of ' + b + ' min'); break; } } }
        const moved = Object.keys(after.map).filter(k => before[k] && after.map[k] !== before[k]).length;
        check(`${tag}: finishing one thing pushes no other work later (H9); ${moved} piece${moved === 1 ? '' : 's'} changed day`, later.length === 0 && after.v.length === 0, {later, v: after.v});
      }
    }
  }
  console.log('\n  zone      scenario                                     pieces  over-days  over-min  night-before  ms');
  for (const [z, n, c, od, om, nb, ms] of rows) console.log(`  ${z.padEnd(9)} ${n.padEnd(44)} ${String(c).padStart(6)} ${String(od).padStart(10)} ${String(om).padStart(9)} ${String(nb).padStart(13)} ${String(ms).padStart(5)}`);
  check('JS errors during run: none', errs.length === 0, errs.slice(0, 3));
  console.log(fail ? `\n${fail} FAILED  (${pass} passed)` : `\nALL OK  (${pass} passed)`);
  ws.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });

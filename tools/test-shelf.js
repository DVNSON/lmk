/* The no-date shelf, placed (v76.1): LMK's own rules guess when undated work was due, Chrome's built-in AI finds what the rules
   cannot, and LMK checks the AI's answer. Made-up courses, never a real student's data; every date is built from this week's
   Monday, so the suite passes on any day.
   - MAT: a schedule with an exam week and a break, the shape of a real MAT 210 syllabus. GW 1–7 came a week apart, which once
     put GW 8 a week early; the schedule row is the truth. Quizzes have no dated siblings at all.
   - WPC: "Week N Attendance" beside dated "Guided Notes Week N".
   - CHM: a syllabus that names work differently from Canvas, for the AI ("Lab 4: acid-base titration (lab report due Friday)").
   Run: node tools/test-shelf.js   (the browser half needs :8899 serving ~/lmk-web and one headless Chrome on :9333) */
const {execSync} = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
let pass = 0, fail = 0; const check = (n, ok, d) => { console.log((ok ? 'ok   ' : 'FAIL ') + n + (ok ? '' : '  -> ' + (d === undefined ? '' : JSON.stringify(d)).slice(0, 300))); ok ? pass++ : fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MON = (() => { const d = new Date(); d.setHours(0, 30, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; })();
const day = (n, h = 23, m = 59) => { const d = new Date(MON); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d; };
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const md = n => { const d = day(n); return `${MO[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`; };
const row = (wk, n) => `${wk} | ${md(n)} – ${md(n + 4)}\n(Mon – Fri)`;   // a schedule row: Monday to Friday
/* MAT: weeks run from 6 weeks ago; week 9 is THIS week (MON); exam 2 is this Monday; GW 8 is next week, after the break */
const MAT_SYL = ['Course policies. Quizzes are given in class.', 'Exam 1 | ' + WD[day(-35).getDay()] + ', ' + md(-35) + 'th | Exam 1 covers Module 1 and 2', 'Exam 2 | Monday, ' + md(0) + 'th | Exam 2 covers Module 3 and 4',
  'Week | Dates | Topics covered | Tests and Breaks dates',
  row(3, -42), '1.2 – 1.4 | GW 1 (covers 1.1 - 1.2)', 'Quiz 1 (covers 1.1 - 1.2)',
  row(4, -35), '| Exam #1 (1.1-2.3)', 'GW 2 (covers 2.1-2.3)',
  row(5, -28), 'GW 3 (covers 3.1)', 'Quiz 3 (covers 2.1-2.3)',
  row(6, -21), 'GW 4 (covers 3.2)', 'Quiz 4 (covers 3.1)',
  row(7, -14), 'GW 5 (covers 3.3)',
  row(8, -7), 'Review for Exam 2 | Fall Break ' + md(-7) + '-' + day(-6).getDate(), '–No Classes', 'Quiz 7 (covers 3.3)',
  row(9, 0), '5.1', '| Exam #2 (3.1-4.4)',
  row(10, 7), '5.2 - 5.3', '| GW 8 (covers 5.1-5.3)',
  row(11, 14), 'Quiz 8 (covers 5.1-5.3)', 'GW 9 (covers 6.1-6.2)'].join('\n');
const CHM_SYL = ['Chemistry 113 syllabus.', 'Lab reports are due the Friday of their lab week. Lab 4 safety goggles are required.',
  'Week | Dates | Topics | What is due', row(9, 0), 'Acids and bases', 'Lab 4: acid-base titration (lab report due Friday)',
  row(10, 7), 'Buffers', 'Second reflection essay due in class', row(11, 14), 'PS 7 due Wednesday'].join('\n');
const IT = {}, mk = (aid, c, cid, t, due, x = {}) => IT[aid] = Object.assign({t, c, cid, due: due ? due.toISOString() : '', pts: 10, st: 'online_upload', grp: 'g', k: '', sub: '', score: null, url: 'https://canvas.asu.edu/courses/' + cid + '/assignments/' + aid, desc: '', rub: '', fb: '', lock: '', open: ''}, x);
// MAT: GW 1-5 dated a week apart (Wednesdays of weeks 3-7); GW 6/7 never existed in this course; GW 8/9 and the quizzes undated
[[1, -40], [2, -33], [3, -26], [4, -19], [5, -12]].forEach(([n, d]) => mk('70' + n, 'MAT 210', '500', 'GW ' + n, day(d), {sub: 'graded', score: 9, subAt: day(d - 1).toISOString()}));
mk('718', 'MAT 210', '500', 'GW 8', null); mk('719', 'MAT 210', '500', 'GW 9', null);
mk('731', 'MAT 210', '500', 'Quiz 7', null, {st: 'on_paper', k: 'inclass', sub: 'graded'}); mk('738', 'MAT 210', '500', 'Quiz 8', null, {st: 'on_paper', k: 'inclass'});
mk('740', 'MAT 210', '500', 'Exam 2', null, {st: 'on_paper', k: 'inclass'}); mk('741', 'MAT 210', '500', 'GW 3b', null);
mk('742', 'MAT 210', '500', 'Take-Home assignment', null);
mk('743', 'MAT 210', '500', 'Old worksheet', null, {lock: day(-3, 12, 0).toISOString()});
// WPC: dated Guided Notes Week 1..10 (Sundays), attendance undated
for (let w = 1; w <= 10; w++) mk('80' + String(w).padStart(2, '0'), 'WPC 101', '600', 'Guided Notes Week ' + w, day(-56 + w * 7 - 1), w < 9 ? {sub: 'graded', score: 12, subAt: day(-58 + w * 7).toISOString()} : {});
mk('851', 'WPC 101', '600', 'Week 2 Attendance', null, {st: 'none', k: 'inclass'}); mk('859', 'WPC 101', '600', 'Week 10 Attendance', null, {st: 'none', k: 'inclass'});
// CHM: fuzzy names for the AI
mk('901', 'CHM 113', '700', 'Lab Report 4: Titration', null); mk('902', 'CHM 113', '700', 'Reflection Paper 2', null);
mk('903', 'CHM 113', '700', 'Problem Set 7', null); mk('904', 'CHM 113', '700', 'Lab Safety Quiz', null);
mk('905', 'CHM 113', '700', 'Problem Set 6', day(5));
// review cases (v76.1): a running score from an external tool, a placeholder zero, and a course with no syllabus yet
mk('745', 'MAT 210', '500', 'Edfinity Bonus Set', null, {st: 'external_tool', sub: 'graded', score: 5, pts: 10});
mk('746', 'MAT 210', '500', 'Participation Check', null, {sub: 'graded', score: 0});
mk('951', 'FMS 265', '800', 'Final Project', null);
const PAYLOAD = {lmk: 'canvas', v: 3, at: Date.now(), host: 'canvas.asu.edu', items: IT, groups: {}, ann: [],
  courses: [{id: '500', tag: 'MAT 210', wt: false, syl: '', sylDoc: MAT_SYL}, {id: '600', tag: 'WPC 101', wt: false, syl: ''}, {id: '700', tag: 'CHM 113', wt: false, syl: CHM_SYL}, {id: '800', tag: 'FMS 265', wt: false, syl: ''}]};

// ===== the rules and the AI check, in node against the shipped source =====
const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
const grab = name => { const i = src.indexOf('function ' + name + '('); if (i < 0) throw new Error('no function ' + name); let d = 0, st = false; for (let j = i; j < src.length; j++) { const c = src[j]; if (c === '{') { d++; st = true; } else if (c === '}') { d--; if (st && !d) return src.slice(i, j + 1); } } };
const line = re => { const m = src.match(re); if (!m) throw new Error('no ' + re); return m[0]; };
const S = new Function([line(/^const ANN_MON = .*$/m), line(/^const ANN_MONTH = .*$/m), line(/^const ANN_WDAY = .*$/m), line(/^const ANN_STOP = .*$/m), line(/^const SHELF_PAST = .*$/m), line(/^const shelfApart = .*$/m), line(/^const SHELF_NORM = .*$/m), line(/^const SHELF_ORD = .*$/m),
  "const FMT_DAY = new Intl.DateTimeFormat('en-US',{weekday:'short', month:'short', day:'numeric'});", ...['dayKey', 'annNorm', 'extInProgress', 'shelfNum', 'shelfWeek', 'shelfStem', 'sylDates', 'shelfFit', 'shelfStemLike', 'shelfLines', 'shelfNamer', 'shelfNamed', 'shelfRow', 'shelfUnder', 'shelfRule', 'shelfRuled', 'shelfAiNamed', 'shelfExcerpt', 'shelfPrompt', 'shelfAiVerify'].map(grab),
  'return {shelfRuled, shelfFit, shelfExcerpt, shelfPrompt, shelfAiVerify, shelfNamed, shelfAiNamed, shelfRow};'].join('\n'))();
const now = Date.now();
const ctxFor = (c, x) => { const co = PAYLOAD.courses.find(k => k.tag === c); return {now, lms: 'Canvas', item: x, syl: [co.syl || '', co.sylDoc || ''].join('\n'), events: Object.values(IT).filter(y => y.c === c && y.due).map(y => ({title: y.t, due: Date.parse(y.due)}))}; };
const guess = aid => S.shelfRuled({title: IT[aid].t}, ctxFor(IT[aid].c, IT[aid]));
const fmt = t => t ? new Date(t).toString().slice(0, 21) : 'null';
{ let g = guess('718');
  check('S1 GW 8 falls in its schedule week, next week (not a week after GW 5, where the GW rhythm points)', g && g.src === 'schedule' && g.due === day(11).getTime() && !(g.due < now), g && [g.src, fmt(g.due)]);
  g = guess('738'); check('S1 Quiz 8 (no dated quiz anywhere) takes its schedule row: the week after next', g && g.due === day(18).getTime(), g && fmt(g.due));
  g = guess('740'); check('S1 Exam 2: the line that starts with it ("Exam 2 | Monday …") beats "Review for Exam 2 | Fall Break …"', g && g.src === 'syllabus' && new Date(g.due).toDateString() === day(0).toDateString(), g && [g.src, fmt(g.due)]);
  g = guess('731'); check('S1 Quiz 7, graded on Canvas: over, with the schedule week and "Canvas shows it graded"', g && g.done && /graded/.test(g.why) && g.due === day(-3).getTime(), g);
  g = guess('743'); check('S2 a lock date that passed: closed, a fact', g && g.src === 'lock' && g.fact && g.due === day(-3, 12, 0).getTime(), g);
  g = guess('742'); check('S2 the Take-Home assignment: nothing to go on, so no guess', g === null, g);
  g = guess('851'); check('S3 Week 2 Attendance: with Guided Notes Week 2, over', g && g.src === 'week' && g.week && g.due < now, g && [g.src, fmt(g.due)]);
  g = guess('859'); check('S3 Week 10 Attendance: with Guided Notes Week 10, ahead', g && g.src === 'week' && g.due === day(13).getTime(), g && fmt(g.due));
  const pts = [[1, 0], [2, 7], [3, 14], [5, 28]].map(([k, d]) => [k, day(d).getTime()]);
  check('S4 a series fills a GAP between known numbers (4 between 3 and 5)', (S.shelfFit(pts, 4) || {}).t === day(21).getTime(), S.shelfFit(pts, 4));
  check('S4 a series never runs past its last known number (6 after 5: the real GW 8 came after a break)', S.shelfFit(pts, 6) === null && S.shelfFit(pts, 0) === null, S.shelfFit(pts, 6));
  g = guess('745'); check('S6 an external tool\'s running score (5 of 10, nothing handed in) is work in progress, never "over"', !g || !g.done, g);
  g = guess('746'); check('S6 a placeholder zero (graded 0, nothing handed in) is no evidence it happened', !g || !g.done, g);
  check('S6 a numbered policy line ("3) Late work by Oct 5") is not a schedule row; a table row and "Week 3:" are', S.shelfRow('3) Late work by Oct 5', now) === null && S.shelfRow('3 | Oct 05', now) !== null && S.shelfRow('Week 3: Oct 05', now) !== null);
  g = guess('903'); check('S5 "Problem Set 7" is named by initials, "PS 7 due Wednesday": its schedule week', g && g.src === 'schedule' && g.due === day(18).getTime(), g && [g.src, fmt(g.due)]);
  check('S5 the rules cannot place "Lab Report 4: Titration" (its line says "Lab 4"): that is the AI\'s job', guess('901') === null && guess('902') === null && guess('904') === null, [guess('901'), guess('902'), guess('904')]);
}
// the AI's answer is a line number; LMK checks the line and takes the date from the row above it
{ const chm = PAYLOAD.courses[2].syl, ex = S.shelfExcerpt(chm, now), items = [{id: 'x901', title: 'Lab Report 4: Titration'}, {id: 'x902', title: 'Reflection Paper 2'}, {id: 'x904', title: 'Lab Safety Quiz'}];
  const L = s => { const i = chm.split('\n').findIndex(l => l.includes(s)); return i + 1; };
  const p = S.shelfPrompt('CHM 113', items, ex);
  check('A0 the prompt numbers the syllabus lines and the undated work, and asks for a line number, never a date', /L[0-9]+: Lab 4: acid-base titration/.test(p) && /1\. Lab Report 4: Titration/.test(p) && /return item and line/.test(p), p.slice(0, 200));
  const right = S.shelfAiVerify(items, ex, JSON.stringify({items: [{item: 1, line: L('acid-base titration')}, {item: 2, line: L('Second reflection')}, {item: 3, line: 0}]}), chm, now);
  check('A1 "Lab Report 4: Titration" → the "Lab 4: acid-base titration (lab report due Friday)" line: accepted, dated by its row (this week)', right.x901 && right.x901.due === day(4).getTime() && right.x901.week, right.x901);
  check('A1 "Reflection Paper 2" → "Second reflection essay due in class": accepted ("second" is 2), next week', right.x902 && right.x902.due === day(11).getTime(), right.x902);
  check('A1 an item the model left at 0 stays unplaced', !right.x904, right.x904);
  const wrong = S.shelfAiVerify(items, ex, JSON.stringify({items: [{item: 3, line: L('acid-base titration')}, {item: 2, line: L('PS 7')}, {item: 1, line: L('safety goggles')}]}), chm, now);
  check('A2 the model pinning "Lab Safety Quiz" on the titration line is refused (most of its words are not there)', !wrong.x904, wrong.x904);
  check('A2 "Reflection Paper 2" on the "PS 7" line is refused (no 2, no reflection)', !wrong.x902, wrong.x902);
  check('A2 "Lab Report 4" on a policy line with no schedule row above it is refused', !wrong.x901, wrong.x901);
  const odd = S.shelfAiVerify(items, ex, JSON.stringify({items: [{item: 1, line: 999}, {item: 9, line: 3}, {item: 1, line: -2}], date: '2026-10-30'}), chm, now);
  check('A3 a line number outside the excerpt, an unknown item, or any date the model adds: nothing taken', Object.keys(odd).length === 0, odd);
  check('A3 a broken answer is no answer', Object.keys(S.shelfAiVerify(items, ex, 'not json', chm, now)).length === 0);
}

// ===== the browser half =====
let id = 0;
const send = (ws, m, p = {}) => new Promise(r => { const mid = ++id; const h = e => { const x = JSON.parse(e.data); if (x.id === mid) { ws.removeEventListener('message', h); r(x.result); } }; ws.addEventListener('message', h); ws.send(JSON.stringify({id: mid, method: m, params: p})); });
const ev = (ws, e) => send(ws, 'Runtime.evaluate', {expression: e, returnByValue: true, awaitPromise: true}).then(r => r && r.result ? r.result.value : (r && r.exceptionDetails ? 'EXC ' + JSON.stringify(r.exceptionDetails).slice(0, 300) : undefined));
/* Chrome's model, replaced: it answers the CHM shelf prompt with line numbers found by text, one of them wrong on purpose */
const STUB = `(function(){ if (location.protocol !== 'http:') return; let mode = 'none'; try { mode = localStorage.getItem('__ai') || 'none'; } catch (_) {}
  if (mode === 'none') { try { Object.defineProperty(window, 'LanguageModel', {value: undefined, configurable: true, writable: true}); } catch (_) {} return; }
  window.__ai = {prompts: [], creates: 0};
  const lineOf = (p, s) => { const m = p.match(new RegExp('^L([0-9]+): [^\\\\n]*' + s, 'mi')); return m ? +m[1] : 0; };
  const itemOf = (p, t) => { const m = p.match(new RegExp('^([0-9]+)\\\\. ' + t, 'm')); return m ? +m[1] : 0; };
  const answer = p => { if (!/has no due date/.test(p)) return JSON.stringify({summary: '', changes: []});
    const out = [];
    const a = itemOf(p, 'Lab Report 4'), b = itemOf(p, 'Reflection Paper 2'), c = itemOf(p, 'Lab Safety Quiz');
    if (a) out.push({item: a, line: lineOf(p, 'acid-base titration')});
    if (b) out.push({item: b, line: lineOf(p, 'Second reflection')});
    if (c) out.push({item: c, line: lineOf(p, 'acid-base titration')});   // wrong on purpose: LMK must refuse it
    return JSON.stringify({items: out}); };
  class Sx { async prompt(p){ window.__ai.prompts.push(p); return answer(p); } async clone(){ return new Sx(); } destroy(){} }
  window.LanguageModel = {availability: async () => 'available', create: async () => { window.__ai.creates++; return new Sx(); }}; })();`;
async function fresh(ws, {seed = {onboarded: 1, profile: {name: 'Sam'}, ext: null}, ls = {}, mobile = false} = {}){
  await send(ws, 'Emulation.setDeviceMetricsOverride', {width: mobile ? 500 : 1100, height: 900, deviceScaleFactor: 1, mobile});
  const s = `try{ if (location.protocol==='http:') { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('duenorth_v1', ${JSON.stringify(JSON.stringify(seed))}); ${Object.entries(ls).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(String(v))});`).join('')} } }catch(_){}`;
  const {identifier: a} = await send(ws, 'Page.addScriptToEvaluateOnNewDocument', {source: s});
  const {identifier: b} = await send(ws, 'Page.addScriptToEvaluateOnNewDocument', {source: STUB});
  await send(ws, 'Page.navigate', {url: 'about:blank'}); await sleep(150);
  await send(ws, 'Page.navigate', {url: 'http://localhost:8899/app/'}); await sleep(2600);
  await send(ws, 'Page.removeScriptToEvaluateOnNewDocument', {identifier: a}); await send(ws, 'Page.removeScriptToEvaluateOnNewDocument', {identifier: b});
}
const sync = (ws, p) => ev(ws, `window.postMessage({lmk:'ext-hello', version:'0.9.13'}, '*'); window.postMessage({lmk:'canvas-payload', payload:${JSON.stringify(p)}}, '*'); 1`);
const shelf = ws => ev(ws, `JSON.stringify((function(){ const h=[...document.querySelectorAll('h2.sec')].find(x=>/No date yet/.test(x.textContent)); if(!h) return null; const card=h.nextElementSibling, past=document.querySelector('details.shelfpast');
  const rows = el => el ? [...el.querySelectorAll('.item[data-uid]')].map(r=>({id:r.dataset.uid, t:r.querySelector('.t').textContent, tag:(r.querySelector('.etag')||{}).textContent||'', why:(r.querySelector('.shelfwhy')||{}).textContent||'', btns:[...r.querySelectorAll('button')].map(b=>b.textContent.trim())})) : [];
  return {count: h.querySelector('.count').textContent, open: card && card.matches('.card:not(details)') ? rows(card) : [], past: rows(past), pastSum: past ? past.querySelector('summary').textContent : '', all: (card && card.querySelector('[data-act="shelf-plan-all"]')||{}).textContent||''}; })())`).then(JSON.parse);

(async () => {
  const t = JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
  await send(ws, 'Page.enable'); await send(ws, 'Runtime.enable'); await send(ws, 'Network.enable'); await send(ws, 'Network.setCacheDisabled', {cacheDisabled: true});
  const errs = []; ws.addEventListener('message', e => { const x = JSON.parse(e.data); if (x.method === 'Runtime.exceptionThrown') errs.push(x.params.exceptionDetails.exception ? x.params.exceptionDetails.exception.description : x.params.exceptionDetails.text); });
  let r;
  // B1 no model: the shelf in three groups, and Today counts only what LMK cannot place
  await fresh(ws); await sync(ws, PAYLOAD); await sleep(1000);
  const today = await ev(ws, `(([...document.querySelectorAll('section.view .empty')].find(x=>/📦/.test(x.textContent))||{}).textContent||'').replace(/\\s+/g,' ')`);
  await ev(ws, `document.querySelector('nav.topnav [data-tab="plan"]').click(); 1`); await sleep(700);
  r = await shelf(ws);
  const by = id => r.open.concat(r.past).find(x => x.id === id) || {};
  check('B1 the shelf renders, with what looks past folded under "Probably over"', r && /Probably over: [0-9]+/.test(r.pastSum) && r.past.some(x => x.id === 'x731') && r.past.some(x => x.id === 'x851') && r.past.some(x => x.id === 'x743'), r && {past: r.past.map(x => x.id), sum: r.pastSum});
  check('B1 GW 8 is likely, "about the week of …?", with its schedule row as the reason and Plan it', /^about the week of .*\?$/.test(by('x718').tag) && /syllabus schedule/.test(by('x718').why) && by('x718').btns.includes('Plan it'), by('x718'));
  check('B1 an in-class one (Quiz 8, Week 10 Attendance) gets its week but no Plan it', /about the week of/.test(by('x738').tag) && !by('x738').btns.includes('Plan it') && !by('x859').btns.includes('Plan it'), [by('x738'), by('x859')]);
  check('B1 the Take-Home assignment has no guess: "no due date" and Give it a deadline, as before', by('x742').tag === 'no due date' && by('x742').btns.includes('Give it a deadline'), by('x742'));
  check('B1 a past one offers a quiet "Not over?", says why, and claims nothing done', by('x731').btns.includes('Not over?') && /graded/.test(by('x731').why) && !(await ev(ws, `!!store.done.a731`)), by('x731'));
  check('B1 the count is what is not past; "Plan all" covers the plannable likely ones', +r.count === r.open.length && /^Plan all [0-9]+$/.test(r.all), r);
  check('B1 Today counts only what is not past, and says LMK found likely weeks', /no due date yet, and [0-9]+ more ha(ve|s) a likely week/.test(today), today);
  // B2 Plan it: into the plan on the guessed date, marked as a guess; Undo; then Canvas dates it and wins
  await ev(ws, `document.querySelector('.item[data-uid="x718"] [data-act="shelf-plan"]').click()`); await sleep(500);
  const ev718 = () => ev(ws, `(function(){ const e=EVENTS.find(x=>x.id==='a718'); return e ? e.due.getTime() + '|' + e.est : null; })()`);
  const r718 = (await shelf(ws)).open.find(x => x.id === 'x718') || {};
  check('B2 Plan it: GW 8 is in the plan on its week\'s Friday, marked as a guess; the shelf shows it as "in your plan" with Unplan', (await ev718()) === day(11).getTime() + '|true' && /in your plan/.test(r718.tag) && r718.btns.includes('Unplan'), [await ev718(), r718]);
  await ev(ws, `document.querySelector('nav.topnav [data-tab="now"]').click(); window.scrollTo(0,0); 1`); await sleep(300);
  await ev(ws, `(function(){ const b=[...document.querySelectorAll('.toast button')].find(x=>/Undo/.test(x.textContent)); if (b) b.click(); })()`); await sleep(400);
  check('B2 Undo takes it back out of the plan and onto the shelf', (await ev718()) === null, await ev718());
  const fix718 = await ev(ws, `JSON.stringify((store.dueFix||{}).a718)`);
  check('B2 Undo writes a record ({due:""}), so the undo travels to other devices (dueFix never drops a key on merge)', JSON.parse(fix718 || '{}').due === '' && JSON.parse(fix718 || '{}').at > 0, fix718);
  await ev(ws, `document.querySelector('nav.topnav [data-tab="plan"]').click(); 1`); await sleep(400);
  // the course filter: Plan all plans only the class on screen
  await ev(ws, `courseFilter = 'MAT 210'; render(); 1`); await sleep(300);
  const allLbl = (await shelf(ws)).all;
  await ev(ws, `document.querySelector('[data-act="shelf-plan-all"]') ? document.querySelector('[data-act="shelf-plan-all"]').click() : 0; 1`); await sleep(400);
  const onlyChm = JSON.parse(await ev(ws, `JSON.stringify(EVENTS.filter(e=>e.est).map(e=>e.course))`));
  check('B3 with the class filter on MAT 210, "Plan all 2" plans MAT 210 only (not CHM 113\'s Problem Set 7)', allLbl === 'Plan all 2' && onlyChm.length === 2 && onlyChm.every(c => c === 'MAT 210'), {onlyChm, allLbl});
  await ev(ws, `for (const id of ['a718','a719']) store.dueFix[id] = {due: '', was: '', at: Date.now()}; save(); loadData(); render(); 1`); await sleep(300);
  await ev(ws, `courseFilter = null; render(); 1`); await sleep(300);
  // Unplan from the shelf
  await ev(ws, `document.querySelector('[data-act="shelf-plan"]') && document.querySelector('.item[data-uid="x903"] [data-act="shelf-plan"]') ? document.querySelector('.item[data-uid="x903"] [data-act="shelf-plan"]').click() : 0; 1`); await sleep(300);
  r = await shelf(ws);
  check('B3 a planned guess stays on the shelf as "in your plan, a guessed date" with Unplan', r.open.some(x => x.id === 'x903' && /in your plan/.test(x.tag) && x.btns.includes('Unplan')), r.open.find(x => x.id === 'x903'));
  await ev(ws, `document.querySelector('.item[data-uid="x903"] [data-act="shelf-unplan"]').click()`); await sleep(400);
  check('B3 Unplan takes it out of the plan, with a record that travels', !(await ev(ws, `!!EVENTS.find(e=>e.id==='a903')`)) && (await ev(ws, `store.dueFix.a903.due`)) === '');
  // the fold stays as the student left it across the minute's re-render
  await ev(ws, `document.querySelector('details.shelfpast summary').click(); 1`); await sleep(200); await ev(ws, `render(); 1`); await sleep(200);
  check('B8 "Probably over", opened, stays open across a render', !!(await ev(ws, `document.querySelector('details.shelfpast').open`)));
  await ev(ws, `document.querySelector('details.shelfpast summary').click(); 1`); await sleep(150);
  // the deadline sheet: its save leaves a tombstone; closing it unsaved forgets which item it was for
  await ev(ws, `document.querySelector('.item[data-uid="x742"] [data-act="date-undated"]').click()`); await sleep(200);
  await ev(ws, `document.getElementById('caClose').click(); 1`); await sleep(100);
  check('B9 closing the deadline sheet unsaved forgets the shelf item (a later "Add" must not remove it)', (await ev(ws, `pendingUndated`)) === null);
  await ev(ws, `document.querySelector('.item[data-uid="x742"] [data-act="date-undated"]').click()`); await sleep(200);
  await ev(ws, `document.getElementById('caDate').value='${day(9).toISOString().slice(0, 10)}'; document.getElementById('caSave').click(); 1`); await sleep(300);
  check('B9 giving it a deadline leaves a tombstone, so the next sync does not put it back', !!(await ev(ws, `!!(store.deleted||{})['undated:x742']`)));
  const again = JSON.parse(JSON.stringify(PAYLOAD)); again.at = Date.now() + 4000; await sync(ws, again); await sleep(800);
  check('B9 ...and the next sync does not', !(await ev(ws, `(store.undated||[]).some(u=>u.id==='x742')`)));
  // a guessed date that passes is not overdue work
  await ev(ws, `store.dueFix = store.dueFix || {}; store.dueFix.a742b = null; store.dueFix.a741 = {due: isoToRaw(new Date(Date.now() - 3*864e5).toISOString()), was: '', at: Date.now()}; save(); loadData(); render(); document.querySelector('nav.topnav [data-tab="now"]').click(); 1`); await sleep(400);
  check('B10 a planned guess whose date passed is not in the overdue list', (await ev(ws, `!!EVENTS.find(e=>e.id==='a741' && e.est)`)) && !(await ev(ws, `[...document.querySelectorAll('.triagecard [data-id]')].some(x=>x.dataset.id==='a741')`)));
  await ev(ws, `delete store.dueFix.a741; delete store.dueFix.a742b; save(); loadData(); render(); document.querySelector('nav.topnav [data-tab="plan"]').click(); 1`); await sleep(400);
  await ev(ws, `document.querySelector('[data-act="shelf-plan-all"]').click()`); await sleep(500);
  const planned = JSON.parse(await ev(ws, `JSON.stringify(EVENTS.filter(e=>e.est).map(e=>e.id).sort())`));
  check('B3 Plan all: every likely one that is not in class, nothing in class, nothing past', planned.includes('a718') && planned.includes('a719') && planned.includes('a903') && !planned.includes('a738') && !planned.includes('a859') && !planned.includes('a731'), planned);
  const dated = JSON.parse(JSON.stringify(PAYLOAD)); dated.at = Date.now() + 9000; dated.items['718'].due = day(9, 17, 0).toISOString();
  await sync(ws, dated); await sleep(900);
  check('B4 Canvas then dates GW 8 itself: the real date wins and it is not a guess any more', (await ev718()) === day(9, 17, 0).getTime() + '|false', await ev718());
  // B5 Chrome's AI on: it is asked only about what the rules could not place; its wrong answer is refused
  await fresh(ws, {ls: {__ai: 'available', lmk_ai: 'on'}}); await sync(ws, PAYLOAD); await sleep(4500);
  const ai = JSON.parse(await ev(ws, `JSON.stringify({prompts: window.__ai.prompts.filter(p=>/has no due date/.test(p)), got: store.shelfAi||{}})`));
  const chmP = ai.prompts.find(p => /Course: CHM 113/.test(p)) || '', asked = chmP.match(/^[0-9]+\. .*$/mg) || [], allAsked = ai.prompts.join('\n').match(/^[0-9]+\. .*$/mg) || [];
  check('B5 one shelf prompt per course with unplaced work, naming only what the rules could not place', ai.prompts.length === 2 && asked.some(x => /Lab Report 4/.test(x)) && !allAsked.some(x => /Problem Set 7|GW 8|GW 9|Quiz 8|Exam 2/.test(x)), allAsked);
  check('B5 the AI\'s right answers are kept, dated by LMK from the schedule rows', ai.got.x901 && ai.got.x901.due === day(4).getTime() && ai.got.x902 && ai.got.x902.due === day(11).getTime(), ai.got);
  check('B5 its wrong answer ("Lab Safety Quiz" on the titration line) is refused, and remembered as asked', ai.got.x904 && !ai.got.x904.due, ai.got.x904);
  check('B5 a course with no syllabus yet is not asked and NOT marked asked (its syllabus may come with a later read)', !ai.got.x951 && !ai.prompts.some(p => /FMS 265/.test(p)), ai.got.x951);
  await ev(ws, `document.querySelector('nav.topnav [data-tab="plan"]').click(); 1`); await sleep(500);
  r = await shelf(ws);
  const lab = r.open.find(x => x.id === 'x901') || {};
  check('B5 the shelf shows the AI\'s find with ✦, the line it found and the row above it, and Plan it', /^✦ Chrome's AI found it in the syllabus/.test(lab.why) && /acid-base titration/.test(lab.why) && lab.btns.includes('Plan it'), lab);
  const AXE = path.join(os.tmpdir(), 'axe-4.10.2.min.js');
  if (!fs.existsSync(AXE)) execSync(`curl -sfL -o "${AXE}" https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js`);
  await ev(ws, fs.readFileSync(AXE, 'utf8') + ';1'); await ev(ws, `document.querySelector('details.shelfpast').open = true; 1`);
  for (const light of [false, true]) {
    await send(ws, 'Emulation.setEmulatedMedia', {features: [{name: 'prefers-color-scheme', value: light ? 'light' : 'dark'}]}); await sleep(300);
    const v = JSON.parse(await ev(ws, `(async()=>{ const h=[...document.querySelectorAll('h2.sec')].find(x=>/No date yet/.test(x.textContent)); const box=document.createElement('div'); let n=h; const els=[]; while(n && !(n.matches && n.matches('h2.sec') && n!==h && !/No date yet/.test(n.textContent))) { els.push(n); n=n.nextElementSibling; } const res=[]; for (const el of els) { const r=await axe.run(el,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}); res.push(...r.violations.map(v=>({id:v.id,n:v.nodes.length,t:v.nodes[0]&&v.nodes[0].target}))); } return JSON.stringify(res); })()`));
    check(`B6 axe: the shelf has no WCAG 2.1 AA violations (${light ? 'light' : 'dark'})`, v.length === 0, v);
  }
  await send(ws, 'Emulation.setEmulatedMedia', {features: []});
  // B7 a phone: no model, but the laptop's finds arrive with the store
  const laptop = JSON.parse(await ev(ws, `JSON.stringify(store)`));
  await fresh(ws, {seed: laptop, mobile: true}); await sleep(600);
  await ev(ws, `(document.querySelector('nav.bottombar [data-tab="plan"]')||document.querySelector('[data-tab="plan"]')).click(); 1`); await sleep(600);
  r = await shelf(ws);
  check('B7 phone: the laptop\'s AI finds show (store.shelfAi), with no model here', (r.open.find(x => x.id === 'x901') || {}).why.startsWith('✦') && !(await ev(ws, `typeof LanguageModel !== 'undefined'`)), r.open.find(x => x.id === 'x901'));
  check('JS errors during run: none', errs.length === 0, errs.slice(0, 3));
  console.log(fail ? `\n${fail} FAILED  (${pass} passed)` : `\nALL OK  (${pass} passed)`);
  ws.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });

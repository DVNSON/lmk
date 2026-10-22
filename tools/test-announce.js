/* From your classes (v76.0): announcements on Today, and Chrome's built-in AI reading them.
   The model is replaced by a stand-in that replays what the real one answered on 2026-10-19 (Gemini Nano through
   Chrome 155's Prompt API), false claims included: it called "Exam 2 is next Tuesday" a move and "Essay 1 grades are
   posted" a move of Essay 1. LMK must keep only what the post's own words support, take the date from those words, and
   change nothing until the student taps. Dates are built from this week's Monday so the suite passes any day.
   Run: node tools/test-announce.js   (needs :8899 serving ~/lmk-web and one headless Chrome on :9333) */
const {execSync} = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
let id = 0;
const send = (ws, m, p = {}) => new Promise(r => { const mid = ++id; const h = e => { const x = JSON.parse(e.data); if (x.id === mid) { ws.removeEventListener('message', h); r(x.result); } }; ws.addEventListener('message', h); ws.send(JSON.stringify({id: mid, method: m, params: p})); });
const ev = (ws, e) => send(ws, 'Runtime.evaluate', {expression: e, returnByValue: true, awaitPromise: true}).then(r => r && r.result ? r.result.value : (r && r.exceptionDetails ? 'EXC ' + JSON.stringify(r.exceptionDetails).slice(0, 300) : undefined));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (n, ok, d) => { console.log((ok ? 'ok   ' : 'FAIL ') + n + (ok ? '' : '  -> ' + (d === undefined ? '' : JSON.stringify(d)).slice(0, 300))); ok ? pass++ : fail++; };

/* this week's Monday, 00:30 local: every post is "posted" then, so weekdays in the posts mean the same thing every day */
const MON = (() => { const d = new Date(); d.setHours(0, 30, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; })();
const at = (days, h, m) => { const d = new Date(MON); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d; };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const THU = at(3, 23, 59), THU_TXT = `Thursday, ${MONTHS[THU.getMonth()]} ${THU.getDate()}`;
const Q_MOVE = `Quiz 4 has been moved to ${THU_TXT} because of the fire drill.`;
const REV = at(7, 18, 0), Q_REV = `The Exam 2 review session is Monday, ${MONTHS[REV.getMonth()]} ${REV.getDate()} at 6 PM in the library.`;
const Q_EXT = 'Because Canvas was down last night, the deadline for Problem Set 5 is extended by 48 hours. It is now due Saturday night at 11:59 PM.';
const ANN = [
  {id: '9001', t: 'Quiz moved', txt: `Hi class,\n${Q_MOVE} It will still open at 8 AM. See you Wednesday!`},
  {id: '9002', t: 'Exam 2 reminder', txt: 'Reminder: Exam 2 is next Tuesday in our usual room. Bring a #2 pencil. The study guide is posted in Modules.'},
  {id: '9003', t: 'This week', txt: "Please read Chapter 6 before Friday's class and post a 200-word reflection on the discussion board by Sunday at 11:59pm."},
  {id: '9004', t: 'Lab update', txt: "Lab 5 is cancelled this week. We'll use the time to review for the midterm instead."},
  {id: '9005', t: 'Grades posted', txt: 'Grades for Essay 1 are posted. Overall the class did well. My office hours this week move to 3pm Thursday.'},
  {id: '9006', t: 'Extension', txt: Q_EXT},
  {id: '9009', t: 'Review session', txt: Q_REV},
].map((a, i) => Object.assign({cid: '272678', c: 'PSY 101', at: new Date(MON.getTime() + i * 60e3).toISOString(), url: 'https://canvas.asu.edu/courses/272678/discussion_topics/' + a.id, rd: false}, a));
ANN.push({id: '9007', cid: '272678', c: 'PSY 101', t: 'Old news', txt: 'Welcome to the course!', at: new Date(Date.now() - 15 * 864e5).toISOString(), url: '', rd: false});
ANN.push({id: '9008', cid: '272678', c: 'PSY 101', t: 'Already read on Canvas', txt: 'Room change for Friday.', at: new Date(MON.getTime() + 9 * 60e3).toISOString(), url: '', rd: true});   // posted between 9006 and 9009
/* what the real model answered, by post title; item numbers are looked up in the prompt the way the model saw them */
const CANNED = {
  'Quiz moved': {summary: "Quiz 4's due date has been changed to Thursday.", changes: [{kind: 'moved', item: '#Quiz 4', title: 'Quiz 4', quote: Q_MOVE},
    {kind: 'cancelled', item: '#Lab 5', title: 'Lab 5', quote: 'Lab 5 will not be graded'}]},   // a quote the post never says
  'Exam 2 reminder': {summary: 'Exam 2 will be next Tuesday in the usual room.', changes: [{kind: 'moved', item: '#Exam 2', title: 'Exam 2', quote: 'Exam 2 is next Tuesday in our usual room.'}]},
  'This week': {summary: 'Read Chapter 6 and post a 200-word reflection.', changes: [{kind: 'new', item: 0, title: 'Reflection on Chapter 6', quote: 'post a 200-word reflection on the discussion board by Sunday at 11:59pm'}]},
  'Lab update': {summary: 'Lab 5 has been cancelled.', changes: [{kind: 'cancelled', item: '#Lab 5', title: 'Lab 5', quote: 'Lab 5 is cancelled this week.'}]},
  'Grades posted': {summary: 'Essay 1 grades are posted, and office hours have changed.', changes: [{kind: 'moved', item: 5, title: 'Essay 1', quote: 'Grades for Essay 1 are posted.'}]},
  'Review session': {summary: 'There is an Exam 2 review session on Monday.', changes: [{kind: 'moved', item: '#Exam 2', title: 'Exam 2', quote: Q_REV}]},   // a date, Exam 2 named, no move: only the move-word check stops it
  'Extension': {summary: 'Problem Set 5 is extended by 48 hours.', changes: [{kind: 'moved', item: '#Problem Set 5', title: 'Problem Set 5', quote: Q_EXT.slice(Q_EXT.indexOf('the deadline'))}]},
};
const STUB = `(function(){ if (location.protocol !== 'http:') return; let mode = 'none'; try { mode = localStorage.getItem('__ai') || 'none'; } catch (_) {}
  /* Chrome 155 really has the Prompt API, headless too: "none" stands for a browser without it (Safari, a phone, older Chrome) */
  if (mode === 'none') { try { Object.defineProperty(window, 'LanguageModel', {value: undefined, configurable: true, writable: true}); } catch (_) {} return; }
  const CANNED = ${JSON.stringify(CANNED)};
  window.__ai = {creates: 0, act: [], prompts: 0};
  const answer = p => { const t = (p.match(/^Title: (.*)$/m) || [])[1] || '', c = JSON.parse(JSON.stringify(CANNED[t] || {summary: '', changes: []}));
    for (const x of c.changes) if (typeof x.item === 'string') { const m = p.match(new RegExp('^([0-9]+)\\\\. ' + x.item.slice(1) + ', due', 'm')); x.item = m ? +m[1] : 0; }
    return JSON.stringify(c); };
  class S { async prompt(p){ window.__ai.prompts++; return answer(p); } async clone(){ return new S(); } destroy(){} }
  window.LanguageModel = {availability: async () => localStorage.getItem('__ai_state') || mode,
    create: async o => { window.__ai.creates++; window.__ai.act.push(navigator.userActivation ? navigator.userActivation.isActive : null);
      if (o && o.monitor) { const t = new EventTarget(); o.monitor(t); for (const l of [0.5, 1]) { const e = new Event('downloadprogress'); e.loaded = l; t.dispatchEvent(e); } }
      localStorage.setItem('__ai_state', 'available'); return new S(); }}; })();`;
const PAY = (over = {}) => { const it = {}, mk = (aid, t, d, x = {}) => it[aid] = Object.assign({t, c: 'PSY 101', cid: '272678', due: d.toISOString(), pts: 10, st: 'online_upload', grp: 'g', k: '', sub: '', score: null, url: 'https://canvas.asu.edu/courses/272678/assignments/' + aid, desc: '', rub: '', fb: ''}, x);
  mk('501', 'Quiz 4', at(1, 23, 59), {st: 'online_quiz', k: 'quiz'}); mk('502', 'Lab 5', at(2, 17, 0)); mk('503', 'Problem Set 5', at(3, 23, 59)); mk('504', 'Exam 2', at(8, 9, 0));
  mk('505', 'Essay 1', at(-10, 23, 59), {sub: 'graded', subAt: at(-11, 20, 0).toISOString(), score: 9});
  it['601'] = {t: 'Problem set 7', c: 'ECN 212', cid: '184220', due: at(4, 23, 59).toISOString(), pts: 10, st: 'online_upload', grp: 'g', k: '', sub: '', score: null, url: '', desc: '', rub: '', fb: ''};
  return Object.assign({lmk: 'canvas', v: 3, at: Date.now(), host: 'canvas.asu.edu', items: it, groups: {}, courses: [{id: '272678', tag: 'PSY 101', wt: false}, {id: '184220', tag: 'ECN 212', wt: false}], ann: ANN}, over); };

async function fresh(ws, {seed = {onboarded: 1, profile: {name: 'Sam'}, ext: null}, ls = {}, mobile = false} = {}){
  await send(ws, 'Emulation.setDeviceMetricsOverride', {width: mobile ? 500 : 1100, height: 900, deviceScaleFactor: 1, mobile});
  const src = `try{ localStorage.clear(); sessionStorage.clear(); localStorage.setItem('duenorth_v1', ${JSON.stringify(JSON.stringify(seed))}); ${Object.entries(ls).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(String(v))});`).join('')} }catch(_){}`;
  const {identifier} = await send(ws, 'Page.addScriptToEvaluateOnNewDocument', {source: src});
  const {identifier: stub} = await send(ws, 'Page.addScriptToEvaluateOnNewDocument', {source: STUB});   // after the seed, so it sees this run's __ai
  await send(ws, 'Page.navigate', {url: 'about:blank'}); await sleep(150);
  await send(ws, 'Page.navigate', {url: 'http://localhost:8899/app/'}); await sleep(2600);
  await send(ws, 'Page.removeScriptToEvaluateOnNewDocument', {identifier}); await send(ws, 'Page.removeScriptToEvaluateOnNewDocument', {identifier: stub});
}
const sync = (ws, over) => ev(ws, `window.postMessage({lmk:'ext-hello', version:'0.9.13'}, '*'); window.postMessage({lmk:'canvas-payload', payload:${JSON.stringify(PAY(over))}}, '*'); 1`);
async function tap(ws, sel){   // a real pointer press: Chrome's model download needs a user activation
  const r = JSON.parse(await ev(ws, `JSON.stringify((function(){ const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; e.scrollIntoView({block:'center'}); const b=e.getBoundingClientRect(); return {x:b.left+b.width/2, y:b.top+b.height/2}; })())`) || 'null');
  if (!r) return false;
  for (const type of ['mousePressed', 'mouseReleased']) await send(ws, 'Input.dispatchMouseEvent', {type, x: r.x, y: r.y, button: 'left', clickCount: 1});
  return true;
}
const card = ws => ev(ws, `JSON.stringify((function(){ const h=[...document.querySelectorAll('h2.sec')].find(x=>/From your classes/.test(x.textContent)); const c=h&&h.nextElementSibling; const heads=[...document.querySelectorAll('section.view h2.sec')].map(x=>x.textContent.replace(/\\s+/g,' ').trim());
  return {heads, rows: c ? [...c.querySelectorAll('.item.ann')].map(r=>({id:r.dataset.ann, t:r.querySelector('.t').textContent.trim(), href:(r.querySelector('.t a')||{}).href||'', ai:(r.querySelector('.annai')||{}).textContent||''})) : null, offer:(c&&c.querySelector('.annoffer')||{}).textContent||'', btns: c ? [...c.querySelectorAll('button')].map(b=>b.textContent.trim()) : []}; })())`).then(JSON.parse);

/* N0 LMK's date reading, in node against the shipped source (no browser): the reviewer's cases first. "moved from Tuesday
   to Thursday" once proposed TUESDAY (the first date in the quote); "novel 3" once read as Nov 3. The post is Mon Oct 19 2026. */
{ const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
  const grab = name => { const i = src.indexOf('function ' + name + '('); let d = 0, st = false; for (let j = i; j < src.length; j++) { const c = src[j]; if (c === '{') { d++; st = true; } else if (c === '}') { d--; if (st && !d) return src.slice(i, j + 1); } } };
  const line = re => (src.match(re) || [''])[0];
  const annWhen = new Function(line(/^const ANN_MON = .*$/m) + '\n' + line(/^const ANN_MONTH = .*$/m) + '\n' + line(/^const ANN_WDAY = .*$/m) + '\n' + grab('annNear') + '\n' + grab('annWhen') + '\nreturn annWhen;')();
  const MON = new Date(2026, 9, 19, 0, 30), at = (d, h, m) => { const x = new Date(MON); x.setDate(x.getDate() + d); x.setHours(h, m, 0, 0); return x.getTime(); };
  const cur = at(1, 23, 59), fmt = t => t ? new Date(t).toString().slice(0, 21) : 'null';
  const C = [
   ["Quiz 2 has been moved from Tuesday to Thursday", cur, at(3, 23, 59)],
   ["moved from Oct 20 to Oct 22", cur, at(3, 23, 59)],
   ["no class Monday; quiz 3 moved to Friday", cur, at(4, 23, 59)],
   ["Read novel 3 by Friday", null, at(4, 23, 59)],
   ["The quiz is on Tuesday or Thursday", cur, null],
   ["Quiz 4 has been moved to Thursday, October 22 because of the fire drill.", cur, at(3, 23, 59)],
   ["the deadline for Problem Set 5 is extended by 48 hours. It is now due Saturday night at 11:59 PM.", at(3, 23, 59), at(5, 23, 59)],
   ["post a 200-word reflection on the discussion board by Sunday at 11:59pm", null, at(6, 23, 59)],
   ["extended by 2 days", cur, at(3, 23, 59)],
   ["moved from 2 PM Tuesday to Thursday at 4 PM", cur, at(3, 16, 0)],
   ["Exam 2 is next Tuesday", cur, null],
   ["Quiz moved to Wednesday, October 22", cur, null],
   ["The essay is now due Dec 3", null, new Date(2026, 11, 3, 23, 59).getTime()],
  ];
  for (const [q, c, want] of C) { const got = annWhen(q, MON.getTime(), c); check('N0 "' + q.slice(0, 58) + '" -> ' + fmt(want), got === want, fmt(got)); }
}

(async () => {
  const t = JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
  await send(ws, 'Page.enable'); await send(ws, 'Runtime.enable'); await send(ws, 'Network.enable'); await send(ws, 'Network.setCacheDisabled', {cacheDisabled: true});
  const errs = []; ws.addEventListener('message', e => { const x = JSON.parse(e.data); if (x.method === 'Runtime.exceptionThrown') errs.push(x.params.exceptionDetails.exception ? x.params.exceptionDetails.exception.description : x.params.exceptionDetails.text); });
  let r;

  // N1 no model on this computer: the posts show after the plan, newest first; old and read-on-Canvas ones stay out; no AI offer
  await fresh(ws); await sync(ws); await sleep(900);
  r = await card(ws);
  const iT = r.heads.findIndex(h => /^Today/.test(h)), iA = r.heads.findIndex(h => /^From your classes/.test(h));
  check('N1 the card renders under today\'s plan, never above it', iA > iT && iT >= 0, r.heads);
  check('N1 seven posts, newest first; 15 days old and read-on-Canvas are left out', r.rows && r.rows.map(x => x.id).join() === '9009,9006,9005', r.rows && r.rows.map(x => x.id));
  check('N1 three shown, "Show 4 more" for the rest, each title links to the post on Canvas', r.btns.includes('Show 4 more') && r.rows[0].href.endsWith('/9009'), r.btns);
  check('N1 no model in this browser: no AI offer, no AI text', !r.offer && r.rows.every(x => !x.ai), r.offer);
  check('N1 the posts are kept in the store with the read', JSON.parse(await ev(ws, `JSON.stringify(store.ext.ann.map(a=>a.id))`)).length === 9);
  await ev(ws, `document.querySelector('[data-act="ann-more"]').click()`); await sleep(200);
  r = await card(ws);
  check('N1 Show more lists all seven', r.rows.length === 7, r.rows.length);
  await ev(ws, `document.querySelector('[data-act="ann-seen"][data-ann="9009"]').click()`); await sleep(200);
  r = await card(ws);
  check('N2 Seen takes a post off Today and stamps store.annSeen', !r.rows.some(x => x.id === '9009') && JSON.parse(await ev(ws, `JSON.stringify(Object.keys(store.annSeen||{}))`)).join() === '9009', r.rows.map(x => x.id));

  // N3 a reader that sends no announcements (LMK's server, an older extension) keeps the list
  await ev(ws, `(function(){ const p=${JSON.stringify(PAY())}; delete p.ann; p.at=Date.now()+5000; window.postMessage({lmk:'canvas-payload', payload:p}, '*'); })()`); await sleep(700);
  check('N3 a payload with no ann keeps the posts (a reader that does not send a field must not wipe it)', +(await ev(ws, `store.ext.ann.length`)) === 9);

  // N4 a model this computer could download: the offer, and the download starts only from the tap
  await fresh(ws, {ls: {__ai: 'downloadable'}}); await sync(ws); await sleep(1200);
  r = await card(ws);
  check('N4 the offer says what it does, where it runs, and the one-time download', /built-in AI/.test(r.offer) && /on this computer; nothing is sent anywhere/.test(r.offer) && /about 4 GB/.test(r.offer) && r.btns.includes('Turn on') && r.btns.includes('No thanks'), r.offer);
  check('N4 nothing is created, downloaded or read before the student says yes', JSON.parse(await ev(ws, `JSON.stringify(window.__ai)`)).creates === 0 && !(await ev(ws, `!!store.annAi`)));
  await tap(ws, '[data-act="ai-on"]'); await sleep(2500);
  const ai = JSON.parse(await ev(ws, `JSON.stringify(window.__ai)`));
  check('N4 Turn on creates the session inside the tap (a user activation, which a download needs)', ai.creates === 1 && ai.act[0] === true, ai);
  check('N4 the choice is this computer\'s (localStorage), not synced', (await ev(ws, `localStorage.getItem('lmk_ai')`)) === 'on' && !(await ev(ws, `'aiOn' in store || 'lmk_ai' in store`)));
  check('N4 every recent post is read once (eight, the read-on-Canvas one too), the 15-day-old one is not', ai.prompts === 8, ai.prompts);
  const A = JSON.parse(await ev(ws, `JSON.stringify(store.annAi)`));
  const ch = k => (A[k] || {}).ch || [];
  check('N5 "Quiz 4 moved to Thursday": a move, dated Thursday at the OLD due time (the model said 8 AM, the open time)', ch('9001').length === 1 && ch('9001')[0].k === 'moved' && ch('9001')[0].id === 'a501' && ch('9001')[0].due === THU.getTime(), ch('9001'));
  check('N5 the second claim on that post quotes words the post never says, so it is dropped', !ch('9001').some(c => c.k === 'cancelled'), ch('9001'));
  check('N5 "Exam 2 is next Tuesday" is a reminder, not a move (the model called it one)', ch('9002').length === 0 && /Exam 2/.test(A['9002'].s), A['9002']);
  check('N5 "a reflection by Sunday at 11:59pm" is new work due SUNDAY 11:59 PM (the model said Saturday)', ch('9003').length === 1 && ch('9003')[0].k === 'new' && ch('9003')[0].due === at(6, 23, 59).getTime() && /Reflection/.test(ch('9003')[0].t), ch('9003'));
  check('N5 "Lab 5 is cancelled" is a cancellation of Lab 5', ch('9004').length === 1 && ch('9004')[0].k === 'cancelled' && ch('9004')[0].id === 'a502', ch('9004'));
  check('N5 "the Exam 2 review session is Monday … at 6 PM" is not a move of Exam 2 (no word says it moved)', ch('9009').length === 0, ch('9009'));
  check('N5 "Essay 1 grades are posted" changes nothing (the model called it a move)', ch('9005').length === 0, A['9005']);
  check('N5 "extended by 48 hours … now due Saturday night at 11:59 PM" moves Problem Set 5 to Saturday 11:59 PM', ch('9006').length === 1 && ch('9006')[0].id === 'a503' && ch('9006')[0].due === at(5, 23, 59).getTime(), ch('9006'));
  check('N5 nothing in the plan changed by itself', !(await ev(ws, `!!(store.dueFix && Object.keys(store.dueFix).length) || !!store.dropped.a502 || (store.customRows||[]).length > 0`)));
  await ev(ws, `AIRT.more=true; render(); 1`); await sleep(200);
  r = await card(ws);
  const q = r.rows.find(x => x.id === '9001');
  check('N5 the card says it is Chrome\'s AI, quotes the post and offers buttons', q && /Chrome's AI read it/.test(q.ai) && /Looks like Quiz 4 moved to/.test(q.ai) && q.ai.includes(Q_MOVE) && r.btns.includes('Use new date') && r.btns.includes('Add to my plan') && r.btns.includes('Take it off my plan'), q);
  check('N5 a short post with no change shows no AI box (its summary would only repeat the post)', (r.rows.find(x => x.id === '9002') || {}).ai === '', r.rows.find(x => x.id === '9002'));
  check('N5 while on, the card says the AI reads here, with Turn off', /reads new posts here, on this computer/.test(r.offer) && r.btns.includes('Turn off'), r.offer);

  // N6 Use new date: the plan moves; Undo puts it back; Canvas changing the date itself wins
  const dueOf = aid => ev(ws, `(function(){ const e=EVENTS.find(x=>x.id==='${aid}'); return e ? e.due.getTime() + '|' + e.moved : null; })()`);
  await ev(ws, `document.querySelector('[data-act="ann-use"][data-ann="9001"]').click()`); await sleep(400);
  check('N6 Use new date: Quiz 4 is due Thursday in the plan, marked "new date"', (await dueOf('a501')) === THU.getTime() + '|true' && (await ev(ws, `!!document.querySelector('.item[data-id="a501"] .etag[title*="announcement"]') || true`)), await dueOf('a501'));
  r = await card(ws);
  check('N6 the post then says it is done, with Undo', /Quiz 4 is due .* in your plan/.test(r.rows.find(x => x.id === '9001').ai) && r.btns.includes('Undo'), r.rows.find(x => x.id === '9001').ai);
  await ev(ws, `document.querySelector('[data-act="ann-undo"][data-ann="9001"]').click()`); await sleep(400);
  check('N6 Undo: back to Canvas\'s date, and the suggestion is offered again', (await dueOf('a501')) === at(1, 23, 59).getTime() + '|false' && (await card(ws)).btns.includes('Use new date'));
  await ev(ws, `document.querySelector('[data-act="ann-use"][data-ann="9001"]').click()`); await sleep(300);
  await sync(ws, {at: Date.now() + 9000, items: Object.assign(PAY().items, {501: Object.assign(PAY().items['501'], {due: at(4, 12, 0).toISOString()})})}); await sleep(900);
  check('N6 Canvas then moves Quiz 4 itself (to Friday noon): Canvas wins, the fix stops applying', (await dueOf('a501')) === at(4, 12, 0).getTime() + '|false', await dueOf('a501'));
  await sync(ws, {at: Date.now() + 19000}); await sleep(900);

  // N7 Add to my plan, Take it off, Not right
  await ev(ws, `document.querySelector('[data-act="ann-use"][data-ann="9003"]').click()`); await sleep(400);
  const row = JSON.parse(await ev(ws, `JSON.stringify((store.customRows||[]).find(r=>/^custom-ann-9003-/.test(r[4])) || null)`));
  check('N7 Add to my plan: the reflection is in the plan as the student\'s own item, due Sunday 11:59 PM, in PSY 101', row && /Reflection/.test(row[0]) && row[1] === 'PSY 101' && +(await ev(ws, `(EVENTS.find(e=>/^Reflection/.test(e.title))||{due:{getTime:()=>0}}).due.getTime()`)) === at(6, 23, 59).getTime(), row);
  await ev(ws, `document.querySelector('[data-act="ann-use"][data-ann="9004"]').click()`); await sleep(300);
  check('N7 Take it off my plan: Lab 5 is dropped', !!(await ev(ws, `!!store.dropped.a502`)));
  await ev(ws, `document.querySelector('[data-act="ann-undo"][data-ann="9004"]').click()`); await sleep(300);
  check('N7 Undo puts Lab 5 back (and leaves a tombstone so Drive cannot re-drop it)', !(await ev(ws, `!!store.dropped.a502`)) && !!(await ev(ws, `!!store.deleted['dropped:a502']`)));
  await ev(ws, `document.querySelector('[data-act="ann-no"][data-ann="9006"]').click()`); await sleep(300);
  r = await card(ws);
  check('N7 Not right hides that suggestion and remembers the answer', !/Looks like Problem Set 5/.test((r.rows.find(x => x.id === '9006') || {}).ai || '') && (await ev(ws, `store.annAi['9006'].d[0]`)) === 'no', r.rows.find(x => x.id === '9006'));

  // N8 a11y: axe on Today with the card, AI suggestions and all
  const AXE = path.join(os.tmpdir(), 'axe-4.10.2.min.js');
  if (!fs.existsSync(AXE)) execSync(`curl -sfL -o "${AXE}" https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js`);
  await ev(ws, fs.readFileSync(AXE, 'utf8') + ';1');
  for (const light of [false, true]) {
    await send(ws, 'Emulation.setEmulatedMedia', {features: [{name: 'prefers-color-scheme', value: light ? 'light' : 'dark'}]}); await sleep(300);
    const v = JSON.parse(await ev(ws, `axe.run(document.querySelector('.annc'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}).then(r=>JSON.stringify(r.violations.map(v=>({id:v.id,n:v.nodes.length,t:v.nodes[0]&&v.nodes[0].target}))))`));
    check(`N8 axe: the card has no WCAG 2.1 AA violations (${light ? 'light' : 'dark'})`, v.length === 0, v);
  }
  await send(ws, 'Emulation.setEmulatedMedia', {features: []});

  // N9 a phone: no model there, but what the laptop read arrives through the store
  const laptop = JSON.parse(await ev(ws, `JSON.stringify(store)`));
  await fresh(ws, {seed: Object.assign({}, laptop, {annSeen: {}}), mobile: true}); await sleep(600);
  await ev(ws, `document.querySelector('[data-act="ann-more"]').click()`); await sleep(200);
  r = await card(ws);
  check('N9 phone: the laptop\'s reads show (synced store.annAi), with no AI offer and no model', r.rows && r.rows.some(x => /Chrome's AI read it/.test(x.ai)) && !r.offer && !(await ev(ws, `typeof LanguageModel !== 'undefined'`)), r);

  // N10 "No thanks" is remembered on this computer and nothing is created; a pref of "on" with a model that still needs
  //      downloading never starts that download without a tap
  await fresh(ws, {ls: {__ai: 'downloadable'}}); await sync(ws); await sleep(1200);
  await ev(ws, `document.querySelector('[data-act="ai-no"]').click()`); await sleep(300);
  r = await card(ws);
  check('N10 No thanks: the offer goes and stays gone, nothing created', !r.offer && (await ev(ws, `localStorage.getItem('lmk_ai')`)) === 'off' && JSON.parse(await ev(ws, `JSON.stringify(window.__ai)`)).creates === 0);
  await fresh(ws, {ls: {__ai: 'downloadable', lmk_ai: 'on'}}); await sync(ws); await sleep(3500);
  check('N10 turned on earlier but the model is not here yet: no download starts without a tap', JSON.parse(await ev(ws, `JSON.stringify(window.__ai)`)).creates === 0 && !(await ev(ws, `!!store.annAi`)));
  await fresh(ws, {ls: {__ai: 'available', lmk_ai: 'on'}}); await sync(ws); await sleep(3500);
  check('N10 turned on and the model is ready: new posts are read on their own', JSON.parse(await ev(ws, `JSON.stringify(window.__ai)`)).prompts >= 6 && !!(await ev(ws, `!!(store.annAi && store.annAi['9001'])`)));

  // N12 LMK's remote off switch (worker v27 /config ai.paused): no model call, nothing it found shown, a line that says so
  const cfgPaused = JSON.stringify({at: Date.now(), v: {ok: true, announce: null, storeUrl: '', ai: {paused: true}}});
  await fresh(ws, {ls: {__ai: 'available', lmk_ai: 'on', lmk_cfg: cfgPaused}}); await sync(ws); await sleep(3500);
  const pz = JSON.parse(await ev(ws, `JSON.stringify({prompts: (window.__ai||{}).prompts||0, read: !!store.annAi})`));
  check('N12 paused by LMK: the model is never asked, though this computer turned it on and the model is ready', pz.prompts === 0 && !pz.read, pz);
  await ev(ws, `store.annAi = ${JSON.stringify({9001: {v: 1, at: Date.now(), s: 'Quiz 4 moved.', ch: [{k: 'moved', id: 'a501', due: Date.now() + 3 * 864e5, q: 'Quiz 4 has been moved'}], d: {}}})}; AIRT.more = true; save(); render(); 1`); await sleep(300);
  r = await card(ws);
  check('N12 paused: what it found before is hidden too, and the card says the AI is paused', r.rows && r.rows.every(x => !x.ai) && /paused Chrome's built-in AI/.test(r.offer), {offer: r.offer, ai: r.rows && r.rows.map(x => x.ai)});

  // N11 LMK's own banner still closes (its ✕ is "ann-dismiss", which must not be taken for a post's action)
  await ev(ws, `showAnnouncement({on:true, text:'Test banner'}); 1`); await sleep(100);
  await ev(ws, `document.querySelector('#announce [data-act="ann-dismiss"]').click()`); await sleep(150);
  check('N11 the Admin banner\'s ✕ still closes it', !!(await ev(ws, `document.getElementById('announce').hidden`)));

  check('JS errors during run: none', errs.length === 0, errs.slice(0, 3));
  console.log(fail ? `\n${fail} FAILED  (${pass} passed)` : `\nALL OK  (${pass} passed)`);
  ws.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });

/* Get ahead — the optional head start on a free day — in a real headless Chrome against the PUBLIC build.
   Run:  cd ~/lmk-web && python3 -m http.server 8899 &
         "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 --user-data-dir=/tmp/lmk-cdp-wi about:blank &
         node tools/test-ahead.js
   The worker is stubbed at window.fetch. Every seed sets weekend hours equal to weekday hours so the day the
   suite runs on does not change the plan. Needs node 22+ (global WebSocket). */
const {execSync}=require('child_process'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{ if(r&&r.exceptionDetails) throw new Error((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text); return r&&r.result?r.result.value:undefined; });
let pass=0, fail=0; const check=(n,ok,d)=>{ console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+(d===undefined?'':JSON.stringify(d)).slice(0,300))); ok?pass++:fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
/* three things, none released today: a big essay in 8 days (lead 5), a quick quiz in 3 (lead 1), a medium set in 4 (lead 2) */
const PAYLOAD = (extra='', d={}) => `(function(){ const now=Date.now(); const it={}, mk=(aid,c,cid,d,t)=>it[aid]={t,c,cid,due:new Date(now+d*864e5).toISOString(),pts:10,st:"online_upload",grp:"g",k:"",sub:"",score:null,url:"https://x/"+aid,desc:"",rub:"",fb:""};
  mk("801","ENG 102","184220",${d.essay ?? 8},"Essay draft"); mk("802","ECN 212","184221",${d.quiz ?? 3},"Quiz 3"); mk("803","ECN 212","184221",${d.set ?? 4},"Problem set 2"); ${extra}
  return {lmk:"canvas",v:3,at:now,host:"canvas.asu.edu",items:it,groups:{},courses:[{id:"184220",tag:"ENG 102",wt:true},{id:"184221",tag:"ECN 212",wt:true}]}; })()`;
const STUB = `(function(){ const J=o=>new Response(JSON.stringify(o),{status:200,headers:{"content-type":"application/json"}});
  window.fetch=async function(u){ const url=String(u); if(/\\/config$/.test(url)) return J({ok:true,announce:null,storeUrl:"",units:{},plus:{tiers:{}},rooms:{on:false}}); if(/\\/plus\\/status$/.test(url)) return J({ok:true,plus:false,level:"free",credits:5,rooms:[]}); return J({ok:false}); }; })()`;
const seedFor = (hours, extra={}) => Object.assign({onboarded:1, profile:{name:"Emiel"}, capacity:{weekday:hours, weekend:hours}, effortOv:{a801:"big", a802:"quick", a803:"medium", a804:"medium"}, ext:null}, extra);
async function fresh(ws, {seed, payloadExtra='', mobile=false, days={}}={}){
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:mobile?500:1100,height:900,deviceScaleFactor:1,mobile});
  const src = `try{ localStorage.clear(); sessionStorage.clear(); localStorage.setItem('duenorth_v1', ${JSON.stringify(JSON.stringify(seed))}); }catch(_){}`;
  const {identifier} = await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:src});
  { const cs = require('./suite-clock').clockScript(); if (cs) await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source: cs}); }   // the suite's clock: 9 AM today unless LMK_TEST_HOUR says otherwise
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(150);
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(2400);
  await send(ws,'Page.removeScriptToEvaluateOnNewDocument',{identifier});
  await ev(ws,`window.postMessage({lmk:'canvas-payload', payload:${PAYLOAD(payloadExtra, days)}}, '*')`); await sleep(900);
  await ev(ws,`welcomeOverlay.classList.remove('open'); 1`);
}
const READ = `JSON.stringify({
  aheadHero: !!document.querySelector('section.view .hero.ahead'),
  kicker: (document.querySelector('section.view .hero > .kicker')||{}).textContent||'',
  h1: (document.querySelector('section.view .hero h1')||{}).textContent||'',
  why: (document.querySelector('section.view .hero > .why')||{}).textContent||'',
  optional: !!document.querySelector('section.view .hero.ahead .etag'),
  todayCount: (document.querySelector('section.view h2.sec .count')||{}).textContent||'',
  block: !!document.querySelector('section.view [data-ahead] .list'),
  rows: [...document.querySelectorAll('section.view [data-ahead] .item')].map(r=>({t:r.querySelector('.t').textContent, est:r.querySelector('.etag').textContent, why:r.querySelector('.sugg').textContent})),
  note: [...document.querySelectorAll('section.view .empty')].map(x=>x.textContent).join(' | '),
  over: PLAN_OVER.length,
  aheadMins: Object.values(AHEAD).flat().map(x=>x.mins),
  essayParts: Object.values(PLAN).flatMap(d=>d.items).filter(c=>c.e.id==='a801').map(c=>c.mins),
  today: (PLAN[dayKey(startOfDay(now()))]||{items:[]}).items.map(c=>c.e.title+':'+c.mins),
  skip: (JSON.parse(localStorage.getItem('duenorth_v1')||'{}').aheadSkip)||{},
  leaked: /\\$\\{/.test(document.querySelector('section.view').textContent)
})`;
(async()=>{
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable'); await send(ws,'Network.enable'); await send(ws,'Network.setCacheDisabled',{cacheDisabled:true});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:STUB});
  const errs=[]; ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.method==='Runtime.exceptionThrown') errs.push(String((m.params.exceptionDetails.exception||{}).description||'').slice(0,160));});

  /* v79.0 (2026-10-30): no hours. Today holds its share of the week's work (the quiz and the set); the essay, due in 8 days, is released tomorrow
     and offered today as a head start — every day with room offers one part's worth below the plan, soonest due first. A day with nothing due
     this week makes the head start the hero (W2). The old 1 h / 0 h worlds (A3, A4) went with the hours. */
  const W2 = {essay:14, quiz:20, set:20};
  // A1 the default world, 2h: today holds this week's work and a first piece of the essay; the hero is the nearest thing, as needed work
  await fresh(ws,{seed:seedFor(2)});
  let r=JSON.parse(await ev(ws,READ));
  check('A1 the hero is "Next up" on the quiz (nearest due), not a head start', !r.aheadHero && /Next up/.test(r.kicker) && r.h1==='Quiz 3' && !r.optional, r);
  check('A1 today holds the quiz and the problem set (its share of the week), and the essay is offered below as a head start', r.today.join()==='Quiz 3:15,Problem set 2:45' && r.todayCount!=='clear' && r.block && r.rows.some(x=>x.t==='Essay draft' && /first pass/.test(x.why)), {today:r.today, count:r.todayCount, rows:r.rows});
  check('A1 no "nothing needed until" line: today is not empty', !/Nothing needed until/.test(r.note), r.note);
  check('A1 nothing leaked, no JS errors', !r.leaked && !errs.length, errs);
  // A2 a light week (only an essay two weeks out): the hero is a head start on it; Not today hides it for the day; a reload keeps that
  await fresh(ws,{seed:seedFor(2), days:W2});
  r=JSON.parse(await ev(ws,READ));
  check('A2 with nothing due this week the hero is a head start on the essay, labelled optional, "a first pass now"', r.aheadHero && /head start, if you want/.test(r.kicker) && r.h1==='Essay draft' && r.optional && /first pass/.test(r.why) && r.todayCount==='clear', r);
  await ev(ws,`document.querySelector('section.view [data-ahead] .item[data-id="a801"] [data-act="ahead-skip"]').click()`); await sleep(400);
  r=JSON.parse(await ev(ws,READ));
  check('A2 "Not today" hides the essay for the day and the store remembers the day', !r.rows.some(x=>x.t==='Essay draft') && r.h1!=='Essay draft' && /^\d{4}-\d\d-\d\d$/.test(r.skip.a801||''), {rows:r.rows, h1:r.h1, skip:r.skip});
  await send(ws,'Page.reload'); await sleep(2200); await ev(ws,`window.postMessage({lmk:'canvas-payload', payload:${PAYLOAD('', W2)}}, '*')`); await sleep(900); await ev(ws,`welcomeOverlay.classList.remove('open'); 1`);
  r=JSON.parse(await ev(ws,READ));
  check('A2 the dismissal survives a reload', r.h1!=='Essay draft' && !r.rows.some(x=>x.t==='Essay draft'), {h1:r.h1, rows:r.rows});
  // A3 a legacy 1 h capacity in the store changes nothing: the plan and the head start are the same as with 2 h (no hours since v79.0)
  await fresh(ws,{seed:seedFor(1)});
  const r1=JSON.parse(await ev(ws,READ));
  check('A3 a capacity left in an old store (1 h) changes neither the plan nor the head start (the essay is two 60-minute parts, days it has, not hours)', r1.today.join()==='Quiz 3:15,Problem set 2:45' && r1.block && r1.essayParts.join()==='60,60' && r1.over===0, {today:r1.today, parts:r1.essayParts, block:r1.block});
  // A4 the head start is one part at most (90 min), never the whole essay, and it is labelled as a suggestion
  check('A4 the head start is at most one part (90 min of the 2 h essay), labelled suggested', r1.rows.length>=1 && r1.rows.every(x=>/suggested/.test(x.why)) && r1.aheadMins.every(m=>m<=90), {rows:r1.rows, mins:r1.aheadMins});
  // A5 a day with work due today: the normal hero on it; the head starts stay below the plan, optional
  await fresh(ws,{seed:seedFor(2), payloadExtra:'mk("804","ECN 212","184221",1,"Reading response");'});
  r=JSON.parse(await ev(ws,READ));
  check('A5 work due today keeps the normal hero on it, first in the list; head starts stay below as suggestions', !r.aheadHero && /Next up/.test(r.kicker) && r.h1==='Reading response' && r.today[0]==='Reading response:45' && (!r.block || r.rows.every(x=>/suggested/.test(x.why))), {kicker:r.kicker, h1:r.h1, block:r.block, today:r.today, rows:r.rows});
  // A6 phone width renders the head-start hero and block without leaks (the light week)
  await fresh(ws,{seed:seedFor(2), mobile:true, days:W2});
  r=JSON.parse(await ev(ws,READ));
  check('A6 phone: the head-start hero and block render, nothing leaked', r.aheadHero && r.block && !r.leaked, r);
  console.log('\nJS errors during run:', errs.length? errs.slice(0,4) : 'none');
  console.log(`\n${fail? fail+' FAILED' : 'ALL OK'}  (${pass} passed)`);
  ws.close(); process.exit(fail?1:0);
})().catch(e=>{ console.log('HARNESS ERROR', e.message); process.exit(2); });

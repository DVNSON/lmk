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
const PAYLOAD = (extra='') => `(function(){ const now=Date.now(); const it={}, mk=(aid,c,cid,d,t)=>it[aid]={t,c,cid,due:new Date(now+d*864e5).toISOString(),pts:10,st:"online_upload",grp:"g",k:"",sub:"",score:null,url:"https://x/"+aid,desc:"",rub:"",fb:""};
  mk("801","ENG 102","184220",8,"Essay draft"); mk("802","ECN 212","184221",3,"Quiz 3"); mk("803","ECN 212","184221",4,"Problem set 2"); ${extra}
  return {lmk:"canvas",v:3,at:now,host:"canvas.asu.edu",items:it,groups:{},courses:[{id:"184220",tag:"ENG 102",wt:true},{id:"184221",tag:"ECN 212",wt:true}]}; })()`;
const STUB = `(function(){ const J=o=>new Response(JSON.stringify(o),{status:200,headers:{"content-type":"application/json"}});
  window.fetch=async function(u){ const url=String(u); if(/\\/config$/.test(url)) return J({ok:true,announce:null,storeUrl:"",units:{},plus:{tiers:{}},rooms:{on:false}}); if(/\\/plus\\/status$/.test(url)) return J({ok:true,plus:false,level:"free",credits:5,rooms:[]}); return J({ok:false}); }; })()`;
const seedFor = (hours, extra={}) => Object.assign({onboarded:1, profile:{name:"Emiel"}, capacity:{weekday:hours, weekend:hours}, effortOv:{a801:"big", a802:"quick", a803:"medium", a804:"medium"}, ext:null}, extra);
async function fresh(ws, {seed, payloadExtra='', mobile=false}={}){
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:mobile?500:1100,height:900,deviceScaleFactor:1,mobile});
  const src = `try{ localStorage.clear(); sessionStorage.clear(); localStorage.setItem('duenorth_v1', ${JSON.stringify(JSON.stringify(seed))}); }catch(_){}`;
  const {identifier} = await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:src});
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(150);
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(2400);
  await send(ws,'Page.removeScriptToEvaluateOnNewDocument',{identifier});
  await ev(ws,`window.postMessage({lmk:'canvas-payload', payload:${PAYLOAD(payloadExtra)}}, '*')`); await sleep(900);
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
  skip: (JSON.parse(localStorage.getItem('duenorth_v1')||'{}').aheadSkip)||{},
  leaked: /\\$\\{/.test(document.querySelector('section.view').textContent)
})`;
(async()=>{
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable'); await send(ws,'Network.enable'); await send(ws,'Network.setCacheDisabled',{cacheDisabled:true});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:STUB});
  const errs=[]; ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.method==='Runtime.exceptionThrown') errs.push(String((m.params.exceptionDetails.exception||{}).description||'').slice(0,160));});

  // A1 a free day, 2h budget: the hero is a head start on the essay, the block has the essay (90 of 2h) and the quiz
  await fresh(ws,{seed:seedFor(2)});
  let r=JSON.parse(await ev(ws,READ));
  check('A1 the hero is a head start, labelled optional, on the essay', r.aheadHero && /head start, if you want/.test(r.kicker) && r.h1==='Essay draft' && r.optional && /Suggested, not due/.test(r.why) && /first pass/.test(r.why) && /Skipping it costs nothing/.test(r.why), r);
  check('A1 today stays "clear" and the block holds the essay (1.5h of 2h) then the quiz (knock out)', r.todayCount==='clear' && r.block && r.rows.length===2 && r.rows[0].t==='Essay draft' && /1\.5h of 2h/.test(r.rows[0].est) && r.aheadMins.join()==='90,15' && r.rows[1].t==='Quiz 3' && /knock out/.test(r.rows[1].why), r.rows);
  check('A1 the empty-day line points below, and the week line says when work starts', /head start is just below/.test(r.note) && /Nothing needed until .* then ~/.test(r.note), r.note);
  check('A1 nothing leaked, no JS errors', !r.leaked && !errs.length, errs);
  // A2 Not today on the essay: the hero moves to the quiz, the store remembers the day, a reload keeps it
  await ev(ws,`document.querySelector('section.view [data-ahead] .item[data-id="a801"] [data-act="ahead-skip"]').click()`); await sleep(400);
  r=JSON.parse(await ev(ws,READ));
  check('A2 "Not today" hides the essay for the day and the hero moves to the quiz', !r.rows.some(x=>x.t==='Essay draft') && r.h1==='Quiz 3' && /knock out/.test(r.why) && /^\d{4}-\d\d-\d\d$/.test(r.skip.a801||''), {rows:r.rows, h1:r.h1, skip:r.skip});
  await send(ws,'Page.reload'); await sleep(2200); await ev(ws,`window.postMessage({lmk:'canvas-payload', payload:${PAYLOAD()}}, '*')`); await sleep(900); await ev(ws,`welcomeOverlay.classList.remove('open'); 1`);
  r=JSON.parse(await ev(ws,READ));
  check('A2 the dismissal survives a reload', r.aheadHero && r.h1!=='Essay draft' && !r.rows.some(x=>x.t==='Essay draft'), {h1:r.h1, rows:r.rows});
  // A3 a 1h/day budget: parts shrink to 1h so the essay is not forced onto its due day, and a nearly-full day is the reason to start
  await fresh(ws,{seed:seedFor(1)});
  r=JSON.parse(await ev(ws,READ));
  check('A3 with 1h days the essay splits into 1h parts and no day is over budget', r.over===0 && r.essayParts.length===2 && r.essayParts.every(m=>m===60), {over:r.over, parts:r.essayParts});
  check('A3 the head start names the nearly-full day it lightens', r.aheadHero && /is (nearly full|full|over its budget)/.test(r.why) && r.rows.some(x=>/is (nearly full|full|over its budget)/.test(x.why)), {why:r.why, rows:r.rows});
  // A4 a day off (0h today): no head start, the hero says clear
  const todayKey = await ev(ws,`dayKey(new Date())`);
  await fresh(ws,{seed:seedFor(2,{capOv:{[todayKey]:0}})});
  r=JSON.parse(await ev(ws,READ));
  check('A4 a day set to 0h gets no suggestion and an honest clear hero', !r.aheadHero && !r.block && /All clear/.test(r.h1), {h1:r.h1, block:r.block});
  // A5 a day with needed work: the normal hero, and a head start only fills what is left of the budget
  await fresh(ws,{seed:seedFor(2), payloadExtra:'mk("804","ECN 212","184221",1,"Reading response");'});
  r=JSON.parse(await ev(ws,READ));
  check('A5 needed work keeps the normal hero; the head start sits below sized to the leftover (75 of 120 min)', !r.aheadHero && /Next up/.test(r.kicker) && r.h1==='Reading response' && r.block && r.rows[0].t==='Essay draft' && r.aheadMins.join()==='75', {kicker:r.kicker, h1:r.h1, rows:r.rows, mins:r.aheadMins});
  await fresh(ws,{seed:seedFor(1), payloadExtra:'mk("804","ECN 212","184221",1,"Reading response");'});
  r=JSON.parse(await ev(ws,READ));
  check('A5 a day already 75% full offers nothing extra', !r.aheadHero && !r.block, {rows:r.rows, block:r.block});
  // A6 phone width renders the same hero without leaks
  await fresh(ws,{seed:seedFor(2), mobile:true});
  r=JSON.parse(await ev(ws,READ));
  check('A6 phone: the head-start hero and block render, nothing leaked', r.aheadHero && r.block && !r.leaked, r);
  console.log('\nJS errors during run:', errs.length? errs.slice(0,4) : 'none');
  console.log(`\n${fail? fail+' FAILED' : 'ALL OK'}  (${pass} passed)`);
  ws.close(); process.exit(fail?1:0);
})().catch(e=>{ console.log('HARNESS ERROR', e.message); process.exit(2); });

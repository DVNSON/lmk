/* The semester recap and its countdown, and the Canvas page's sprint link, in a real headless Chrome against the PUBLIC build.
   (Until v77.0 this was test-rooms-ui.js and also drove the class rooms; the rooms are gone, these tests stayed.)
   Run:  cd ~/lmk-web && python3 -m http.server 8899 &
         "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 --user-data-dir=/tmp/lmk-cdp-wi about:blank &
         node tools/test-recap.js
   The worker is stubbed at window.fetch (installed before the page's own script runs). Needs node 22+ (global WebSocket). */
const {execSync}=require('child_process'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{ if(r&&r.exceptionDetails) throw new Error((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text); return r&&r.result?r.result.value:undefined; });
let pass=0, fail=0; const check=(n,ok,d)=>{ console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+(d===undefined?'':JSON.stringify(d)).slice(0,260))); ok?pass++:fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const SID='a41f9c02'+'0'.repeat(24), SEC='s'.repeat(40);
const PAYLOAD = `(function(){ const now=Date.now(); const it={}, mk=(aid,c,cid,d,t)=>it[aid]={t,c,cid,due:new Date(now+d*864e5).toISOString(),pts:10,st:"online_upload",grp:"g",k:"",sub:"",score:null,url:"https://x/"+aid,desc:"",rub:"",fb:""};
  mk("901","ECN 212","184220",2,"Problem set 4"); mk("902","ECN 212","184220",5,"Problem set 5"); mk("903","HST 102","190001",3,"Reading response 6");
  return {lmk:"canvas",v:3,at:now,host:"canvas.asu.edu",items:it,groups:{},courses:[{id:"184220",tag:"ECN 212",wt:true,uuid:"Uu1dEcn212"},{id:"190001",tag:"HST 102",wt:true,uuid:"Uu1dHst102"}]}; })()`;
const STUB = `(function(){ const J=o=>new Response(JSON.stringify(o),{status:200,headers:{"content-type":"application/json"}});
  window.fetch=async function(u,o){ const url=String(u);
    if(/\\/config$/.test(url)) return J({ok:true,announce:null,storeUrl:"",units:{}});
    return J({ok:false}); }; })()`;
async function fresh(ws, {seed={onboarded:0}, ls={}, hash='', mobile=false}={}){
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:mobile?500:1100,height:900,deviceScaleFactor:1,mobile});
  /* Seed at document start, from about:blank, so the app boots on the seed every time. Writing localStorage
     into a running page races its own saves (remote config, the since stamp) and lost the seed. */
  const src = `try{ localStorage.clear(); sessionStorage.clear(); localStorage.setItem('duenorth_v1', ${JSON.stringify(JSON.stringify(seed))}); ${Object.entries(ls).map(([k,v])=>`localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(String(v))});`).join('')} }catch(_){}`;
  const {identifier} = await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:src});
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(150);
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'+hash}); await sleep(2600);
  await send(ws,'Page.removeScriptToEvaluateOnNewDocument',{identifier});
}
const SYNCED = {onboarded:1, profile:{name:"Emiel"}, cloud:{sid:SID, secret:SEC, on:true, at:1}, ext:null};
(async()=>{
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable'); await send(ws,'Network.enable'); await send(ws,'Network.setCacheDisabled',{cacheDisabled:true});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:STUB});
  const errs=[]; ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.method==='Runtime.exceptionThrown') errs.push(String((m.params.exceptionDetails.exception||{}).description||'').slice(0,160));});

  let r;
  // P1 the Canvas line's sprint link: #study=<id>&sprint=1 opens the Study screen with the timer running
  await fresh(ws,{seed:SYNCED});
  await ev(ws,`window.postMessage({lmk:'ext-hello', version:'0.6.1'}, '*'); window.postMessage({lmk:'canvas-payload', payload:${PAYLOAD}}, '*')`); await sleep(900);
  await ev(ws,`location.hash='#study=901&sprint=1'`); await send(ws,'Page.reload'); await sleep(2600);
  r=JSON.parse(await ev(ws,`JSON.stringify({open:!document.getElementById('studyPage').hidden, sprint:sprint?sprint.id:null, left:sprint?Math.round((sprint.end-Date.now())/60000):null, hash:location.hash})`));
  check('P1 #study=901&sprint=1 opens the assignment and starts a 25-minute sprint on it', r.open && r.sprint==='a901' && r.left>=24 && r.hash==='#study=901', r);
  await ev(ws,`stopSprint(false); closeStudy({fromHistory:true})`); await sleep(200);
  // K1 the semester-recap countdown: derived from the latest due date (+3), placed under the hero in the last two weeks
  r=JSON.parse(await ev(ws,`JSON.stringify({days:recapDays(), txt:(document.querySelector('.recapline .txt')||{}).textContent, idx:[...document.querySelectorAll('#view-now > *')].findIndex(x=>x.classList.contains('recapline')), hide:!!document.querySelector('[data-act="recap-hide"]')})`));
  check('K1 countdown: 8 days (latest due +5d, +3), under the hero, no Hide button this close', r.days===8 && /lands in 8 days/.test(r.txt) && r.idx===1 && !r.hide, r);
  await ev(ws,`document.querySelector('[data-act="recap-info"]').click()`); await sleep(300);
  r=JSON.parse(await ev(ws,`JSON.stringify({open:recapOverlay.classList.contains('open'), title:document.getElementById('recapTitle').textContent, items:document.querySelectorAll('#recapModal li').length, priv:/leaves your device/.test(document.getElementById('recapModal').textContent), txt:document.getElementById('recapModal').textContent})`));
  check('K1 the sheet says the date, lists five things (no time spent, v75.1) and the privacy line', r.open && /Ready 3 days after your last due date/.test(r.title) && r.items===5 && !/measured|hours|estimates/i.test(r.txt) && r.priv, r);
  await send(ws,'Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27}); await sleep(200);
  check('K1 Escape closes it', (await ev(ws,`recapOverlay.classList.contains('open')`))===false);
  // K2 a semester with 60 days left: the line sits at the bottom with Hide, and Hide sticks in the store
  await fresh(ws,{seed:SYNCED});
  await ev(ws,`window.postMessage({lmk:'ext-hello', version:'0.6.1'}, '*'); window.postMessage({lmk:'canvas-payload', payload:(function(){ const p=${PAYLOAD}; p.items["905"]=Object.assign({},p.items["903"],{t:"Final paper",due:new Date(Date.now()+60*864e5).toISOString()}); return p; })()}, '*')`); await sleep(900);
  r=JSON.parse(await ev(ws,`JSON.stringify({days:recapDays(), kids:[...document.querySelectorAll('#view-now > *')].map(x=>x.className), hide:!!document.querySelector('[data-act="recap-hide"]')})`));
  const ri=r.kids.findIndex(c=>/recapline/.test(c));
  check('K2 countdown 63 days out sits at the bottom, with Hide', r.days===63 && ri>1 && ri===r.kids.length-1 && r.hide, {days:r.days, ri, n:r.kids.length});
  await ev(ws,`document.querySelector('[data-act="recap-hide"]').click()`); await sleep(300);
  r=JSON.parse(await ev(ws,`JSON.stringify({gone:!document.querySelector('.recapline'), stamped:!!store.recapHide, gear:!!document.querySelector('#setupSync [data-act="recap-info"]')})`));
  check('K2 Hide stamps the store, removes the line, and the gear still offers the sheet', r.gone && r.stamped && r.gear, r);

  // W1–W6 the semester recap, from local data only
  const mon = new Date().toISOString().slice(0,7);
  const WSEED = Object.assign({}, SYNCED, {done:{a901:Date.now()-2*864e5, a903:Date.now()-1*864e5}, dur:{a901:[{m:40,src:"track",at:Date.now()-2*864e5,p:45}], a903:[{m:70,src:"track",at:Date.now()-864e5,p:45}]},
    streakDays:[new Date(Date.now()-864e5).toISOString().slice(0,10), new Date().toISOString().slice(0,10)], spent:{a901:25}, XXdecks:{d1:{id:"d1",course:"ECN 212",title:"Ch 4",at:Date.now()-3*864e5,cards:[{seen:2},{seen:1},{seen:0}]}},
    since:Date.now()-30*864e5});
  await fresh(ws,{seed:WSEED});
  await ev(ws,`window.postMessage({lmk:'ext-hello', version:'0.6.1'}, '*'); window.postMessage({lmk:'canvas-payload', payload:${PAYLOAD}}, '*')`); await sleep(900);
  r=JSON.parse(await ev(ws,`(function(){ window.__txt=[]; const ft=CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText=function(t){ window.__txt.push(String(t)); return ft.apply(this,arguments); }; openWrapped('semester'); const P=document.getElementById('recapPage'); const card=k=>(P.querySelector('[data-card="'+k+'"]')||{}).textContent||null;
    return JSON.stringify({open:!P.hidden, title:(P.querySelector('.sp-title b')||{}).textContent, cards:[...P.querySelectorAll('[data-card]')].map(x=>x.dataset.card), head:card('headline'), ahead:card('ahead'), streak:card('streak'), tutor:card('tutor'), sprints:card('sprints'), mates:card('classmates'), grades:card('grades'), canvas:(()=>{const c=P.querySelector('#wrCanvas'); return c?[c.width,c.height]:null})(), leaked:/\\$\\{/.test(P.innerText), all:[...P.querySelectorAll('[data-card]')].map(x=>x.textContent).join(' | '), drawn:window.__txt.join(' | ')}); })()`));
  check('W1 the recap opens as "so far" with the cards that have data, in order', r.open && /so far/i.test(r.title) && r.cards.slice(0,3).join()==='headline,ahead,rhythm' && r.cards.includes('byclass') && r.cards.includes('bykind') && !r.cards.includes('bigone') && !r.cards.includes('pace') && r.cards.includes('months') && r.cards.includes('share') && !r.leaked, {cards:r.cards, title:r.title});
  check('W1 headline: 2 assignments across 2 classes on 2 days, and no hours', /2 assignments/.test(r.head) && /2 classes/.test(r.head) && /2 different days/.test(r.head) && !/[0-9] ?(h|m|min)\b|hour/i.test(r.head), r.head);
  // v75.1: LMK only times what happens on pages it can see (Docs, Slides and paper never show), so no card and no share
  // image may print a time spent, though this seed has 110 measured minutes and a 25-minute sprint
  const TIME = /[0-9] ?(h|min|minutes?|hours?)\b|[0-9]+ m\b|measured|hours went|of real work|took the most of you/i;
  check('W1 no card prints time spent', !TIME.test(r.all), (r.all.match(TIME)||[])[0]);
  check('W1 the share image prints no time spent, and counts the active days', r.drawn && !TIME.test(r.drawn) && /2 \| days with something finished/.test(r.drawn), (r.drawn||'').slice(0,300));
  check('W1 ahead of the clock: both finished before the due day', /2 of 2/.test(r.ahead), r.ahead);
  check('W1 streak card: longest 2', /2 days|2-day|2 day/.test(r.streak), r.streak);
  check('W1 the sprint card is there because one was run, and there is no classmates card (rooms are gone)', /1 sprint/.test(r.sprints) && !r.tutor && r.mates===null && !r.cards.includes('classmates'), {s:r.sprints, t:r.tutor, m:r.mates});
  check('W1 no grades card when Canvas sent no scores; no milestones under 50', r.grades===null && !r.cards.includes('milestones'), r.cards);
  check('W1 the share card is a story-sized canvas', r.canvas && r.canvas[0]===1080 && r.canvas[1]===1920, r.canvas);
  await ev(ws,`document.querySelector('#recapPage [data-act="wr-mode"][data-mode="year"]').click()`); await sleep(200);
  r=JSON.parse(await ev(ws,`JSON.stringify({title:(document.querySelector('#recapPage .sp-title b')||{}).textContent, head:(document.querySelector('#recapPage [data-card="headline"]')||{}).textContent})`));
  check('W2 the year view is the same deck over the calendar year', /Your 20[0-9][0-9]/.test(r.title) && /2 assignments/.test(r.head), r);
  await send(ws,'Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27}); await sleep(200);
  check('W2 Escape closes the recap', (await ev(ws,`document.getElementById('recapPage').hidden`))===true);
  // W4 with a semester that has ended, the line says the recap is ready and is not hideable
  await fresh(ws,{seed:WSEED});
  await ev(ws,`window.postMessage({lmk:'ext-hello', version:'0.6.1'}, '*'); window.postMessage({lmk:'canvas-payload', payload:(function(){ const p=${PAYLOAD}; for (const k in p.items) p.items[k].due=new Date(Date.now()-10*864e5).toISOString(); return p; })()}, '*')`); await sleep(900);
  r=JSON.parse(await ev(ws,`JSON.stringify({days:recapDays(), txt:(document.querySelector('.recapline .txt')||{}).textContent, hide:!!document.querySelector('[data-act="recap-hide"]'), open:!!document.querySelector('.recapline [data-act="recap-open"]')})`));
  check('W4 after the last due date + 3 the line says the recap is ready, with Open and no Hide', r.days<=0 && /recap is ready/i.test(r.txt) && r.open && !r.hide, r);
  await ev(ws,`document.querySelector('.recapline [data-act="recap-open"]').click()`); await sleep(300);
  r=JSON.parse(await ev(ws,`JSON.stringify({open:!document.getElementById('recapPage').hidden, title:(document.querySelector('#recapPage .sp-title b')||{}).textContent, seen:Object.keys(store.wrappedSeen||{}).length})`));
  check('W4 opening the final recap drops "so far" and stamps wrappedSeen', r.open && !/so far/i.test(r.title) && r.seen===1, r);
  await ev(ws,`closeWrapped()`);


  console.log('\\nJS errors during run:', errs.length? errs.slice(0,4) : 'none');
  if (errs.length) fail++;
  console.log(`\\n${fail? fail+' FAILED' : 'ALL OK'}  (${pass} passed)`);
  ws.close(); process.exit(fail?1:0);
})().catch(e=>{ console.log('HARNESS ERROR', e.message); process.exit(2); });

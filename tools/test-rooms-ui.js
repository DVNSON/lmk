/* Rooms, join links and the referral claim, in a real headless Chrome against the PUBLIC build.
   Run:  cd ~/lmk-web && python3 -m http.server 8899 &
         "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 --user-data-dir=/tmp/lmk-cdp-wi about:blank &
         node tools/test-rooms-ui.js
   The worker is stubbed at window.fetch (installed before the page's own script runs) so nothing here
   touches lmk-api; what the stub answers is what the sheet must render. Needs node 22+ (global WebSocket). */
const {execSync}=require('child_process'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{ if(r&&r.exceptionDetails) throw new Error((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text); return r&&r.result?r.result.value:undefined; });
let pass=0, fail=0; const check=(n,ok,d)=>{ console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+(d===undefined?'':JSON.stringify(d)).slice(0,260))); ok?pass++:fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const SID='a41f9c02'+'0'.repeat(24), SEC='s'.repeat(40);
const PAYLOAD = `(function(){ const now=Date.now(); const it={}, mk=(aid,c,cid,d,t)=>it[aid]={t,c,cid,due:new Date(now+d*864e5).toISOString(),pts:10,st:"online_upload",grp:"g",k:"",sub:"",score:null,url:"https://x/"+aid,desc:"",rub:"",fb:""};
  mk("901","ECN 212","184220",2,"Problem set 4"); mk("902","ECN 212","184220",5,"Problem set 5"); mk("903","HST 102","190001",3,"Reading response 6");
  return {lmk:"canvas",v:3,at:now,host:"canvas.asu.edu",items:it,groups:{},courses:[{id:"184220",tag:"ECN 212",wt:true},{id:"190001",tag:"HST 102",wt:true}]}; })()`;
/* the worker, as the page sees it: every call the app makes and what a room looks like */
const STUB = `(function(){ window.__calls=[]; window.__room={ok:true,member:false,count:3,course:"ECN 212: Microeconomic Principles",chat:""};
  const J=o=>new Response(JSON.stringify(o),{status:200,headers:{"content-type":"application/json"}});
  window.fetch=async function(u,o){ const url=String(u); const body=(()=>{ try{return JSON.parse((o||{}).body||"{}")}catch(_){return {}} })(); window.__calls.push({url:url.replace(/^https?:\\/\\/[^/]+/,""),body});
    if(/\\/room\\/count$/.test(url)) return J({ok:true,count:3});
    if(/\\/room\\/get$/.test(url)) return J(window.__room);
    if(/\\/room\\/join$/.test(url)) { window.__room={ok:true,member:true,count:4,course:"ECN 212",chat:"",roster:[{id:"m1",name:"Maya R.",handle:"Discord maya#4421",joined:1,me:false},{id:"m2",name:"Jordan P.",handle:"",joined:2,me:false},{id:"m3",name:"Sam T.",handle:"text 480-555",joined:3,me:false},{id:"me",name:body.name,handle:body.handle,joined:4,me:true}],sessions:[]}; return J(window.__room); }
    if(/\\/room\\/leave$/.test(url)) { window.__room={ok:true,member:false,count:3,course:"ECN 212",chat:""}; return J({ok:true,member:false}); }
    if(/\\/room\\/chat$/.test(url)) return J({ok:true,chat:body.url});
    if(/\\/ref\\/claim$/.test(url)) return J(window.__claim||{ok:true,paid:true,units:5,inviterPaid:true});
    if(/\\/plus\\/status$/.test(url)) return J({ok:true,plus:false,level:"free",credits:5,rooms:[]});
    if(/\\/config$/.test(url)) return J({ok:true,announce:null,storeUrl:"",units:{},plus:{tiers:{}},rooms:{on:true,units:5}});
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

  // J1 a fresh laptop opens an invite
  await fresh(ws,{hash:'#join=canvas.asu.edu.184220.b7c1d2e3&c=ECN%20212'});
  let r=JSON.parse(await ev(ws,`JSON.stringify({hash:location.hash, join:JSON.parse(localStorage.getItem('lmk_join')||'null'), kicker:(document.querySelector('section.view .hero .kicker')||{}).textContent, why:[...document.querySelectorAll('section.view .hero .why')].map(x=>x.textContent).join(' | '), w2:document.getElementById('wBody2').textContent, leaked:/\\$\\{/.test(document.body.innerText), calls:window.__calls.map(c=>c.url)})`));
  check('J1 the hash is stripped and the invite is kept in localStorage, not the store', r.hash==='' && r.join && r.join.code==='b7c1d2e3' && r.join.cid==='184220' && r.join.host==='canvas.asu.edu' && r.join.tag==='ECN 212', r.join);
  check('J1 the first-run hero says you were invited, names the class and the count', r.kicker==='You were invited' && /ECN 212 is on LMK with 3 classmates/.test(r.why), {k:r.kicker, why:r.why});
  check('J1 the welcome overlay step 2 is set from JS and names the class', /ECN 212 is already on LMK with 3 classmates/.test(r.w2), r.w2);
  check('J1 no template literal leaked into visible text', !r.leaked);
  check('J1 the count came from /room/count and nothing else was asked of the worker for rooms', r.calls.includes('/room/count') && !r.calls.some(u=>/\/room\/(get|join)|\/ref\/claim/.test(u)), r.calls);
  // J2 a reload without the hash keeps the invite
  await send(ws,'Page.reload'); await sleep(2200);
  r=JSON.parse(await ev(ws,`JSON.stringify({kicker:(document.querySelector('section.view .hero .kicker')||{}).textContent, join:!!localStorage.getItem('lmk_join')})`));
  check('J2 the invite survives a reload (the install reloads the tab)', r.kicker==='You were invited' && r.join, r);
  // J3 your own link is ignored; a malformed one is ignored
  await fresh(ws,{seed:SYNCED, hash:'#join=canvas.asu.edu.184220.a41f9c02&c=ECN%20212'});
  r=JSON.parse(await ev(ws,`JSON.stringify({join:localStorage.getItem('lmk_join'), hash:location.hash})`));
  check('J3 your own code does nothing', r.join===null && r.hash==='', r);
  await fresh(ws,{hash:'#join=evil.example.<script>.zz&c=%3Cb%3Ex'});
  r=JSON.parse(await ev(ws,`JSON.stringify({join:localStorage.getItem('lmk_join'), hash:location.hash, leaked:/evil\\.example|<script>|%3Cscript/i.test(document.getElementById('view-now').innerHTML+document.getElementById('welcomeOverlay').innerHTML)})`));
  check('J3 a malformed invite is dropped, its hash stripped, and nothing of it rendered', r.join===null && r.hash==='' && !r.leaked, r);
  await fresh(ws,{hash:'#ref=b7c1d2e3'});
  r=JSON.parse(await ev(ws,`JSON.stringify({join:JSON.parse(localStorage.getItem('lmk_join')||'null'), kicker:(document.querySelector('section.view .hero .kicker')||{}).textContent})`));
  check('J3 a plain #ref= is kept with no course and does not change the hero', r.join && r.join.code==='b7c1d2e3' && r.join.cid==='' && r.kicker!=='You were invited', r);

  // R1 synced, cloud on: the nudge at the bottom of Today, the room line on a course tab, the sheet
  await fresh(ws,{seed:SYNCED});
  await ev(ws,`window.postMessage({lmk:'ext-hello', version:'0.6.1'}, '*')`); await sleep(300);
  await ev(ws,`window.postMessage({lmk:'canvas-payload', payload:${PAYLOAD}}, '*')`); await sleep(900);
  r=JSON.parse(await ev(ws,`JSON.stringify({ext:!!store.ext, nudge:!!document.querySelector('[data-act="room-nudge-done"]'), chips:document.querySelectorAll('.intro .chips [data-act="room-open"]').length, lastCard:(document.querySelector('#view-now').lastElementChild||{}).className, heroFirst:(document.querySelector('#view-now').firstElementChild||{}).className})`));
  check('R1 after a sync the room nudge sits at the bottom of Today with one chip per class', r.ext && r.nudge && r.chips===2 && /intro/.test(r.lastCard), r);
  check('R1 the hero is still the first thing on screen', !/intro/.test(r.heroFirst), r.heroFirst);
  // compare what renderNow produces twice, not the live DOM: the first-sync reveal is animating there and the browser rewrites style attributes
  const stable = await ev(ws,`(function(){ const s1=document.createElement('section'), s2=document.createElement('section'); renderNow(s1); renderNow(s2); const a=s1.innerHTML, b=s2.innerHTML; if(a===b) return 'stable'; let i=0; while(i<a.length&&a[i]===b[i]) i++; return 'DIFF@'+i+' A='+a.slice(Math.max(0,i-60),i+100)+' ||| B='+b.slice(Math.max(0,i-60),i+100); })()`);
  check('R1 Today is byte-stable across renders with the nudge and no room fetched', stable==='stable', stable);
  await ev(ws,`document.querySelector('#courseChips [data-course="ECN 212"]').click()`); await sleep(700);
  r=JSON.parse(await ev(ws,`JSON.stringify({line:(document.querySelector('.roomline .txt')||{}).textContent, btn:(document.querySelector('.roomline [data-act="room-open"]')||{}).textContent, nudge:!!document.querySelector('[data-act="room-nudge-done"]'), calls:window.__calls.filter(c=>/room\\/get/.test(c.url)).map(c=>c.body.cid)})`));
  check('R1 a course tab shows the room line from the server: 3 classmates, not a member', /3 classmates on LMK/.test(r.line) && r.btn==="See who's here" && r.calls.includes('184220'), r);
  check('R1 the nudge does not show on a course tab', !r.nudge);
  await ev(ws,`document.querySelector('.roomline [data-act="room-open"]').click()`); await sleep(500);
  r=JSON.parse(await ev(ws,`JSON.stringify({open:roomOverlay.classList.contains('open'), title:document.getElementById('roomTitle').textContent, hasForm:!!document.getElementById('roomName'), name:document.getElementById('roomName').value, copy:document.getElementById('roomModal').textContent})`));
  check('R2 the sheet opens on the join form with the name prefilled from the welcome screen', r.open && r.title==='ECN 212' && r.hasForm && r.name==='Emiel' && /3 classmates from ECN 212 are here/.test(r.copy) && /confirmed are in ECN 212/.test(r.copy), {t:r.title,n:r.name});
  await ev(ws,`document.getElementById('roomHandle').value='Discord: emiel#0001'; document.querySelector('#roomModal [data-act="room-join"]').click()`); await sleep(600);
  r=JSON.parse(await ev(ws,`JSON.stringify({names:[...document.querySelectorAll('.roster .rname')].map(x=>x.textContent.trim()), reports:document.querySelectorAll('.roster [data-act="room-report"]').length, edit:document.querySelectorAll('.roster [data-act="room-edit"]').length, stored:[store.roomName, store.roomHandle], sent:window.__calls.filter(c=>/room\\/join/.test(c.url)).map(c=>c.body), line:(document.querySelector('.roomline .txt')||{}).textContent, chatForm:!!document.getElementById('roomChat')})`));
  check('R3 joining sends the typed name and handle and renders the roster with you marked', r.sent.length===1 && r.sent[0].name==='Emiel' && r.sent[0].handle==='Discord: emiel#0001' && r.names.length===4 && /Emiel\s*you/.test(r.names[3]) && r.reports===3 && r.edit===1, r);
  check('R3 the store holds only the two typed strings', r.stored[0]==='Emiel' && r.stored[1]==='Discord: emiel#0001', r.stored);
  check('R3 the course line now counts the others and offers Open', /3 classmates on LMK/.test(r.line) && r.chatForm, r.line);
  const share = await ev(ws,`roomShareText('184220','ECN 212')`);
  check('R4 the share text carries the join link with host, course and your code, and claims only what exists', /lmktoday\.app\/app\/#join=canvas\.asu\.edu\.184220\.a41f9c02&c=ECN%20212/.test(share) && /4 of us are on it/.test(share) && !/studying when/.test(share), share);
  await ev(ws,`document.getElementById('roomChat').value='https://groupme.com/join_group/1/abc'; document.querySelector('#roomModal [data-act="room-chat-set"]').click()`); await sleep(400);
  r=JSON.parse(await ev(ws,`JSON.stringify({chat:(document.querySelector('#roomModal a[href^="https://groupme"]')||{}).textContent})`));
  check('R5 the class chat link becomes a button', /Class chat/.test(r.chat), r);
  await ev(ws,`window.confirm=()=>true; document.querySelector('#roomModal [data-act="room-leave"]').click()`); await sleep(500);
  r=JSON.parse(await ev(ws,`JSON.stringify({open:roomOverlay.classList.contains('open'), left:window.__calls.some(c=>/room\\/leave/.test(c.url)), member:ROOMS.list.length})`));
  check('R6 leaving closes the sheet and forgets the membership', !r.open && r.left && r.member===0, r);
  await ev(ws,`document.querySelector('#courseChips [data-course=""]').click(); document.querySelector('[data-act="room-nudge-done"]').click()`); await sleep(300);
  r=JSON.parse(await ev(ws,`JSON.stringify({nudge:!!document.querySelector('[data-act="room-nudge-done"]'), stamped:!!store.roomNudge})`));
  check('R7 dismissing the nudge stamps the store and removes it', !r.nudge && r.stamped, r);

  // R8 cloud sync off: the sheet explains, asks nothing of the worker
  await fresh(ws,{seed:Object.assign({},SYNCED,{cloud:{sid:SID,secret:SEC,on:false,at:1}})});
  await ev(ws,`window.postMessage({lmk:'ext-hello', version:'0.6.1'}, '*'); window.postMessage({lmk:'canvas-payload', payload:${PAYLOAD}}, '*')`); await sleep(900);
  await ev(ws,`document.querySelector('#courseChips [data-course="HST 102"]').click()`); await sleep(300);
  await ev(ws,`document.querySelector('.roomline [data-act="room-open"]').click()`); await sleep(300);
  r=JSON.parse(await ev(ws,`JSON.stringify({copy:document.getElementById('roomModal').textContent, gets:window.__calls.filter(c=>/room\\/get/.test(c.url)).length, line:(document.querySelector('.roomline .txt')||{}).textContent})`));
  check('R8 with Sync from anywhere off, the line still invites and the sheet says what to turn on — no /room/get', /Sync from anywhere/.test(r.copy) && r.gets===0 && /Find classmates in HST 102/.test(r.line), r);
  await send(ws,'Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27}); await sleep(200);
  check('R8 Escape closes the sheet', (await ev(ws,`roomOverlay.classList.contains('open')`))===false);

  // C1 the claim: an invited student's first verified sync pays, opens the room, and clears the invite
  await fresh(ws,{seed:SYNCED, hash:'#join=canvas.asu.edu.184220.b7c1d2e3&c=ECN%20212'});
  await ev(ws,`window.postMessage({lmk:'ext-hello', version:'0.6.1'}, '*'); window.postMessage({lmk:'canvas-payload', payload:${PAYLOAD}}, '*')`); await sleep(2600);
  r=JSON.parse(await ev(ws,`JSON.stringify({claim:window.__calls.filter(c=>/ref\\/claim/.test(c.url)).map(c=>c.body), join:localStorage.getItem('lmk_join'), toast:[...document.querySelectorAll('.toast, #toast, .toasts *')].map(x=>x.textContent).join(' ')})`));
  check('C1 after the sync the claim is sent once with the code and the course', r.claim.length===1 && r.claim[0].code==='b7c1d2e3' && r.claim[0].cid==='184220' && r.claim[0].sid===SID, r.claim);
  check('C1 a paid claim clears the invite', r.join===null, r.join);
  await sleep(2600);
  r=JSON.parse(await ev(ws,`JSON.stringify({open:roomOverlay.classList.contains('open'), title:(document.getElementById('roomTitle')||{}).textContent})`));
  check('C1 the room opens for the invited course', r.open && r.title==='ECN 212', r);
  // C2 the server has not seen the sync yet: the invite is kept for the next one
  await fresh(ws,{seed:SYNCED, hash:'#join=canvas.asu.edu.184220.b7c1d2e3&c=ECN%20212'});
  await ev(ws,`window.__claim={ok:false,error:"cloud"}; window.postMessage({lmk:'ext-hello', version:'0.6.1'}, '*'); window.postMessage({lmk:'canvas-payload', payload:${PAYLOAD}}, '*')`); await sleep(2600);
  r=JSON.parse(await ev(ws,`JSON.stringify({join:!!localStorage.getItem('lmk_join'), claims:window.__calls.filter(c=>/ref\\/claim/.test(c.url)).length})`));
  check('C2 "cloud" keeps the invite for the next sync', r.join && r.claims===1, r);

  // A1 artifact mode: nothing of this exists
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:'window.claude={use:async()=>null}'});
  await fresh(ws,{seed:SYNCED, hash:'#join=canvas.asu.edu.184220.b7c1d2e3&c=ECN%20212'});
  await ev(ws,`window.postMessage({lmk:'canvas-payload', payload:${PAYLOAD}}, '*')`); await sleep(900);
  r=JSON.parse(await ev(ws,`JSON.stringify({mode:MODE, nudge:!!document.querySelector('[data-act="room-nudge-done"]'), line:!!document.querySelector('.roomline'), kicker:(document.querySelector('section.view .hero .kicker')||{}).textContent, calls:window.__calls.filter(c=>/room|ref/.test(c.url)).length})`));
  check('A1 artifact mode shows no nudge, no room line, no invite card, and asks the worker nothing', r.mode==='artifact' && !r.nudge && !r.line && r.kicker!=='You were invited' && r.calls===0, r);

  console.log('\\nJS errors during run:', errs.length? errs.slice(0,4) : 'none');
  if (errs.length) fail++;
  console.log(`\\n${fail? fail+' FAILED' : 'ALL OK'}  (${pass} passed)`);
  ws.close(); process.exit(fail?1:0);
})().catch(e=>{ console.log('HARNESS ERROR', e.message); process.exit(2); });

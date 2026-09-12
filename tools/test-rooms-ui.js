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
  return {lmk:"canvas",v:3,at:now,host:"canvas.asu.edu",items:it,groups:{},courses:[{id:"184220",tag:"ECN 212",wt:true,uuid:"Uu1dEcn212"},{id:"190001",tag:"HST 102",wt:true,uuid:"Uu1dHst102"}]}; })()`;
/* the worker, as the page sees it: every call the app makes and what a room looks like */
const STUB = `(function(){ window.__calls=[]; window.__room={ok:true,member:false,count:3,course:"ECN 212: Microeconomic Principles",chat:""};
  const J=o=>new Response(JSON.stringify(o),{status:200,headers:{"content-type":"application/json"}});
  window.fetch=async function(u,o){ const url=String(u); const body=(()=>{ try{return JSON.parse((o||{}).body||"{}")}catch(_){return {}} })(); window.__calls.push({url:url.replace(/^https?:\\/\\/[^/]+/,""),body});
    if(/\\/room\\/count$/.test(url)) return J({ok:true,count:3});
    if(/\\/room\\/get$/.test(url)) return J(window.__room);
    if(/\\/room\\/join$/.test(url)) { const at=new Date(); at.setHours(19,0,0,0); window.__room={ok:true,member:true,count:4,course:"ECN 212",chat:"",roster:[{id:"m1",name:"Maya R.",handle:"Discord maya#4421",joined:1,me:false},{id:"m2",name:"Jordan P.",handle:"",joined:2,me:false},{id:"m3",name:"Sam T.",handle:"text 480-555",joined:3,me:false},{id:"me",name:body.name,handle:body.handle,joined:4,me:true}],sessions:[{id:"s1",at:at.getTime(),place:"library",note:"Hayden 2nd floor",aid:"901",by:{id:"m1",name:"Maya R."},mine:false,going:[{id:"m1",name:"Maya R."},{id:"m2",name:"Jordan P."}],me:false}]}; return J(window.__room); }
    if(/\\/room\\/session$/.test(url)) { const R=window.__room, me={id:"me",name:"Emiel"}; if(body.action==="in"){ const x=R.sessions.find(x=>x.id===body.id); if(x){x.me=true;x.going.push(me);} } if(body.action==="out"){ const x=R.sessions.find(x=>x.id===body.id); if(x){x.me=false;x.going=x.going.filter(g=>g.id!=="me");} } if(body.action==="propose"){ R.sessions.push({id:"s2",at:body.at,place:body.place,note:body.note,aid:body.aid,by:me,mine:true,going:[me],me:true}); } if(body.action==="cancel"){ R.sessions=R.sessions.filter(x=>!(x.id===body.id&&x.mine)); } return J(R); }
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
  // S1–S4 sessions inside the sheet and on Today
  r=JSON.parse(await ev(ws,`JSON.stringify({rows:[...document.querySelectorAll('.sesslist li')].map(x=>x.textContent), inBtn:!!document.querySelector('[data-act="sess-in"][data-id="s1"]'), form:!!document.getElementById('sessAt'), todayCard:!!document.querySelector('#view-now .item .t') && [...document.querySelectorAll('#view-now .item .t')].some(x=>/^Study ECN 212/.test(x.textContent))})`));
  check('S1 the sheet lists the session with place, note, the assignment and who is going, and offers I\'m in', r.rows.length===1 && /Library/.test(r.rows[0]) && /Hayden 2nd floor/.test(r.rows[0]) && /Working on Problem set 4/.test(r.rows[0]) && /2 going: Maya R., Jordan P./.test(r.rows[0]) && r.inBtn && r.form && !r.todayCard, r);
  await ev(ws,`document.querySelector('[data-act="sess-in"][data-id="s1"]').click()`); await sleep(500);
  r=JSON.parse(await ev(ws,`JSON.stringify({sent:window.__calls.filter(c=>/room\\/session/.test(c.url)).map(c=>c.body.action), row:(document.querySelector('.sesslist li')||{}).textContent, mins:sessMinsToday(), today:[...document.querySelectorAll('#view-now .item .t')].map(x=>x.textContent).find(x=>/^Study/.test(x)), count:(document.querySelector('#view-now h2.sec .count')||{}).textContent, line:(document.querySelector('.roomline .txt')||{}).textContent})`));
  check('S2 I\'m in: the session is on Today with who and 90 minutes in the budget, and the course line names it', r.sent.join()==='in' && /3 going/.test(r.row) && /Can't make it/.test(r.row) && r.mins===90 && /^Study ECN 212 with Maya R. and Jordan P./.test(r.today||'') && /^2 things/.test(r.count) && /Session .*you're in/.test(r.line), {sent:r.sent, mins:r.mins, today:r.today, count:r.count, line:r.line.slice(0,80)});
  await ev(ws,`document.getElementById('sessNote').value='Noble library, 3rd floor'; document.getElementById('sessPlace').value='campus'; document.querySelector('[data-act="sess-propose"]').click()`); await sleep(500);
  r=JSON.parse(await ev(ws,`JSON.stringify({sent:window.__calls.filter(c=>/room\\/session/.test(c.url)).map(c=>c.body).slice(-1)[0], rows:document.querySelectorAll('.sesslist li').length, cancel:!!document.querySelector('[data-act="sess-cancel"][data-id="s2"]')})`));
  check('S3 proposing sends when, where and the note, and the new session is yours to cancel', r.sent.action==='propose' && r.sent.place==='campus' && r.sent.note==='Noble library, 3rd floor' && r.sent.at>Date.now() && r.rows===2 && r.cancel, r);
  r=JSON.parse(await ev(ws,`(function(){ const li=document.querySelector('.sesslist li'); const g=li.querySelector('a[href^="https://calendar.google.com/calendar/render"]'), i=li.querySelector('a[download="lmk-session.ics"]'); const ics=i?decodeURIComponent(i.getAttribute('href').split(',')[1]):''; return JSON.stringify({g:g&&g.href, ics:ics.slice(0,400)}); })()`));
  check('S3b a session has Google Calendar and .ics links: 90 minutes, the place and note, LMK in the description', /text=Study%20ECN%20212/.test(r.g||'') && /dates=\d{8}T\d{6}Z%2F\d{8}T\d{6}Z|dates=\d{8}T\d{6}Z\/\d{8}T\d{6}Z/.test(r.g||'') && /BEGIN:VCALENDAR/.test(r.ics) && /SUMMARY:Study ECN 212/.test(r.ics) && /LOCATION:Library · Hayden 2nd floor/.test(r.ics) && /lmktoday\.app/.test(r.ics), r);
  await ev(ws,`document.querySelector('[data-act="sess-cancel"][data-id="s2"]').click()`); await sleep(400);
  await ev(ws,`document.querySelector('[data-act="sess-out"][data-id="s1"]').click()`); await sleep(400);
  r=JSON.parse(await ev(ws,`JSON.stringify({rows:document.querySelectorAll('.sesslist li').length, mins:sessMinsToday(), today:[...document.querySelectorAll('#view-now .item .t')].some(x=>/^Study/.test(x.textContent))})`));
  check('S4 cancel and out: back to one session, nothing on Today, no minutes', r.rows===1 && r.mins===0 && !r.today, r);
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

  // P1 the Canvas line's sprint link: #study=<id>&sprint=1 opens the Study screen with the timer running
  await ev(ws,`location.hash='#study=901&sprint=1'`); await send(ws,'Page.reload'); await sleep(2600);
  r=JSON.parse(await ev(ws,`JSON.stringify({open:!document.getElementById('studyPage').hidden, sprint:sprint?sprint.id:null, left:sprint?Math.round((sprint.end-Date.now())/60000):null, hash:location.hash})`));
  check('P1 #study=901&sprint=1 opens the assignment and starts a 25-minute sprint on it', r.open && r.sprint==='a901' && r.left>=24 && r.hash==='#study=901', r);
  await ev(ws,`stopSprint(false); closeStudy({fromHistory:true})`); await sleep(200);
  // K1 the semester-recap countdown: derived from the latest due date (+3), placed under the hero in the last two weeks
  r=JSON.parse(await ev(ws,`JSON.stringify({days:recapDays(), txt:(document.querySelector('.recapline .txt')||{}).textContent, idx:[...document.querySelectorAll('#view-now > *')].findIndex(x=>x.classList.contains('recapline')), hide:!!document.querySelector('[data-act="recap-hide"]')})`));
  check('K1 countdown: 8 days (latest due +5d, +3), under the hero, no Hide button this close', r.days===8 && /lands in 8 days/.test(r.txt) && r.idx===1 && !r.hide, r);
  await ev(ws,`document.querySelector('[data-act="recap-info"]').click()`); await sleep(300);
  r=JSON.parse(await ev(ws,`JSON.stringify({open:recapOverlay.classList.contains('open'), title:document.getElementById('recapTitle').textContent, items:document.querySelectorAll('#recapModal li').length, priv:/leaves your device/.test(document.getElementById('recapModal').textContent)})`));
  check('K1 the sheet says the date, lists six things and the privacy line', r.open && /Ready 3 days after your last due date/.test(r.title) && r.items===6 && r.priv, r);
  await send(ws,'Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27}); await sleep(200);
  check('K1 Escape closes it', (await ev(ws,`recapOverlay.classList.contains('open')`))===false);
  // K2 a semester with 60 days left: the line sits at the bottom with Hide, and Hide sticks in the store
  await fresh(ws,{seed:SYNCED});
  await ev(ws,`window.postMessage({lmk:'ext-hello', version:'0.6.1'}, '*'); window.postMessage({lmk:'canvas-payload', payload:(function(){ const p=${PAYLOAD}; p.items["905"]=Object.assign({},p.items["903"],{t:"Final paper",due:new Date(Date.now()+60*864e5).toISOString()}); return p; })()}, '*')`); await sleep(900);
  r=JSON.parse(await ev(ws,`JSON.stringify({days:recapDays(), kids:[...document.querySelectorAll('#view-now > *')].map(x=>x.className), hide:!!document.querySelector('[data-act="recap-hide"]')})`));
  const ri=r.kids.findIndex(c=>/recapline/.test(c)), ni=r.kids.findIndex(c=>/intro/.test(c)&&!/recapline/.test(c));
  check('K2 countdown 63 days out sits at the bottom, before the nudge, with Hide', r.days===63 && ri>1 && ri===r.kids.length-2 && ni===r.kids.length-1 && r.hide, {days:r.days, ri, ni, n:r.kids.length});
  await ev(ws,`document.querySelector('[data-act="recap-hide"]').click()`); await sleep(300);
  r=JSON.parse(await ev(ws,`JSON.stringify({gone:!document.querySelector('.recapline'), stamped:!!store.recapHide, gear:!!document.querySelector('#setupSync [data-act="recap-info"]')})`));
  check('K2 Hide stamps the store, removes the line, and the gear still offers the sheet', r.gone && r.stamped && r.gear, r);

  // K3 the admin Ops tab renders the rooms card and a report row from the worker's bundle
  r=JSON.parse(await ev(ws,`(function(){ ADMIN.key='k'; ADMIN.tab='ops'; ADMIN.data={ok:true,settings:{},tutor:{configured:true},plus:{webhook:true,plusLink:'x',tray:{}},cost:null,revenue:null,lmsHosts:[],rooms:{rooms:2,members:5,filled:1,sessionsWeek:3,referrals:4,refUnits:40,reports:[{id:'r1',host:'canvas.asu.edu',cid:'184220',by:'bbbbbbbb',about:'m1',aboutCode:'aaaaaaaa',what:'spam handle',at:Date.now()-60000}]},ops:{cronAt:Date.now(),pushAt:Date.now(),version:12},cloud:{errors:0},problems:[],errs:[],today:{},totals:{},days:{},allTime:{},firstDay:'2026-09-01',todayKey:'2026-09-11',errToday:0};
    const sc=document.createElement('section'); try { renderAdmin(sc); } catch(e) { return JSON.stringify({err:e.message}); }
    const t=sc.textContent; return JSON.stringify({tiles:/2\\s*Rooms|Rooms\\s*2/.test(t.replace(/\\s+/g,' ')) || /5 members/.test(t), report:/spam handle/.test(t), seen:!!sc.querySelector('[data-act="adm-room-seen"][data-id="r1"]'), remove:!!sc.querySelector('[data-act="adm-room-remove"][data-sid="aaaaaaaa"]'), badge:(sc.querySelector('[data-tab="ops"] .badge')||{}).textContent}); })()`));
  check('K3 admin Ops: rooms tiles, the report row with Seen and Remove, and an Ops badge', !r.err && r.tiles && r.report && r.seen && r.remove && r.badge==='1', r);
  await ev(ws,`ADMIN.key=null; ADMIN.data=null; ADMIN.tab='overview'`);

  // W1–W6 the semester recap, from local data only
  const mon = new Date().toISOString().slice(0,7);
  const WSEED = Object.assign({}, SYNCED, {done:{a901:Date.now()-2*864e5, a903:Date.now()-1*864e5}, dur:{a901:[{m:40,src:"track",at:Date.now()-2*864e5,p:45}], a903:[{m:70,src:"track",at:Date.now()-864e5,p:45}]},
    streakDays:[new Date(Date.now()-864e5).toISOString().slice(0,10), new Date().toISOString().slice(0,10)], spent:{a901:25}, decks:{d1:{id:"d1",course:"ECN 212",title:"Ch 4",at:Date.now()-3*864e5,cards:[{seen:2},{seen:1},{seen:0}]}},
    tutorUse:{[mon]:{chat:4,quiz:1,cards:1}}, sessLog:{s9:Date.now()-864e5}, since:Date.now()-30*864e5});
  await fresh(ws,{seed:WSEED});
  await ev(ws,`window.postMessage({lmk:'ext-hello', version:'0.6.1'}, '*'); window.postMessage({lmk:'canvas-payload', payload:${PAYLOAD}}, '*')`); await sleep(900);
  r=JSON.parse(await ev(ws,`(function(){ openWrapped('semester'); const P=document.getElementById('recapPage'); const card=k=>(P.querySelector('[data-card="'+k+'"]')||{}).textContent||null;
    return JSON.stringify({open:!P.hidden, title:(P.querySelector('.sp-title b')||{}).textContent, cards:[...P.querySelectorAll('[data-card]')].map(x=>x.dataset.card), head:card('headline'), ahead:card('ahead'), streak:card('streak'), tutor:card('tutor'), sprints:card('sprints'), mates:card('classmates'), grades:card('grades'), canvas:(()=>{const c=P.querySelector('#wrCanvas'); return c?[c.width,c.height]:null})(), leaked:/\\$\\{/.test(P.innerText)}); })()`));
  check('W1 the recap opens as "so far" with the cards that have data, in order', r.open && /so far/i.test(r.title) && r.cards.slice(0,3).join()==='headline,ahead,rhythm' && r.cards.includes('byclass') && r.cards.includes('bykind') && r.cards.includes('bigone') && r.cards.includes('pace') && r.cards.includes('months') && r.cards.includes('share') && !r.leaked, {cards:r.cards, title:r.title});
  check('W1 headline: 2 assignments across 2 classes, hours from measured minutes', /2 assignments/.test(r.head) && /2 classes/.test(r.head) && /1 h 50 m|1h 50m|110 min|1\.8 h/.test(r.head), r.head);
  check('W1 ahead of the clock: both finished before the due day', /2 of 2/.test(r.ahead), r.ahead);
  check('W1 streak card: longest 2', /2 days|2-day|2 day/.test(r.streak), r.streak);
  check('W1 tutor, sprints, classmates cards only because they were used', /4 conversation/.test(r.tutor) && /1 quiz/.test(r.tutor) && /3 cards made/.test(r.tutor) && /3 reviews|3 times/.test(r.tutor) && /1 sprint/.test(r.sprints) && /25 min/.test(r.sprints) && /1 session/.test(r.mates), {t:r.tutor, s:r.sprints, m:r.mates});
  check('W1 no grades card when Canvas sent no scores; no milestones under 50', r.grades===null && !r.cards.includes('milestones'), r.cards);
  check('W1 the share card is a story-sized canvas', r.canvas && r.canvas[0]===1080 && r.canvas[1]===1920, r.canvas);
  await ev(ws,`document.querySelector('#recapPage [data-act="wr-mode"][data-mode="year"]').click()`); await sleep(200);
  r=JSON.parse(await ev(ws,`JSON.stringify({title:(document.querySelector('#recapPage .sp-title b')||{}).textContent, head:(document.querySelector('#recapPage [data-card="headline"]')||{}).textContent})`));
  check('W2 the year view is the same deck over the calendar year', /Your 20[0-9][0-9]/.test(r.title) && /2 assignments/.test(r.head), r);
  await send(ws,'Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27}); await sleep(200);
  check('W2 Escape closes the recap', (await ev(ws,`document.getElementById('recapPage').hidden`))===true);
  // W3 the tutor counter and the session log are written where the work happens
  r=JSON.parse(await ev(ws,`(function(){ tutorUseBump('chat'); tutorUseBump('quiz'); const m=new Date().toISOString().slice(0,7); return JSON.stringify(store.tutorUse[m]); })()`));
  check('W3 tutorUseBump counts per month', r.chat===5 && r.quiz===2 && r.cards===1, r);
  // W4 with a semester that has ended, the line says the recap is ready and is not hideable
  await fresh(ws,{seed:WSEED});
  await ev(ws,`window.postMessage({lmk:'ext-hello', version:'0.6.1'}, '*'); window.postMessage({lmk:'canvas-payload', payload:(function(){ const p=${PAYLOAD}; for (const k in p.items) p.items[k].due=new Date(Date.now()-10*864e5).toISOString(); return p; })()}, '*')`); await sleep(900);
  r=JSON.parse(await ev(ws,`JSON.stringify({days:recapDays(), txt:(document.querySelector('.recapline .txt')||{}).textContent, hide:!!document.querySelector('[data-act="recap-hide"]'), open:!!document.querySelector('.recapline [data-act="recap-open"]')})`));
  check('W4 after the last due date + 3 the line says the recap is ready, with Open and no Hide', r.days<=0 && /recap is ready/i.test(r.txt) && r.open && !r.hide, r);
  await ev(ws,`document.querySelector('.recapline [data-act="recap-open"]').click()`); await sleep(300);
  r=JSON.parse(await ev(ws,`JSON.stringify({open:!document.getElementById('recapPage').hidden, title:(document.querySelector('#recapPage .sp-title b')||{}).textContent, seen:Object.keys(store.wrappedSeen||{}).length})`));
  check('W4 opening the final recap drops "so far" and stamps wrappedSeen', r.open && !/so far/i.test(r.title) && r.seen===1, r);
  await ev(ws,`closeWrapped()`);

  // R8 the proof: every room call carries sha256(host|cid|uuid), never the uuid; without a uuid (old extension) the sheet says so and asks nothing
  await fresh(ws,{seed:SYNCED});
  await ev(ws,`window.postMessage({lmk:'ext-hello', version:'0.6.1'}, '*'); window.postMessage({lmk:'canvas-payload', payload:${PAYLOAD}}, '*')`); await sleep(900);
  await ev(ws,`document.querySelector('#courseChips [data-course="ECN 212"]').click()`); await sleep(700);
  await ev(ws,`document.querySelector('.roomline [data-act="room-open"]').click()`); await sleep(500);
  await ev(ws,`document.querySelector('#roomModal [data-act="room-join"]').click()`); await sleep(600);
  r=JSON.parse(await ev(ws,`(async function(){ const p=await courseProof('184220'); const calls=window.__calls.filter(c=>/room\\/(get|join)/.test(c.url)); return JSON.stringify({p, sent:calls.map(c=>c.body.proof), host:calls[0]&&calls[0].body.host, uuidLeaked:calls.some(c=>JSON.stringify(c.body).includes('Uu1d'))}); })()`));
  check('R8 room calls carry the proof hash and the host, and never the uuid', /^[a-f0-9]{64}$/.test(r.p) && r.sent.length>0 && r.sent.every(x=>x===r.p) && r.host==='canvas.asu.edu' && !r.uuidLeaked, {p:r.p&&r.p.slice(0,12), n:r.sent.length, host:r.host, leaked:r.uuidLeaked});
  await fresh(ws,{seed:Object.assign({},SYNCED,{cloud:{sid:SID,secret:SEC,on:false,at:1}})});
  await ev(ws,`window.postMessage({lmk:'ext-hello', version:'0.6.1'}, '*'); window.postMessage({lmk:'canvas-payload', payload:(function(){ const p=${PAYLOAD}; p.courses.forEach(c=>{ delete c.uuid; }); return p; })()}, '*')`); await sleep(900);
  await ev(ws,`document.querySelector('#courseChips [data-course="HST 102"]').click()`); await sleep(300);
  await ev(ws,`document.querySelector('.roomline [data-act="room-open"]').click()`); await sleep(300);
  r=JSON.parse(await ev(ws,`JSON.stringify({copy:document.getElementById('roomModal').textContent, gets:window.__calls.filter(c=>/room\\/get/.test(c.url)).length, line:(document.querySelector('.roomline .txt')||{}).textContent})`));
  check('R8 with no course code from the extension (pre-0.7), the sheet says what is needed and asks the worker nothing', /0\.7/.test(r.copy) && /only that class/.test(r.copy) && r.gets===0 && /Find classmates in HST 102/.test(r.line), r);
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
  await ev(ws,`window.__claim={ok:false,error:"proof"}; window.postMessage({lmk:'ext-hello', version:'0.6.1'}, '*'); window.postMessage({lmk:'canvas-payload', payload:${PAYLOAD}}, '*')`); await sleep(2600);
  r=JSON.parse(await ev(ws,`JSON.stringify({join:!!localStorage.getItem('lmk_join'), claims:window.__calls.filter(c=>/ref\\/claim/.test(c.url)).map(c=>({proof:c.body.proof, host:c.body.host}))})`));
  check('C2 "proof" keeps the invite for the next sync, and the claim carried the course proof', r.join && r.claims.length===1 && /^[a-f0-9]{64}$/.test(r.claims[0].proof||'') && r.claims[0].host==='canvas.asu.edu', r);

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

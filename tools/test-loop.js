/* The classmates loop, start to finish, as the students it is built for, on the devices it really happens on.
   A (set up, laptop) joins the MAT 210 room, shares the link and proposes a session. B opens the link on a
   PHONE from the class chat, does the computer step later on a laptop that never saw the link, then signs in
   with Google on the phone — and must land in the room. C opens the link on a laptop and sets up in the same
   sitting, Canvas answering BEFORE "Let's go" mints the cloud id. A comes back and sees them.
   The worker is loop-worker.js (rooms.js in memory, spawned here); Google is stubbed one layer down (token +
   Drive REST), so webSignIn → gdrivePull → merge → refClaimMaybe is the real code. Written for v70.0, when the
   phone path — the way a group-chat invite is actually opened — claimed nothing, the toast called the course a
   person, and the room opened for nobody. Every line here is a screen a student saw in the walkthrough.
   Run: node test-loop.js   (needs :8899 serving ~/lmk-web and a FRESH headless Chrome on :9333) */
const {execSync, spawn}=require('child_process'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text);return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,300)));ok?pass++:fail++;};
const T0=Date.now(); const say=(who,what)=>console.log(`     [${who} +${String(Math.round((Date.now()-T0)/1000)).padStart(3)}s] ${what}`);
const PORT=+process.env.LOOP_PORT||8902;
const IPHONE="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const HOST='canvas.asu.edu', CID='269886', UUID='k9XbQ2mV7pLtR4sWcE1nH8dJ3fA6gY0uZ5oT2iB4';   // a made-up course code: the proof is its hash
const SID_A='a1b2c3d4'+'e'.repeat(24), SEC_A='s'.repeat(40), CODE_A=SID_A.slice(0,8);
const SEED_A={onboarded:1, profile:{name:"Emiel"}, cloud:{sid:SID_A, secret:SEC_A, on:true, at:1}, ext:null};
/* what the extension hands the page for one MAT 210 section — the same section for everyone, so the proofs match */
const payload=()=>{ const items={}, now=Date.now();
  [['9001','Problem Set 4',3,10],['9002','Quiz 3',6,20],['9003','Midterm 1',12,100]].forEach(([aid,t,d,pts])=>{items[aid]={t,c:'MAT 210',cid:CID,due:new Date(now+d*864e5).toISOString(),pts,grp:'1347922',st:'online_upload',k:'',sub:'',subAt:'',score:null,url:`https://${HOST}/courses/${CID}/assignments/${aid}`,desc:'',rub:'',fb:''}});
  return {lmk:'canvas',v:3,at:now,host:HOST,items,groups:{[CID]:[{id:'1347922',name:'Edfinity Homework',w:10}]},courses:[{id:CID,tag:'MAT 210',name:'MAT 210: Brief Calculus',uuid:UUID,wt:true,cur:88,fin:40}]}; };
const POST=`window.postMessage({lmk:'ext-hello',version:'0.8.9'},'*'); window.postMessage({lmk:'canvas-payload',payload:${JSON.stringify(payload())}},'*'); 1`;
/* the worker is redirected to the stand-in; share/clipboard and every toast are captured; the claim and the
   counter bodies are kept so the test can read what left the device */
const STUB=`(function(){
  const real=window.fetch; window.__shared=[]; window.__toasts=[]; window.__calls=[];
  window.fetch=(u,o)=>{ const url=String(u); if(/\\/ref\\/claim$|\\/hit$/.test(url)) { try{ window.__calls.push({url:url.replace(/^.*?(\\/[a-z]+\\/?[a-z]*)$/,'$1'), body:JSON.parse((o||{}).body||'{}')}); }catch(_){} }
    return real(url.replace('https://lmk-api.emieldieuvenson.workers.dev','http://localhost:${PORT}'),o); };
  Object.defineProperty(navigator,'share',{value:async d=>{window.__shared.push(d.text||d.url||'');},configurable:true});
  try{Object.defineProperty(navigator,'clipboard',{value:{writeText:async t=>{window.__shared.push(t);}},configurable:true});}catch(_){}
  document.addEventListener('DOMContentLoaded',()=>{const t=document.getElementById('toast'); if(!t) return;
    new MutationObserver(()=>{const x=(t.textContent||'').trim(); if(x&&x!==window.__lastToast){window.__lastToast=x;window.__toasts.push(x);}}).observe(t,{childList:true,characterData:true,subtree:true});});
})()`;
/* seeded once per tab, like a real device: the script re-runs on Page.reload and used to wipe the merged store */
const seedScript=map=>`try{if(!sessionStorage.getItem('__seeded')){localStorage.clear();${Object.entries(map).map(([k,v])=>`localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(v)});`).join('')}sessionStorage.setItem('__seeded','1')}}catch(_){}`;
const TABS=[];
async function open(who, ua, mobile, seed, hash){
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString()); TABS.push(t.id);
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable');
  if(ua) await send(ws,'Emulation.setUserAgentOverride',{userAgent:ua});
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:mobile?430:1100,height:mobile?900:1000,deviceScaleFactor:1,mobile});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:STUB});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:seedScript(seed)});
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(120);
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'+(hash||'')});
  const P={ws,who,
    text:async sel=>((await ev(ws,`(document.querySelector(${JSON.stringify(sel)})||{innerText:''}).innerText`))||'').replace(/\s+/g,' ').trim(),
    click:async sel=>ev(ws,`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true})()`),
    set:async (sel,v)=>ev(ws,`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.value=${JSON.stringify(v)}; e.dispatchEvent(new Event('input',{bubbles:true})); return true})()`),
    toasts:async()=>JSON.parse(await ev(ws,`JSON.stringify(window.__toasts)`)),
    calls:async()=>JSON.parse(await ev(ws,`JSON.stringify(window.__calls)`)),
    sheetOpen:async()=>ev(ws,`roomOverlay.classList.contains('open')`),
    ls:async()=>JSON.parse(await ev(ws,`JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])))`)),
    close:()=>ws.close()};
  await sleep(3000); return P;
}
const state=()=>JSON.parse(execSync(`curl -s localhost:${PORT}/__state`).toString());
const members=()=>((state().members[HOST+'|'+CID])||[]).map(m=>m.name);
const openDetails=(P,re)=>ev(P.ws,`(()=>{const d=[...document.querySelectorAll('#roomModal details')].find(x=>${re}.test(x.textContent)); if(d) d.open=true; return !!d})()`);

(async()=>{
  /* ---- the stand-in worker, on a port nothing else holds ---- */
  let busy=false; try{ execSync(`curl -sf localhost:${PORT}/__state`,{stdio:'pipe'}); busy=true; }catch(_){}
  if(busy){ console.log(`HARNESS ERROR: something already answers on :${PORT} — a stale loop worker? kill it (or set LOOP_PORT) and rerun`); process.exit(2); }
  const W=spawn(process.execPath,[__dirname+'/loop-worker.js'],{env:Object.assign({},process.env,{PORT:String(PORT)}),stdio:'ignore'});
  for(let i=0;i<40;i++){ try{ execSync(`curl -sf localhost:${PORT}/__state`,{stdio:'pipe'}); break; }catch(_){ await sleep(100); } }
  const done=()=>{ try{W.kill()}catch(_){}; for(const t of TABS) try{ execSync(`curl -s http://localhost:9333/json/close/${t}`,{stdio:'pipe'}); }catch(_){} };

  /* ================= A: already set up, on a laptop ================= */
  let A=await open('A','',false,{duenorth_v1:JSON.stringify(SEED_A)},'');
  await ev(A.ws,POST); await sleep(2500); await ev(A.ws,`welcomeOverlay.classList.remove('open'); 1`);
  await ev(A.ws,`window.scrollTo(0,document.body.scrollHeight); 1`); await sleep(400);
  let r=await A.text('.card.intro[data-i="2"]');
  say('A','opens LMK, scrolls to the bottom of Today');
  check('L1 A: the bottom of Today asks "Anyone else from your classes on LMK yet?" with a chip per class', /Anyone else from your classes on LMK yet/.test(r) && /MAT 210/.test(r), r);
  await A.click('.chip[data-course="MAT 210"]'); await sleep(1500); r=await A.text('.roomline');
  say('A','taps the MAT 210 chip');
  check('L2 A: the course line says nobody is here yet and offers "See who\'s here"', /Nobody here yet — be first/.test(r) && /See who's here/.test(r), r);
  await A.click('.roomline [data-act="room-open"]'); await sleep(1500); r=await A.text('#roomModal');
  const nm=await ev(A.ws,`(document.getElementById('roomName')||{}).value||''`);
  say('A','opens the room');
  check('L3 A: the join form says "you\'d be first" and the name is prefilled from the welcome', /you'd be first/.test(r) && nm==='Emiel', {r:r.slice(0,160),nm});
  await A.click('[data-act="room-join"]'); await sleep(1800); r=await A.text('#roomModal');
  say('A','taps Join');
  check('L4 A: joined — the roster shows Emiel (you), the worker has one member, the toast says who can see it', /Emiel YOU/.test(r) && members().join()==='Emiel' && (await A.toasts()).includes("You're in. Only confirmed classmates can see this."), {r:r.slice(0,120),m:members()});
  await A.click('[data-act="room-share"]'); await sleep(800);
  const shared=JSON.parse(await ev(A.ws,`JSON.stringify(window.__shared)`)); const msg=shared[0]||'';
  const link=(msg.match(/https?:\S+/)||[''])[0];
  say('A',`taps Share → clipboard: "${msg.slice(0,90)}…"`);
  check('L5 A: the share text carries the join link with the chat door, host, course id and the COURSE name — no code, no student name', new RegExp(`/app/\\?from=chat#join=${HOST.replace(/\\./g,'\\.')}\\.${CID}&c=MAT%20210$`).test(link) && !link.includes(CODE_A) && /Free, a Chrome extension/.test(msg) && !/Emiel/.test(msg), {link,msg:msg.slice(0,200)});
  await openDetails(A,'/chat link/i'); await A.set('#roomChat','https://groupme.com/join_group/123/abc'); await A.click('[data-act="room-chat-set"]'); await sleep(1500);
  await openDetails(A,'/Propose a session/i'); await A.set('#sessNote','Hayden Library 2nd floor'); await A.click('[data-act="sess-propose"]'); await sleep(1800); r=await A.text('#roomModal');
  await A.click('[data-act="room-close"]'); await sleep(600); const lineA=await A.text('.roomline');
  say('A','adds the GroupMe link, proposes a session, closes the sheet');
  check('L6 A: the chat link and the session are in the sheet, and the course line names the session', /Class chat/.test(r) && /1 going: Emiel/.test(r) && /Session .* you're in/.test(lineA), {r:r.slice(0,300),lineA});
  const A_LS=await A.ls(); A.close();
  say('A','pastes the message into the class GroupMe. That is the whole ask of A.');

  /* ================= B, phone: opens the link from the group chat ================= */
  const hash=link.replace(/^https?:\/\/[^/]+\/app\/?/,'');
  let B=await open('B-phone',IPHONE,true,{},hash); await sleep(1500);
  const w=await B.text('#welcomeOverlay'); const J=JSON.parse(await ev(B.ws,`JSON.stringify({code:JOIN.code,cid:JOIN.cid,tag:JOIN.tag,count:JOIN.count,hash:location.hash,saved:!!localStorage.getItem('lmk_join')})`));
  say('B-phone',`opens A's link on an iPhone → "${w.slice(0,120)}…"`);
  check('L7 B-phone: the invite is remembered with the headcount, the hash is scrubbed, and step 2 names the ROOM (never the course as a person) and the full computer step', !J.code && J.cid===CID && J.tag==='MAT 210' && J.count===1 && J.hash==='' && J.saved && /invited to the MAT 210 room — 1 classmate is already in it/.test(w) && !/MAT 210 is (already )?on LMK/.test(w) && /sign in with Google there\. Then sign in with Google here/.test(w), {J,w:w.slice(0,400)});
  const P1=await B.ls(); B.close();
  say('B-phone','puts the phone down. Later, on a laptop that never saw the link…');

  /* ================= B, laptop: the computer step, no link here ================= */
  let L=await open('B-laptop','',false,{},'');
  await L.set('#wName','Sam'); await ev(L.ws,`window.postMessage({lmk:'ext-hello',version:'0.8.9'},'*'); 1`); await sleep(800);
  await L.click('#wGo'); await sleep(800); const creds=await ev(L.ws,`!!(store.cloud&&store.cloud.sid&&store.cloud.secret)`);
  await ev(L.ws,`window.postMessage({lmk:'canvas-payload',payload:${JSON.stringify(payload())}},'*'); 1`); await sleep(2500);
  await L.click('.chip[data-course="MAT 210"]'); await sleep(1800); r=await L.text('.roomline');
  say('B-laptop','adds the extension, taps Let\'s go, opens Canvas once, taps MAT 210');
  check('L8 B-laptop: Let\'s go minted the cloud id, the course line already counts A, and nothing was claimed here (the invite is on the phone)', creds && /1 classmate on LMK/.test(r) && !(await L.calls()).some(c=>/ref\/claim/.test(c.url)) && Object.keys(state().referrals).length===0, {creds,r,calls:await L.calls()});
  const L1=await L.ls(); L.close();

  /* ================= B, phone again: Sign in with Google brings the laptop's store ================= */
  let Q=await open('B-phone',IPHONE,true,P1,'');
  await ev(Q.ws,`(()=>{const REMOTE=JSON.parse(${JSON.stringify(L1.duenorth_v1)}); window.__drive=[];
    gdReady=()=>true; loadGIS=async()=>{}; gdToken=async()=>{};
    gdFetch=async(url,opts={})=>{ window.__drive.push((opts.method||'GET')+' '+url.replace('https://www.googleapis.com','').slice(0,48));
      if(url.includes('LMK-data')) return {ok:true,status:200,json:async()=>({files:[{id:'f1',modifiedTime:'2026-09-24T01:00:00Z'}]})};
      if(url.includes('/f1?alt=media')) return {ok:true,status:200,json:async()=>REMOTE};
      return {ok:true,status:200,json:async()=>({files:[],id:'f1'})}; };
    openWelcome(); return 1 })()`);
  const tapped=await Q.click('#wSignin3'); await sleep(3500);
  const drive=JSON.parse(await ev(Q.ws,`JSON.stringify(window.__drive)`)); let toasts=await Q.toasts(); let calls=await Q.calls();
  say('B-phone',`picks the phone up, taps the welcome's "Sign in with Google" → Drive: ${drive.length} calls, toast "${toasts.slice(-1)[0]||''}"`);
  check('L9 B-phone: the real sign-in ran — the data file was listed, read and pushed back — and the toast is written for a phone', tapped && drive.some(d=>/^GET .*LMK-data/.test(d)) && drive.some(d=>/^GET .*f1\?alt=media/.test(d)) && drive.some(d=>/^PATCH/.test(d)) && toasts.includes('Synced — your plan is on this phone now.') && !toasts.some(t=>/Open LMK on your phone/.test(t)), {tapped,drive,toasts});
  const cl=calls.filter(c=>/ref\/claim/.test(c.url)); const refs=state().referrals;
  check('L10 B-phone: the merge asked the worker for no claim and nothing was recorded about who shared — a share earns nothing', cl.length===0 && Object.keys(refs).length===0, {cl,refs});
  r=await Q.text('#roomModal'); const title=await ev(Q.ws,`(document.getElementById('roomTitle')||{}).textContent`);
  const nm2=await ev(Q.ws,`(document.getElementById('roomName')||{}).value||''`);
  check('L11 B-phone: the MAT 210 room opened at once, join form first, saying the invite brought them here; the invite is consumed; no toast claims they are "in"', (await Q.sheetOpen()) && title==='MAT 210' && /Your invite brought you here\. 1 classmate from MAT 210 is here\. Join to see names, and to be seen/.test(r) && nm2==='Sam' && (await Q.ls()).lmk_join===undefined && !toasts.some(t=>/both in|you're in/i.test(t)), {r:r.slice(0,200),title,nm2,toasts});
  await Q.click('[data-act="room-join"]'); await sleep(1800); r=await Q.text('#roomModal');
  say('B-phone','taps "Join MAT 210"');
  check('L12 B-phone: joined — the roster shows Emiel and Sam (you), the worker has both', /Emiel/.test(r) && /Sam YOU/.test(r) && members().join()==='Emiel,Sam', {r:r.slice(0,200),m:members()});
  const inBtn=await Q.click('[data-act="sess-in"]'); await sleep(1500); r=await Q.text('#roomModal');
  say('B-phone','taps "I\'m in" on Emiel\'s session');
  check('L13 B-phone: the session shows both going and the worker has two RSVPs', inBtn && /2 going: Emiel, Sam/.test(r) && state().rsvps.length===2, {inBtn,r:r.slice(0,300),rsvps:state().rsvps});
  await Q.click('[data-act="room-close"]'); await sleep(400);
  await send(Q.ws,'Page.reload'); await sleep(4500);
  const hero=await Q.text('#view-now'); await Q.click('.chip[data-course="MAT 210"]'); await sleep(1500); r=await Q.text('.roomline');
  say('B-phone','reloads the page, taps MAT 210');
  check('L14 B-phone: after a reload the plan is still there (no first run), no claim was ever sent, and the course line names the session', !/FIRST RUN/.test(hero) && state().calls.filter(c=>c==='/ref/claim').length===0 && /1 classmate on LMK/.test(r) && /you're in/.test(r), {hero:hero.slice(0,80),r});
  Q.close();

  /* ================= A comes back ================= */
  A=await open('A','',false,A_LS,''); await ev(A.ws,`welcomeOverlay.classList.remove('open'); 1`);
  await A.click('.chip[data-course="MAT 210"]'); await sleep(1500); await A.click('.roomline [data-act="room-open"]'); await sleep(1800); r=await A.text('#roomModal');
  say('A','comes back, opens the room');
  check('L15 A: sees Sam on the roster (with Report, not Edit) and both going to the session', /Sam Report/.test(r) && /Emiel YOU/.test(r) && /2 going: Emiel, Sam/.test(r), r.slice(0,300));
  A.close();

  /* ================= C, laptop: link and setup in one sitting, Canvas answering before "Let's go" ================= */
  execSync(`curl -s -X POST localhost:${PORT}/__reset`);
  A=await open('A','',false,A_LS,''); await ev(A.ws,`welcomeOverlay.classList.remove('open'); 1`);
  await A.click('.chip[data-course="MAT 210"]'); await sleep(1200); await A.click('.roomline [data-act="room-open"]'); await sleep(1500);
  await A.click('[data-act="room-join"]'); await sleep(1500); A.close();
  let C=await open('C-laptop','',false,{},hash); const wc=await C.text('#welcomeOverlay');
  await C.set('#wName','Priya'); await ev(C.ws,POST); await sleep(2500);
  const early=await C.sheetOpen();
  say('C-laptop',`opens the link, adds the extension; Canvas answers while the welcome is still open (room open yet: ${early})`);
  await C.click('#wGo'); await sleep(2500); r=await C.text('#roomModal'); toasts=await C.toasts();
  say('C-laptop','taps Let\'s go');
  check('L16 C-laptop: the welcome named the room; the room stayed shut before Let\'s go (no cloud id yet); Let\'s go opened the join form with no claim sent; nobody was auto-joined', /invited to the MAT 210 room — 1 classmate is already in it/.test(wc) && early===false && (await C.calls()).filter(c=>/ref\/claim/.test(c.url)).length===0 && (await C.sheetOpen()) && /Your invite brought you here/.test(r) && !toasts.some(t=>/both in/.test(t)) && members().join()==='Emiel', {wc:wc.slice(0,200),early,r:r.slice(0,160),toasts,m:members()});
  C.close();

  /* ================= what left the devices ================= */
  const st=state();
  check(`L17 privacy: every counter hit carried an event name and a day and nothing else (${st.hitKeys.length} sent${st.hitKeys.length?'':' — none from localhost, so this is vacuous here'}), and the join link names no one`, st.hitKeys.every(k=>k==='d,ev') && !/Emiel|Sam|Priya/.test(link), {keys:[...new Set(st.hitKeys)],link});

  done();
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.stack||e.message);process.exit(2)});

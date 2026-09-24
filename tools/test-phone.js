/* The phone, as a phone: the layout viewport must stay the device width on every view. One element wider than the
   screen — the rooms nudge's row of class chips, once — made mobile browsers widen the whole layout to 664px, so every
   sheet was cut off at the right and the page could be dragged sideways and pinched (v70.3). Eight classes, an iPhone
   UA at 390px (below the headless floor for pixels, but widths and boxes are exact), every view driven to and measured.
   Run: node test-phone.js   (needs :8899 serving ~/lmk-web and headless Chrome on :9333) */
const {execSync, spawn}=require('child_process'); const fs=require('fs'); const os=require('os'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text);return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,300)));ok?pass++:fail++;};
const PORT=+process.env.LOOP_PORT||8902, W=390;
const IPHONE="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const HOST='canvas.asu.edu';
const COURSES=[['101','ASU Ready'],['105','CIS 105'],['202','DEV 202'],['211','ECN 211'],['265','FMS 265'],['210','MAT 210'],['1010','PSY 101'],['1011','WPC 101']];
const payload=()=>{ const items={}, now=Date.now(); let n=9000;
  for (const [cid,tag] of COURSES) for (let k=0;k<3;k++){ const aid=String(n++); items[aid]={t:`${tag} task ${k+1} with a reasonably long title that wraps`,c:tag,cid,due:new Date(now+(k*3+1)*864e5).toISOString(),pts:10,grp:'g'+cid,st:'online_upload',k:'',sub:'',subAt:'',score:null,url:`https://${HOST}/courses/${cid}/assignments/${aid}`,desc:'',rub:'',fb:''}; }
  return {lmk:'canvas',v:3,at:now,host:HOST,items,groups:Object.fromEntries(COURSES.map(([cid])=>[cid,[{id:'g'+cid,name:'Homework',w:100}]])),courses:COURSES.map(([id,tag])=>({id,tag,name:tag+': a class',uuid:'u'+id+'x'.repeat(30),wt:false,cur:90,fin:40}))}; };
const SEED={onboarded:1, profile:{name:"Emiel"}, cloud:{sid:'a1b2c3d4'+'e'.repeat(24), secret:'s'.repeat(40), on:true, at:1}, ext:null, roomName:'Emiel'};
const STUB=`(function(){const real=window.fetch; window.fetch=(u,o)=>real(String(u).replace('https://lmk-api.emieldieuvenson.workers.dev','http://localhost:${PORT}'),o);})()`;
/* every element whose box leaves the viewport sideways and is not inside something that scrolls or clips it */
const OVER=`(()=>{const W=innerWidth, out=[]; const path=e=>{let p=[]; while(e&&e!==document.body&&p.length<4){let s=e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.classList.length?'.'+[...e.classList].slice(0,2).join('.'):''); p.unshift(s); e=e.parentElement;} return p.join(' > ')};
  for(const e of document.querySelectorAll('body *')){ const cs=getComputedStyle(e); if(cs.display==='none'||cs.visibility==='hidden'||cs.position==='fixed') continue; const r=e.getBoundingClientRect(); if(r.width===0) continue;
    if(r.right>W+1||r.left<-1){ let a=e, clipped=false; while((a=a.parentElement)&&a!==document.body){const c=getComputedStyle(a); if(/(auto|scroll|hidden|clip)/.test(c.overflowX)&&a.getBoundingClientRect().right<=W+1){clipped=true;break}} if(!clipped) out.push({el:path(e),left:Math.round(r.left),right:Math.round(r.right)}); } }
  return {innerWidth, clientW:document.documentElement.clientWidth, scrollW:document.documentElement.scrollWidth, over:out.slice(0,6)}})()`;
(async()=>{
  let busy=false; try{ execSync(`curl -sf localhost:${PORT}/__state`,{stdio:'pipe'}); busy=true; }catch(_){}
  if(busy){ console.log(`HARNESS ERROR: something already answers on :${PORT} — a stale loop worker? kill it (or set LOOP_PORT) and rerun`); process.exit(2); }
  const Wk=spawn(process.execPath,[__dirname+'/loop-worker.js'],{env:Object.assign({},process.env,{PORT:String(PORT)}),stdio:'ignore'});
  for(let i=0;i<40;i++){ try{ execSync(`curl -sf localhost:${PORT}/__state`,{stdio:'pipe'}); break; }catch(_){ await sleep(100); } }
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  const done=()=>{ try{Wk.kill()}catch(_){}; try{ ws.close(); execSync('curl -s http://localhost:9333/json/close/'+t.id,{stdio:'pipe'}); }catch(_){} };
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable'); await send(ws,'Emulation.setUserAgentOverride',{userAgent:IPHONE});
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:W,height:844,deviceScaleFactor:3,mobile:true});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:STUB});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:`try{if(!sessionStorage.getItem('__s')){localStorage.clear();localStorage.setItem('duenorth_v1',${JSON.stringify(JSON.stringify(SEED))});sessionStorage.setItem('__s','1')}}catch(_){}`});
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(120); await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(3000);
  await ev(ws,`window.postMessage({lmk:'ext-hello',version:'0.8.9'},'*'); window.postMessage({lmk:'canvas-payload',payload:${JSON.stringify(payload())}},'*'); 1`); await sleep(2500);
  await ev(ws,`welcomeOverlay.classList.remove('open'); 1`);
  const measure=async()=>JSON.parse(await ev(ws,'JSON.stringify('+OVER+')'));
  const views=[
    ['Today, top', `window.scrollTo(0,0); 1`],
    ['Today, bottom (the rooms nudge with eight class chips)', `window.scrollTo(0,document.body.scrollHeight); 1`],
    ['a course tab', `window.scrollTo(0,0); document.querySelector('.chip[data-course="MAT 210"]').click(); 1`],
    ['Plan', `(document.querySelector('nav.bottombar button[data-tab="plan"]')||{click(){}}).click(); 1`],
    ['Semester', `(document.querySelector('nav.bottombar button[data-tab="semester"]')||{click(){}}).click(); 1`],
    ['Settings sheet', `(document.querySelector('nav.bottombar button[data-tab="now"]')||{click(){}}).click(); document.getElementById('gearBtn').click(); 1`],
    ['the room sheet', `overlay.classList.remove('open'); openRoom('210'); 1`],
    ['the Study screen', `closeRoom(); openStudy(EVENTS[0].id); 1`],
    ['the recap', `closeStudy({fromHistory:true}); openWrapped('semester'); 1`],
    ['the welcome overlay', `closeWrapped(); openWelcome(); 1`],
  ];
  for (const [name, drive] of views) {
    await ev(ws, drive); await sleep(name.startsWith('the room') ? 1500 : 900);
    const r=await measure();
    check(`P: ${name} — layout viewport is the phone (${W}px) and nothing spills past its edge`, r.innerWidth===W && r.clientW===W && r.scrollW===W && r.over.length===0, r);
  }
  // the course filter is remembered per device and hides the nudge: back to "All courses" first
  await ev(ws,`welcomeOverlay.classList.remove('open'); (document.querySelector('nav.bottombar button[data-tab="now"]')||{click(){}}).click(); courseFilter = null; saveView(); render(); window.scrollTo(0,document.body.scrollHeight); 1`); await sleep(600);
  const nudge=JSON.parse(await ev(ws,`JSON.stringify((()=>{const c=document.querySelector('.card.intro[data-i="2"] .chips'); if(!c) return null; const chips=[...c.querySelectorAll('.chip')].map(x=>x.getBoundingClientRect()); return {n:chips.length, rows:new Set(chips.map(r=>Math.round(r.top))).size, maxRight:Math.max(...chips.map(r=>Math.round(r.right))), wrap:getComputedStyle(c).flexWrap}})())`));
  check('P: the nudge\'s eight class chips wrap onto several rows inside the card, none past the screen edge', nudge && nudge.n===8 && nudge.rows>=2 && nudge.maxRight<=W && nudge.wrap==='wrap', nudge);
  const filt=JSON.parse(await ev(ws,`JSON.stringify((()=>{const c=document.getElementById('courseChips'); const cs=getComputedStyle(c); return {wrap:cs.flexWrap, ox:cs.overflowX, scrolls:c.scrollWidth>c.clientWidth}})())`));
  check('P: the course FILTER row is still the one sideways scroller', filt.wrap==='nowrap' && filt.ox==='auto' && filt.scrolls, filt);
  const root=JSON.parse(await ev(ws,`JSON.stringify({html:getComputedStyle(document.documentElement).overflowX, body:getComputedStyle(document.body).overflowX, ta:getComputedStyle(document.documentElement).touchAction, ob:getComputedStyle(document.body).overscrollBehaviorX})`));
  check('P: the root clips sideways overflow without becoming the scroller, forbids pinch-zoom via touch-action, and never rubber-bands sideways', root.html==='clip' && root.body==='clip' && /pan-x/.test(root.ta) && /pan-y/.test(root.ta) && root.ob==='none', root);
  const src=fs.readFileSync(os.homedir()+'/lmk-web/app/index.html','utf8');
  check('P: the site wrapper\'s viewport meta forbids zoom, and Safari\'s pinch gesture is cancelled in script', /maximum-scale=1,user-scalable=no/.test(src) && /"gesturestart".*preventDefault/.test(src), null);
  done();
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.stack||e.message);process.exit(2)});

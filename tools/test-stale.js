/* The footer says WHY a read is old (v70.8). Emiel, 2026-09-30: "Canvas via extension 1h ago" and a yellow dot, while
   the extension had been getting 401s for two hours and one Canvas visit fixed it — the reason lived in a tooltip.
   Seed: a payload read 79 minutes ago; the extension's last background attempt, newer than the read, got a 401 → the
   footer names it and links to Canvas, the gear is yellow for that reason; a fresh payload clears both; a failure
   OLDER than the read says nothing. Run: node test-stale.js (needs :8899 serving ~/lmk-web and Chrome :9333) */
const {execSync}=require('child_process'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text);return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,300)));ok?pass++:fail++;};
const SEED={onboarded:1, profile:{name:"Emiel"}, ext:null};
const HOST='canvas.asu.edu';
const payload=at=>{ const items={}; let n=9000;
  for (const [cid,tag] of [['210','MAT 210'],['211','ECN 211']]){ const aid=String(n++); items[aid]={t:`${tag} homework`,c:tag,cid,due:new Date(Date.now()+3*864e5).toISOString(),pts:10,grp:'g'+cid,st:'online_upload',k:'',sub:'',subAt:'',score:null,url:`https://${HOST}/courses/${cid}/assignments/${aid}`,desc:'',rub:'',fb:''}; }
  return {lmk:'canvas',v:3,at,host:HOST,items,groups:{},courses:[{id:'210',tag:'MAT 210',name:'MAT 210',uuid:'u210'+'x'.repeat(30),wt:false,cur:88,fin:88},{id:'211',tag:'ECN 211',name:'ECN 211',uuid:'u211'+'x'.repeat(30),wt:false,cur:72,fin:72}]}; };
const STUB=`(function(){const J=o=>new Response(JSON.stringify(o),{status:200,headers:{"content-type":"application/json"}}); window.fetch=async(u,o)=>/\\/config$/.test(String(u))?J({ok:true,rooms:{on:true,days:0},plus:{tiers:{}}}):J({ok:false});})()`;
const state=ws=>ev(ws,`JSON.stringify((()=>{const a=document.getElementById('srcFix')||{hidden:true}, g=document.getElementById('syncBtn'), h=document.getElementById('syncedAgo')||{textContent:'',className:'',title:''}; return {head:h.textContent.replace(/\\s+/g,' '), headOld:/old/.test(h.className), headTitle:h.title, fix:a.hidden?'':a.textContent, href:a.hidden?'':a.getAttribute('href'), label:document.getElementById('srcLabel').textContent, stale:g.classList.contains('stale'), ok:g.classList.contains('ok'), title:g.title}})())`).then(JSON.parse);   // no #srcFix at all (a build before v70.8) reads as hidden, so the revert-check fails instead of erroring
(async()=>{
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  const done=()=>{ try{ ws.close(); execSync('curl -s http://localhost:9333/json/close/'+t.id,{stdio:'pipe'}); }catch(_){} };
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable');
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:1100,height:1000,deviceScaleFactor:1,mobile:false});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:STUB});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:`try{localStorage.clear();localStorage.setItem('duenorth_v1',${JSON.stringify(JSON.stringify(SEED))});}catch(_){}`});
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(120); await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(2600);
  const OLD=Date.now()-79*60e3;
  await ev(ws,`window.postMessage({lmk:'ext-hello',version:'0.9.0'},'*'); window.postMessage({lmk:'canvas-payload',payload:${JSON.stringify(payload(OLD))}},'*'); 1`); await sleep(1800);
  await ev(ws,`welcomeOverlay.classList.remove('open'); 1`);
  let r=await state(ws);
  check('S0 a 79-minute-old read with no background report: the footer just says "1h ago", no reason, gear not yellow', /via extension 1h ago/.test(r.label) && r.fix==='' && !r.stale, r);
  // an older extension reports Canvas's raw 401
  await ev(ws,`window.postMessage({lmk:'resync-status',resync:{at:${Date.now()-60e3},ok:false,n:0,err:'401 /api/v1/courses?enrollment_state=active&include[]=term'},at:${OLD}},'*'); 1`); await sleep(400); r=await state(ws);
  check('S1 a newer failed background read that got a 401: the footer says Canvas signed this browser out and links to Canvas', /Canvas signed this browser out — open Canvas once/.test(r.fix) && r.href==='https://canvas.asu.edu/#lmk-sync', r);
  check('H1 the header date line says Canvas synced 1h ago, amber, with the reason as its title', / · Canvas synced 1h ago$/.test(r.head) && r.headOld && /signed this browser out/.test(r.headTitle), r);
  check('S2 the gear is yellow for the same reason, and the raw 401 path is nowhere on the page', r.stale && /signed this browser out/.test(r.title) && !/api.v1/.test(r.fix+r.label+r.title), r);
  // 0.9.1 sends a sentence instead
  await ev(ws,`window.postMessage({lmk:'resync-status',resync:{at:${Date.now()-30e3},ok:false,n:0,err:'Canvas signed this browser out (401) — opening Canvas in the background to sign back in'},at:${OLD}},'*'); 1`); await sleep(400); r=await state(ws);
  check('S3 the 0.9.1 sentence reads the same way', /Canvas signed this browser out — open Canvas once/.test(r.fix) && r.stale, r);
  // the visit (or the heal) lands a fresh payload
  await ev(ws,`window.postMessage({lmk:'canvas-payload',payload:${JSON.stringify(payload(Date.now()))}},'*'); 1`); await sleep(1500); r=await state(ws);
  check('H2 a fresh read: the header says just now, no longer amber', / · Canvas synced just now$/.test(r.head) && !r.headOld, r);
  check('S4 a fresh read clears the reason and the gear goes green, even though the last background REPORT is still the failure', r.fix==='' && !r.stale && r.ok && /via extension just now/.test(r.label), r);
  // a failure older than the read says nothing
  await ev(ws,`window.postMessage({lmk:'resync-status',resync:{at:${Date.now()-2*3600e3},ok:false,n:0,err:'401 /api/v1/courses'},at:${Date.now()}},'*'); 1`); await sleep(400); r=await state(ws);
  check('S5 a failure OLDER than the last read is not stale', r.fix==='' && !r.stale && r.ok, r);
  // a stale read + a newer failure that is not a 401
  await ev(ws,`store.ext.at=${OLD}; renderInner(); window.postMessage({lmk:'resync-status',resync:{at:${Date.now()-60e3},ok:false,n:0,err:'net /api/v1/courses'},at:${OLD}},'*'); 1`); await sleep(500); r=await state(ws);
  check('S6 a non-401 failure on an old read says the read failed, still with the link', /the last background read of Canvas failed — open Canvas once/.test(r.fix) && r.stale, r);
  // the phone: the date line must still fit — no ellipsis eating the end of it
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true}); await sleep(400);
  const ph=JSON.parse(await ev(ws,`JSON.stringify((()=>{const t=document.getElementById('todayLine'); const w=document.querySelector('#syncedAgo .syn-w'); return {fits:t.scrollWidth<=t.clientWidth, text:t.innerText.replace(/\\s+/g,' '), synWord:w?getComputedStyle(w).display:'none', w:t.clientWidth}})())`));
  check('H3 at 390px the whole date line fits, with "synced" dropped so it does', ph.fits && /Canvas ([0-9]+ min ago|[0-9]+h ago|just now)/i.test(ph.text) && !/synced/i.test(ph.text) && ph.synWord==='none', ph);
  // laptops: the wrap caps the header at 980px, so the date line has its own row at every width above the phone and the longest line fits with "synced"
  await ev(ws,`store.ext.at=Date.now()-59*60e3; renderInner(); 1`); await sleep(300);
  for (const [w, own, syn] of [[1000,true,true],[1100,true,true],[1150,true,true],[1300,true,true]]) {
    await send(ws,'Emulation.setDeviceMetricsOverride',{width:w,height:900,deviceScaleFactor:1,mobile:false}); await sleep(350);
    const d=JSON.parse(await ev(ws,`JSON.stringify((()=>{const t=document.getElementById('todayLine'), m=document.querySelector('.lmkmark').getBoundingClientRect(), r=t.getBoundingClientRect(), w=document.querySelector('#syncedAgo .syn-w'); return {fits:t.scrollWidth<=t.clientWidth, ownRow:r.top>m.bottom, syn:!!(w&&getComputedStyle(w).display!=='none'), text:t.innerText, right:(()=>{const g=document.getElementById('syncBtn').getBoundingClientRect(), h=document.querySelector('header.top').getBoundingClientRect(); return h.right-g.right<80})()}})())`));
    check(`H4 at ${w}px the date line fits${own?' on its own row':' on the header row'}${syn?' with "synced"':''}`, d.fits && d.ownRow===own && d.syn===syn && d.right && new RegExp('Canvas '+(syn?'synced ':'')+'59 min ago','i').test(d.text), d);
  }
  done();
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.stack||e.message);process.exit(2)});

/* The refresh button reads Canvas for real (v71.0). Until then it only sent canvas-ping, which re-delivers the copy the
   extension already holds: with Canvas an hour old it refreshed Drive and said "Already up to date" (Emiel, 2026-10-06).
   A stand-in extension answers canvas-resync the way each build does; the button must wait for the answer and say what
   happened. Run: node test-refresh.js (needs :8899 serving ~/lmk-web and Chrome :9333) */
const {execSync}=require('child_process'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text);return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,300)));ok?pass++:fail++;};
const SEED={onboarded:1, profile:{name:"Emiel"}, ext:null};
const HOST='canvas.asu.edu';
const payload=at=>{ const items={}; let n=9000;
  for (const [cid,tag] of [['210','MAT 210'],['211','ECN 211']]){ const aid=String(n++); items[aid]={t:`${tag} homework`,c:tag,cid,due:new Date(Date.now()+3*864e5).toISOString(),pts:10,grp:'g'+cid,st:'online_upload',k:'',sub:'',subAt:'',score:null,url:`https://${HOST}/courses/${cid}/assignments/${aid}`,desc:'',rub:'',fb:''}; }
  return {lmk:'canvas',v:3,at,host:HOST,items,groups:{},courses:[{id:'210',tag:'MAT 210',name:'MAT 210',uuid:'u'.repeat(34),wt:false,cur:88,fin:88},{id:'211',tag:'ECN 211',name:'ECN 211',uuid:'v'.repeat(34),wt:false,cur:72,fin:72}]}; };
const STUB=`(function(){const J=o=>new Response(JSON.stringify(o),{status:200,headers:{"content-type":"application/json"}}); window.fetch=async(u,o)=>/\\/config$/.test(String(u))?J({ok:true,rooms:{on:true,days:0},plus:{tiers:{}}}):J({ok:false});})()`;
/* the stand-in extension: answers canvas-resync per window.__mock, after the delay a real read takes */
const MOCK=`window.addEventListener('message',e=>{const d=e.data; if(!d||d.lmk!=='canvas-resync') return; window.__asked=(window.__asked||0)+1; const m=window.__mock, now=Date.now();
  setTimeout(()=>{ if(m==='read') window.postMessage({lmk:'canvas-payload',payload:window.__fresh(Date.now())},'*');
    else if(m==='healing') window.postMessage({lmk:'resync-status',resync:{at:now,ok:false,n:0,err:'Canvas signed this browser out (401) — opening Canvas in the background to sign back in'}},'*');
    else if(m==='raw401') window.postMessage({lmk:'resync-status',resync:{at:now,ok:false,n:0,err:'401 /api/v1/courses?enrollment_state=active'}},'*');
    else if(m==='net') window.postMessage({lmk:'resync-status',resync:{at:now,ok:false,n:0,err:'net /api/v1/courses'}},'*'); }, 1200); });`;
async function open(version){
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable');
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:1100,height:900,deviceScaleFactor:1,mobile:false});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:STUB});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:MOCK});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:`try{localStorage.clear();localStorage.setItem('duenorth_v1',${JSON.stringify(JSON.stringify(SEED))});}catch(_){}`});
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(120); await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(2600);
  await ev(ws,`window.__fresh=${payload.toString().replace(/^at=>/,'(at)=>').replace(/HOST/g,JSON.stringify(HOST))}; 1`);
  await ev(ws,`window.postMessage({lmk:'ext-hello',version:'${version}'},'*'); window.postMessage({lmk:'canvas-payload',payload:${JSON.stringify(payload(Date.now()-79*60e3))}},'*'); 1`); await sleep(1500);
  await ev(ws,`welcomeOverlay.classList.remove('open'); 1`);
  return {ws, close:()=>{ws.close(); execSync('curl -s http://localhost:9333/json/close/'+t.id);}};
}
const press=async(ws,mock,waitMs=12000)=>{ await ev(ws,`window.__mock=${JSON.stringify(mock)}; window.__asked=0; document.getElementById('syncBtn').click(); 1`);
  const t0=Date.now(); while(Date.now()-t0<waitMs){ await sleep(300); if(!(await ev(ws,`refreshing`))) break; }
  return JSON.parse(await ev(ws,`JSON.stringify({toast:document.getElementById('toast').textContent, btn:[...document.querySelectorAll('#toast button')].map(b=>b.textContent), asked:window.__asked||0, head:(document.getElementById('syncedAgo')||{textContent:''}).textContent, spinning:document.getElementById('syncBtn').classList.contains('spinning')})`)); };
(async()=>{
  let P=await open('0.9.1'), r;
  r=await press(P.ws,'read');
  check('R1 the button asks the extension for a real read, waits for it, says "Refreshed Canvas", and the header says just now', r.asked===1 && /^Refreshed Canvas/.test(r.toast) && !/up to date|plans/i.test(r.toast) && !/Refreshed[^.]*cloud/.test(r.toast) && /just now/.test(r.head) && !r.spinning, r);
  await ev(P.ws,`store.ext.at=Date.now()-79*60e3; renderInner(); 1`);
  r=await press(P.ws,'healing');
  check('R2 0.9.1 hit a 401 and is signing back in: the toast says so and never claims up to date', /signed this browser out\. LMK opened it in a background tab/.test(r.toast) && !/up to date/i.test(r.toast), r);
  r=await press(P.ws,'raw401');
  check('R3 a raw 401 (0.9.0): the toast says signed out with an Open Canvas button', /signed this browser out\. Open Canvas once/.test(r.toast) && r.btn.includes('Open Canvas') && !/Nothing came back/.test(r.toast), r);
  r=await press(P.ws,'net');
  check('R4 another failure: "Couldn\'t reach Canvas", not up to date', /Couldn't reach Canvas/.test(r.toast) && !/up to date/i.test(r.toast), r);
  r=await press(P.ws,'silent',30000);
  check('R5 no answer within 25 s: the spinner stops and the toast says it is still being read', /Canvas is still being read/.test(r.toast) && !r.spinning, r);
  // a cloud that answers with an error must not be called refreshed
  await ev(P.ws,`store.cloud={on:true,sid:'a1b2c3d4'+'e'.repeat(24),secret:'s'.repeat(40),at:1}; store.ext.at=Date.now()-79*60e3; renderInner(); 1`);
  r=await press(P.ws,'read');
  check('R7 the cloud answered with an error: the toast says "Couldn\'t reach cloud", never "Refreshed … cloud"', /^Refreshed Canvas\./.test(r.toast) && /Couldn't reach cloud/.test(r.toast) && !/Refreshed[^.]*cloud/.test(r.toast), r);
  P.close();
  P=await open('0.8.8'); r=await press(P.ws,'read');
  check('R6 an extension older than 0.9.0 cannot be asked: no wait, the toast says update it or open Canvas', r.asked===0 && /can't read Canvas from here yet/.test(r.toast) && r.btn.includes('Open Canvas'), r);
  P.close();
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.stack||e.message);process.exit(2)});

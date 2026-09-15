/* A teacher changes Canvas mid-session: the ranking, the shares and the finish-with maths must move
   with the new payload, without a reload. Regression for WORTH not being invalidated in loadData(). */
const {execSync}=require('child_process'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description);return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+JSON.stringify(d).slice(0,240)));ok?pass++:fail++;};
// before: Exams 50%, two exams. after: the teacher reweights Exams to 70% and adds a third exam
const mk = `(aid,c,cid,d,t,pts,grp,score)=>it[aid]={t,c,cid,due:new Date(now+d*864e5).toISOString(),pts,grp,st:"online_upload",k:"",sub:score!=null?"online_upload":"",subAt:score!=null?new Date(now+d*864e5).toISOString():"",score:score==null?null:score,url:"",desc:"",rub:"",fb:"",gt:""}`;
const P = (w, extra) => `(function(){ const now=Date.now(); const it={}, mk=${mk};
  mk("101","ECN 212","221",-10,"Problem set 1",10,"g1",9); mk("102","ECN 212","221",-5,"Midterm 1",100,"g2",80);
  mk("103","ECN 212","221",6,"Problem set 2",10,"g1",null); mk("104","ECN 212","221",20,"Final exam",100,"g2",null); ${extra||""}
  return {lmk:"canvas",v:3,at:now+${w},host:"canvas.asu.edu",items:it,groups:{"221":[{id:"g1",name:"Homework",w:50},{id:"g2",name:"Exams",w:${w}}]},courses:[{id:"221",tag:"ECN 212",wt:true,cur:85,fin:60}]}; })()`;
const STUB=`(function(){const J=o=>new Response(JSON.stringify(o),{status:200,headers:{"content-type":"application/json"}});window.fetch=async u=>/\\/config$/.test(String(u))?J({ok:true,plus:{tiers:{}},rooms:{on:false}}):/\\/plus\\/status$/.test(String(u))?J({ok:true,plus:false,level:"free",rooms:[]}):J({ok:false});})()`;
(async()=>{
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable');
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:STUB});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:`try{localStorage.clear();localStorage.setItem('duenorth_v1',JSON.stringify({onboarded:1,profile:{name:"E"},capacity:{weekday:2,weekend:2},celebrated:{first:1}}));}catch(_){}`});
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(150);
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(2400);
  await ev(ws,`window.postMessage({lmk:'canvas-payload', payload:${P(50)}}, '*')`); await sleep(900);
  await ev(ws,`welcomeOverlay.classList.remove('open'); 1`);
  const before=JSON.parse(await ev(ws,`JSON.stringify({final:worthOf(EVENTS.find(e=>e.title==="Final exam")).share, need:needFor("ECN 212",90).need, n:worthRank().length})`));
  check('before: the final is half the Exams group at 50% weight = 25% of the grade', Math.round(before.final)===25, before);
  // the teacher reweights Exams to 70% and adds a third exam, mid-session
  await ev(ws,`window.postMessage({lmk:'canvas-payload', payload:${P(70,'mk("105","ECN 212","221",30,"Final project",100,"g2",null);')}}, '*')`); await sleep(1000);
  const after=JSON.parse(await ev(ws,`JSON.stringify({final:worthOf(EVENTS.find(e=>e.title==="Final exam")).share, need:needFor("ECN 212",90).need, n:worthRank().length, hasNew:!!EVENTS.find(e=>e.title==="Final project")})`));
  check('after: the new assignment is in the plan', after.hasNew && after.n===before.n+1, after);
  // weights are normalised by their sum, exactly as buildGrades and Canvas do: 100/300 x 70/120 = 19.44%
  check('after: the share follows the new weight and the new exam (19.4% of the grade)', Math.abs(after.final-19.44)<0.1, after);
  check('after: the finish-with maths moved too', Math.abs(after.need-before.need)>0.001, {before:before.need, after:after.need});
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS',e.message);process.exit(2)});

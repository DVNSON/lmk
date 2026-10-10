/* Plan accuracy (v72.1), from an audit of Emiel's LIVE store (his Drive copy, 319 items, 2026-10-10):
   - LMS open dates were never read: work could be planned before it opened. Lock dates were read and dropped.
   - Page time on an external-tool item (the page that launches Connect/LearningCurve) or an upload (written elsewhere) taught
     the estimator: 3 minutes for an Excel assessment, 7 for a Play Journal. Exams learned from one-minute lab checks.
   - An exam alone so far in its category claimed the whole category (ECN 211 "Exam I" = 80% of the grade).
   - "Midterm count for 40%" when a class has a Midterm and a Final Exam category.
   - Nothing measured whether the plan was right: the scorecard.
   Run: node test-accuracy.js   (needs :8899 serving ~/lmk-web and headless Chrome on :9333) */
const {execSync}=require('child_process'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text);return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,500)));ok?pass++:fail++;};
const DAY=864e5, at=(d,h=23,m=59)=>{ const t=new Date(Date.now()+d*DAY); t.setHours(h,m,0,0); return t.toISOString(); };
const IDS={};
function payload(){ const items={}; let n=9500;
  const add=(key,cid,c,t,d,grp,pts,more={})=>{ const aid=String(n++); IDS[key]='a'+aid; items[aid]=Object.assign({t,c,cid,due:at(d),pts,grp,st:'online_quiz',k:'',sub:'',subAt:'',score:null,url:`https://canvas.asu.edu/courses/${cid}/assignments/${aid}`},more); return aid; };
  add('opens','105','CIS 105','Module 6 Quiz',6,'gc',10,{open:at(3,8,0)});
  add('lateOk','105','CIS 105','Module 4 Quiz',-2,'gc',10,{lock:at(2,23,59)});
  add('closed','105','CIS 105','Module 3 Quiz',-4,'gc',10,{lock:at(-1,23,59)});
  add('upload','265','FMS 265','Play Journal #6',4,'ga',10,{st:'online_upload'});
  add('tool','105','CIS 105','5.10 Charting Assessment',5,'gc',10,{st:'external_tool'});
  add('lab','105','CIS 105','Lab Check 8',5,'gc',5);
  add('ecnExam','211','ECN 211','Exam I',-20,'gx',100,{subAt:at(-20,10,0),score:70,sub:'graded',k:'quiz'});   // Canvas calls a LockDown exam a quiz, as on PSY 101's live data
  add('ecnHw','211','ECN 211','Ch. 9 Homework',3,'gh',10);
  for (let i=1;i<=6;i++) add('fin'+i,'211','ECN 211','Ch. '+i+' Homework',-10-i,'gh',10,{subAt:at(-11-i,20,0),sub:'submitted'});
  add('finLate','211','ECN 211','Ch. 7 Homework',-8,'gh',10,{subAt:at(-7,9,0),sub:'submitted',late:true});
  return {lmk:'canvas',v:3,at:Date.now(),host:'canvas.asu.edu',items,
    groups:{'105':[{id:'gc',name:'Quizzes',w:100}],'265':[{id:'ga',name:'Assignments',w:60},{id:'gm',name:'Midterm',w:20},{id:'gf',name:'Final Exam',w:20}],'211':[{id:'gh',name:'Homework',w:20},{id:'gx',name:'Exams',w:80}]},
    courses:[['105','CIS 105'],['265','FMS 265'],['211','ECN 211']].map(([id,tag])=>({id,tag,name:tag+': a class',uuid:'u'+id+'x'.repeat(30),wt:true,cur:null,fin:null}))}; }
const STUB=`(function(){const J=o=>new Response(JSON.stringify(o),{status:200,headers:{"content-type":"application/json"}}); window.fetch=async(u,o)=>/\\/config$/.test(String(u))?J({ok:true,rooms:{on:false},push:{key:''}}):J({ok:false});})()`;
(async()=>{
  const P=payload();
  // the scorecard: 7 ECN homeworks seen 30 days ago (not at the first sync), 6 on time and 1 late; and timings
  const seenAt={}; for (const k of ['fin1','fin2','fin3','fin4','fin5','fin6','finLate']) seenAt[IDS[k]]=Date.now()-30*DAY;
  const dur={}; dur[IDS.tool]=[{m:3,src:'tracked',at:Date.now()-DAY,p:20}]; dur[IDS.upload]=[{m:7,src:'tracked',at:Date.now()-DAY,p:25}];
  dur[IDS.lab]=[{m:1,src:'quiz',at:Date.now()-DAY,p:5}];
  for (let i=1;i<=5;i++) dur[IDS['fin'+i]]=[{m:40,src:'quiz',at:Date.now()-2*DAY,p:i<5?45:120}];
  const SEED={onboarded:1, profile:{name:"Sam"}, capacity:{weekday:4, weekend:4}, ext:null, seenAt:Object.assign({x:1},seenAt), dur};
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable'); await send(ws,'Page.bringToFront');
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:1100,height:1000,deviceScaleFactor:1,mobile:false});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:STUB});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:`try{if(!sessionStorage.getItem('__s')){localStorage.clear();localStorage.setItem('duenorth_v1',${JSON.stringify(JSON.stringify(SEED))});sessionStorage.setItem('__s','1')}}catch(_){}`});
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(120); await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(2600);
  await ev(ws,`window.postMessage({lmk:'ext-hello',version:'0.9.3'},'*'); window.postMessage({lmk:'canvas-payload',payload:${JSON.stringify(P)}},'*'); 1`); await sleep(2200);
  await ev(ws,`welcomeOverlay.classList.remove('open'); courseFilter=null; render(); 1`); await sleep(400);
  const I=JSON.stringify(IDS);
  // opens
  let r=JSON.parse(await ev(ws,`JSON.stringify((()=>{const I=${I}; const e=EVENTS.find(x=>x.id===I.opens); const days=Object.values(PLAN).filter(d=>d.items.some(c=>c.e.id===I.opens)).map(d=>Math.round((startOfDay(d.date)-startOfDay(now()))/864e5)); return {kept:!!(e.ext&&e.ext.open), label:dueLabel(e).txt, days, start:Math.round((startBy(e)-startOfDay(now()))/864e5), ahead:Object.values(AHEAD).flat().some(a=>(a.e||a).id===I.opens)}})())`));
  check('A1 the open date is kept from the payload and the row says when it opens', r.kept && /opens (today|tomorrow|[A-Z][a-z]{2})/.test(r.label), r);
  check('A1 it is never planned before the day it opens, and Get ahead never offers it early', r.start>=3 && r.days.every(d=>d>=3) && !r.ahead, r);
  // locks
  r=JSON.parse(await ev(ws,`JSON.stringify((()=>{const I=${I}; return {ok:dueLabel(EVENTS.find(x=>x.id===I.lateOk)).txt, closed:dueLabel(EVENTS.find(x=>x.id===I.closed)).txt}})())`));
  check('A2 an overdue item says Canvas still takes it late, and until when; one past its lock says closed', /overdue · taken late until/.test(r.ok) && /overdue · closed/.test(r.closed), r);
  // today's budget is never more than what is left of today
  r=JSON.parse(await ev(ws,`JSON.stringify((()=>{const d=PLAN[dayKey(now())]; const left=Math.round((addDays(startOfDay(now()),1)-now())/6e4); return {cap:d.cap, full:d.capFull, left}})())`));
  check('A3 today\'s plan budget is at most the minutes left before midnight', r.cap<=Math.min(r.full, r.left+1) && r.full===240, r);
  // measurement
  r=JSON.parse(await ev(ws,`JSON.stringify((()=>{const I=${I}; return {tool:measuredMins(I.tool), upload:measuredMins(I.upload), lab:measuredMins(I.lab), ext:extToolItem(I.tool), up:extToolItem(I.upload), quiz:extToolItem(I.lab)}})())`));
  check('A4 page time on an external tool or an upload never teaches the estimator; Canvas\'s quiz timer does', !r.tool.length && !r.upload.length && r.lab.join()==='1' && r.ext && r.up && !r.quiz, r);
  r=JSON.parse(await ev(ws,`JSON.stringify((()=>{const I=${I}; return {exam:learnKind(EVENTS.find(x=>x.id===I.ecnExam)), examKind:EVENTS.find(x=>x.id===I.ecnExam).kind, lab:learnKind(EVENTS.find(x=>x.id===I.lab)), labKind:EVENTS.find(x=>x.id===I.lab).kind, acc:accuracy(0)}})())`));
  check('A5 an exam learns as "exam", apart from its own kind ("quiz"); everything else learns as its kind', r.exam==='exam' && r.examKind!=='exam' && r.lab===r.labKind && r.lab!=='exam', r);
  check('A5 accuracy counts within 25% or within 10 minutes and skips the page-time readings (1 vs 5 is close; 40 vs 120 is not)', r.acc && r.acc.n===6 && r.acc.hit===5, r.acc);
  // exam share and the gap label
  r=JSON.parse(await ev(ws,`JSON.stringify((()=>{const x=examList().find(y=>y.course==='ECN 211'&&!y.gap); const g=examList().find(y=>y.course==='FMS 265'); return {share:x?examShare(x):'none', gap:g&&g.gap, group:g&&g.group, w:g&&g.weight}})())`));
  check('A6 an exam alone so far in its category claims no share of its own (it was 80%)', r.share===null, r);
  check('A6 a class with Midterm and Final Exam categories reads "Midterm and Final Exam", 40%', r.gap && r.group==='Midterm and Final Exam' && r.w===40, r);
  // the scorecard
  r=JSON.parse(await ev(ws,`JSON.stringify({sc:scorecard(), scored:store.planScored||{}, seenNew:(store.seenAt||{})[${I}.ecnHw]})`));
  const scoredVals=Object.values(r.scored);
  check('A7 each finished item LMK saw before it was done is scored once: 6 on time, 1 late; the first sync scores nothing', scoredVals.filter(v=>v===1).length===6 && scoredVals.filter(v=>v===2).length===1 && Object.keys(r.scored).length===7, r.scored);
  check('A7 an item first seen at the first sync is stamped 1 (never "posted late"), a new one with the time', r.seenNew===1 || r.seenNew>Date.now()-60e3, r.seenNew);
  check('A7 the scorecard counts what was finished on time', r.sc.n>=7 && r.sc.ontime===r.sc.n-1, r.sc);
  await ev(ws,`document.querySelector('[data-tab="semester"]').click(); 1`); await sleep(700);
  const sem=await ev(ws,`document.getElementById('view-semester').innerText.replace(/\\s+/g,' ')`);
  check('A8 Semester shows "How well the plan worked": on time, and estimates close enough to plan with', /How well the plan worked/i.test(sem) && /[0-9]+ of [0-9]+ finished on time/.test(sem) && /5 of 6 time estimates were close enough to plan with/.test(sem), sem.slice(0,800));
  ws.close(); try{execSync('curl -s http://localhost:9333/json/close/'+t.id)}catch(_){}
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.stack||e.message);process.exit(2)});

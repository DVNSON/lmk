/* Exam dates from the syllabus (v73.1, extension 0.9.4). Emiel: "The purpose of LMK having access to the syllabus is so
   that it knows everything about the class, not to make people read the syllabus." Four classes:
     FMS 265  a schedule table + prose: "Oct 14 | Midterm Exam (in class) 10:30 AM", "Final Exam: Thursday, December 10,
              7:30 PM", and a "Final Project due Dec 4" and a "review session" that must NOT become exams
     ECN 211  numeric dates and roman/ordinal forms: "Exam 1 ... 9/23", "Midterm 2 – Nov. 4th"; and Canvas already has
              "Exam 1", which must win over the syllabus
     CIS 105  an Exams category and a syllabus that is only a linked PDF: the gap says so honestly
     WPC 101  an Exams category and no syllabus page at all
   Run: node test-syllabus.js   (needs :8899 serving ~/lmk-web and headless Chrome on :9333) */
const {execSync}=require('child_process'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text);return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,500)));ok?pass++:fail++;};
const Y=new Date().getFullYear();
function payload(){ const items={}; let n=9800; const at=(mo,d,h=23,mi=59)=>new Date(Y,mo,d,h,mi).toISOString();
  const add=(c,cid,t,due,grp,pts)=>{const aid=String(n++); items[aid]={t,c,cid,due,pts,grp,st:'online_upload',k:'',sub:'',subAt:'',score:null,url:''};};
  // assignments spread across the fall term so the year is the term's
  for (const [c,cid] of [['FMS 265','265'],['ECN 211','211'],['CIS 105','105'],['WPC 101','101']]) for (const mo of [8,9,10]) add(c,cid,`${c} work ${mo}`,at(mo,15),'g'+cid,10);
  add('ECN 211','211','Exam 1',at(8,23,10,0),'x211',100);
  const groups={}; for (const cid of ['265','211','105','101']) groups[cid]=[{id:'g'+cid,name:'Work',w:60},{id:'x'+cid,name:'Exams',w:40}];
  const syl={
    '265':'FMS 265 Course Schedule\nWeek | Date | Topic\nWeek 7 | Oct 7 | Genre and Authorship\nWeek 8 | Oct 14 | Midterm Exam (in class) 10:30 AM\nThe midterm review session is Oct 12.\nFinal Project due Dec 4.\nFinal Exam: Thursday, December 10, 7:30 PM in our room.',
    '211':'Grading: Exams 40%.\nExam 1 will be on 9/23 in class.\nMidterm 2 – Nov. 4th, during class.\nPractice exam available Nov 1.',
    '105':'', '101':''};
  const courses=[['265','FMS 265'],['211','ECN 211'],['105','CIS 105'],['101','WPC 101']].map(([id,tag])=>({id,tag,name:tag,uuid:'u'+id+'x'.repeat(30),wt:true,cur:null,fin:null,syl:syl[id],sylFile:id==='105'?'/courses/105/files/555/download':''}));
  return {lmk:'canvas',v:3,at:Date.now(),host:'canvas.asu.edu',items,groups,courses}; }
const STUB=`(function(){const J=o=>new Response(JSON.stringify(o),{status:200,headers:{"content-type":"application/json"}}); window.fetch=async(u)=>/\\/config$/.test(String(u))?J({ok:true,rooms:{on:false},push:{key:''}}):J({ok:false});})()`;
(async()=>{
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable'); await send(ws,'Page.bringToFront');
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:1100,height:1000,deviceScaleFactor:1,mobile:false});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:STUB});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:`try{if(!sessionStorage.getItem('__s')){localStorage.clear();localStorage.setItem('duenorth_v1',${JSON.stringify(JSON.stringify({onboarded:1,profile:{name:'Sam'},capacity:{weekday:3,weekend:3}}))});sessionStorage.setItem('__s','1')}}catch(_){}`});
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(120); await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(2600);
  await ev(ws,`window.postMessage({lmk:'ext-hello',version:'0.9.4'},'*'); window.postMessage({lmk:'canvas-payload',payload:${JSON.stringify(payload())}},'*'); 1`); await sleep(2000);
  await ev(ws,`welcomeOverlay.classList.remove('open'); render(); 1`); await sleep(300);
  const r=JSON.parse(await ev(ws,`JSON.stringify({fms:sylExams('FMS 265').map(x=>({n:x.name,m:x.due.getMonth(),d:x.due.getDate(),h:x.allDay?null:x.due.getHours()+':'+String(x.due.getMinutes()).padStart(2,'0'),y:x.due.getFullYear()})), ecn:sylExams('ECN 211').map(x=>({n:x.name,m:x.due.getMonth(),d:x.due.getDate()})), list:examList().map(x=>({k:x.key,syl:!!x.syl,gap:!!x.gap,ev:!!x.ev,approx:!!x.approx})), st:{cis:sylState('CIS 105'), wpc:sylState('WPC 101'), fms:sylState('FMS 265')}})`));
  const f=r.fms;
  check('S1 FMS: the midterm comes from the schedule table row, with its time (Oct 14, 10:30)', f.some(x=>x.n==='midterm' && x.m===9 && x.d===14 && x.h==='10:30' && x.y===Y), f);
  check('S1 FMS: the final from prose ("Thursday, December 10, 7:30 PM")', f.some(x=>x.n==='final' && x.m===11 && x.d===10 && x.h==='19:30'), f);
  check('S1 FMS: a final PROJECT and a review session are not exams', f.length===2, f);
  check('S2 ECN: numeric dates and "Midterm 2 – Nov. 4th" are read; a "practice exam" line is not', r.ecn.some(x=>x.n==='exam 1' && x.m===8 && x.d===23) && r.ecn.some(x=>x.n==='midterm 2' && x.m===10 && x.d===4) && r.ecn.length===2, r.ecn);
  const L=r.list;
  check('S3 Canvas wins: ECN 211 Exam 1 is the Canvas item, the syllabus adds Midterm 2', L.some(x=>x.k==='ECN 211|exam 1' && x.ev && !x.syl) && L.some(x=>x.k==='ECN 211|midterm 2' && x.syl), L.filter(x=>/ECN/.test(x.k)));
  check('S3 FMS has dated exams from the syllabus and no "exams with no date" gap', L.some(x=>x.k==='FMS 265|midterm' && x.syl) && L.some(x=>x.k==='FMS 265|final' && x.syl) && !L.some(x=>x.k==='FMS 265|gap'), L.filter(x=>/FMS/.test(x.k)));
  check('S4 the gap says what LMK looked at: a PDF it can\'t read yet (CIS) vs no syllabus page (WPC)', r.st.cis==='file' && r.st.wpc==='none' && r.st.fms==='text', r.st);
  await ev(ws,`document.querySelector('[data-tab="semester"]').click(); 1`); await sleep(600);
  const sem=await ev(ws,`document.getElementById('view-semester').innerText.replace(/\\s+/g,' ')`);
  check('S5 Semester: syllabus exams say "from your syllabus"; the CIS gap says the syllabus is a file; WPC says there is no syllabus page', /Midterm\s.*FMS 265.*from your syllabus/i.test(sem) && /CIS 105: exams with no date.*syllabus is a file LMK can't read yet/i.test(sem) && /WPC 101: exams with no date.*no syllabus page/i.test(sem), sem.slice(0,900));
  await ev(ws,`openExamSheet(examFind('FMS 265|midterm')); 1`); await sleep(400);
  const sh=await ev(ws,`document.getElementById('planModal').innerText.replace(/\\s+/g,' ')`);
  check('S6 the exam sheet quotes the syllabus line it came from', /From your syllabus: “Week 8 \| Oct 14 \| Midterm Exam \(in class\) 10:30 AM”/.test(sh), sh.slice(0,300));
  ws.close(); try{execSync('curl -s http://localhost:9333/json/close/'+t.id)}catch(_){}
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.stack||e.message);process.exit(2)});

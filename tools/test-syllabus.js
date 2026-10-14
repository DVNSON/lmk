/* Exam dates from the syllabus (v73.1, extension 0.9.4). Emiel: "The purpose of LMK having access to the syllabus is so
   that it knows everything about the class, not to make people read the syllabus." Four classes:
     FMS 265  a schedule table + prose: "Oct 14 | Midterm Exam (in class) 10:30 AM", "Final Exam: Thursday, December 10,
              7:30 PM", and a "Final Project due Dec 4" and a "review session" that must NOT become exams
     ECN 211  numeric dates and roman/ordinal forms: "Exam 1 ... 9/23", "Midterm 2 – Nov. 4th"; and Canvas already has
              "Exam 1", which must win over the syllabus
     CIS 105  a syllabus page that only links a Word file, whose text (sylDoc, extension 0.9.5) carries "Oct 21 | Midterm Exam 9:50 AM"
     MAT 210  an Exams category and a syllabus that is only a linked file with no text read from it: the gap says so honestly
     WPC 101  an Exams category and no syllabus page at all
     DEV 202  a syllabus page that only links a Google Doc (sylLinks, extension 0.9.6): the gap names the link
   S7: a read from LMK's server (no syllabus fields, no open dates) must not wipe what the extension read (v73.6)
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
  for (const [c,cid] of [['FMS 265','265'],['ECN 211','211'],['CIS 105','105'],['MAT 210','210'],['WPC 101','101'],['DEV 202','202']]) for (const mo of [8,9,10]) add(c,cid,`${c} work ${mo}`,at(mo,15),'g'+cid,10);
  add('ECN 211','211','Exam 1',at(8,23,10,0),'x211',100);
  const groups={}; for (const cid of ['265','211','105','210','101','202']) groups[cid]=[{id:'g'+cid,name:'Work',w:60},{id:'x'+cid,name:'Exams',w:40}];
  const syl={
    '265':'FMS 265 Course Schedule\nWeek | Date | Topic\nWeek 7 | Oct 7 | Genre and Authorship\nWeek 8 | Oct 14 | Midterm Exam (in class) 10:30 AM\nThe midterm review session is Oct 12.\nFinal Project due Dec 4.\nFinal Exam: Thursday, December 10, 7:30 PM in our room.',
    '211':'Grading: Exams 40%.\nExam 1 will be on 9/23 in class.\nMidterm 2 – Nov. 4th, during class.\nPractice exam available Nov 1.',
    '105':'Course syllabus: see the attached file.', '210':'', '101':'', '202':''};
  const sylDoc={'105':'CIS 105 Computer Applications\nDate | What\nOct 21 | Midterm Exam 9:50 AM\nDec 9 | Final Exam & party',
    // the forms Emiel's real Word files had (2026-10-11): a month glued to its day, a time range, a review line, an EXAM WEEK line
    '211':'Exam I: September21\nExam II: October 28\nReview for Exam 2 | Fall Break Oct 12-13\nFinal Exam: Wednesday, December 9 9:50-11:40AM\nEXAM WEEK: Final Exam (Comprehensive) Date: Wednesday Dec 9, Location TBD'};
  const courses=[['265','FMS 265'],['211','ECN 211'],['105','CIS 105'],['210','MAT 210'],['101','WPC 101'],['202','DEV 202']].map(([id,tag])=>Object.assign({id,tag,name:tag,sylLinks:id==='202'?[{t:'DEV 202 Course Syllabus',u:'https://docs.google.com/document/d/abc/edit'}]:[],uuid:'u'+id+'x'.repeat(30),wt:true,cur:null,fin:null,syl:syl[id],sylFile:id==='105'||id==='210'||id==='211'?`/courses/${id}/files/555?wrap=1`:''}, sylDoc[id]?{sylDoc:sylDoc[id],sylDocId:'555',sylDocAt:Date.now(),sylDocKind:'docx'}:id==='210'?{sylDoc:'',sylDocId:'555',sylDocAt:Date.now(),sylDocKind:'none'}:{}));
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
  await ev(ws,`window.postMessage({lmk:'ext-hello',version:'0.9.5'},'*'); window.postMessage({lmk:'canvas-payload',payload:${JSON.stringify(payload())}},'*'); 1`); await sleep(2000);
  await ev(ws,`welcomeOverlay.classList.remove('open'); render(); 1`); await sleep(300);
  const r=JSON.parse(await ev(ws,`JSON.stringify({fms:sylExams('FMS 265').map(x=>({n:x.name,m:x.due.getMonth(),d:x.due.getDate(),h:x.allDay?null:x.due.getHours()+':'+String(x.due.getMinutes()).padStart(2,'0'),y:x.due.getFullYear()})), ecn:sylExams('ECN 211').map(x=>({n:x.name,m:x.due.getMonth(),d:x.due.getDate(),h:x.allDay?null:x.due.getHours()+':'+String(x.due.getMinutes()).padStart(2,'0')})), list:examList().map(x=>({k:x.key,syl:!!x.syl,gap:!!x.gap,ev:!!x.ev,approx:!!x.approx})), st:{cis:sylState('CIS 105'), mat:sylState('MAT 210'), wpc:sylState('WPC 101'), fms:sylState('FMS 265'), dev:sylState('DEV 202')}, cis:sylExams('CIS 105').map(x=>({n:x.name,m:x.due.getMonth(),d:x.due.getDate(),h:x.allDay?null:x.due.getHours()+':'+String(x.due.getMinutes()).padStart(2,'0')}))})`));
  const f=r.fms;
  check('S1 FMS: the midterm comes from the schedule table row, with its time (Oct 14, 10:30)', f.some(x=>x.n==='midterm' && x.m===9 && x.d===14 && x.h==='10:30' && x.y===Y), f);
  check('S1 FMS: the final from prose ("Thursday, December 10, 7:30 PM")', f.some(x=>x.n==='final' && x.m===11 && x.d===10 && x.h==='19:30'), f);
  check('S1 FMS: a final PROJECT and a review session are not exams', f.length===2, f);
  check('S2 ECN: numeric dates and "Midterm 2 – Nov. 4th" are read; a "practice exam" line is not', r.ecn.some(x=>x.n==='exam 1' && x.m===8 && x.d===23) && r.ecn.some(x=>x.n==='midterm 2' && x.m===10 && x.d===4), r.ecn);
  check('S2 from the Word file: "Exam II: October 28" is exam 2 (roman), "December 9 9:50-11:40AM" starts at 9:50, "Review for Exam 2" and "EXAM WEEK: Final Exam" add nothing', r.ecn.some(x=>x.n==='exam 2' && x.m===9 && x.d===28) && r.ecn.some(x=>x.n==='final' && x.m===11 && x.d===9 && x.h==='9:50') && !r.ecn.some(x=>x.n==='exam') && r.ecn.filter(x=>x.n==='final').length===1 && r.ecn.length===4, r.ecn);
  check('S2 "September21" with no space is still Sep 21 — and the page text\'s 9/23 for exam 1 comes first', r.ecn.find(x=>x.n==='exam 1').m===8, r.ecn);
  const L=r.list;
  check('S3 Canvas wins: ECN 211 Exam 1 is the Canvas item, the syllabus adds Midterm 2', L.some(x=>x.k==='ECN 211|exam 1' && x.ev && !x.syl) && L.some(x=>x.k==='ECN 211|midterm 2' && x.syl), L.filter(x=>/ECN/.test(x.k)));
  check('S3 FMS has dated exams from the syllabus and no "exams with no date" gap', L.some(x=>x.k==='FMS 265|midterm' && x.syl) && L.some(x=>x.k==='FMS 265|final' && x.syl) && !L.some(x=>x.k==='FMS 265|gap'), L.filter(x=>/FMS/.test(x.k)));
  check('S4 the gap says what LMK looked at: a file nothing was read from (MAT) vs no syllabus page (WPC); a file that was read counts as text (CIS)', r.st.mat==='file' && r.st.wpc==='none' && r.st.fms==='text' && r.st.cis==='text' && r.st.dev==='link', r.st);
  check('S4 the Word file\'s rows give CIS its midterm with the time, and the final; the gap is gone', r.cis.some(x=>x.n==='midterm' && x.m===9 && x.d===21 && x.h==='9:50') && r.cis.some(x=>x.n==='final' && x.m===11 && x.d===9) && L.some(x=>x.k==='CIS 105|midterm' && x.syl) && !L.some(x=>x.k==='CIS 105|gap'), {cis:r.cis, L:L.filter(x=>/CIS/.test(x.k))});
  await ev(ws,`document.querySelector('[data-tab="semester"]').click(); 1`); await sleep(600);
  const sem=await ev(ws,`document.getElementById('view-semester').innerText.replace(/\\s+/g,' ')`);
  check('S5 Semester: syllabus exams say "from your syllabus" (FMS from the page, CIS from the file); the MAT gap says the syllabus is a file; WPC says there is no syllabus page', /Midterm\s.*FMS 265.*from your syllabus/i.test(sem) && /MAT 210: exams with no date.*syllabus is a file LMK can't read yet/i.test(sem) && /Midterm\s.*CIS 105.*from your syllabus/i.test(sem) && /WPC 101: exams with no date.*no syllabus page/i.test(sem) && /DEV 202: exams with no date.*syllabus is a link LMK can't open: DEV 202 Course Syllabus/i.test(sem) && (await ev(ws,`document.querySelector('#view-semester a[href="https://docs.google.com/document/d/abc/edit"]') ? 1 : 0`))===1, sem.slice(0,1200));
  await ev(ws,`openExamSheet(examFind('FMS 265|midterm')); 1`); await sleep(400);
  const sh=await ev(ws,`document.getElementById('planModal').innerText.replace(/\\s+/g,' ')`);
  check('S6 the exam sheet quotes the syllabus line it came from', /From your syllabus: “Week 8 \| Oct 14 \| Midterm Exam \(in class\) 10:30 AM”/.test(sh), sh.slice(0,300));
  // S7 (v73.6) a read from LMK's server (Sync from anywhere, worker sync.js) has no syllabus fields, and before worker v21 no open
  // dates: it replaced the course list wholesale and took every syllabus exam (and its study plan) away until the next extension read
  const P1=payload(); const first=Object.keys(P1.items)[0]; const openAt=new Date(Date.now()+3*864e5).toISOString(); P1.items[first].open=openAt; P1.at=Date.now()+1000;
  await ev(ws,`applyCanvasPayload(${JSON.stringify(P1)}); 1`); await sleep(300);
  const SV=JSON.parse(JSON.stringify(P1)); SV.at=Date.now()+2000; SV.courses=SV.courses.map(c=>({id:c.id,tag:c.tag,name:c.name,wt:c.wt})); for (const k in SV.items) delete SV.items[k].open;
  await ev(ws,`applyDriveCanvas(${JSON.stringify(SV)}); render(); 1`); await sleep(300);
  const k1=JSON.parse(await ev(ws,`JSON.stringify({at:store.ext.at, fms:sylExams('FMS 265').map(x=>x.name), cis:sylExams('CIS 105').map(x=>x.name), open:store.ext.items[${JSON.stringify(first)}].open, links:(courseMeta('DEV 202')||{}).sylLinks})`));
  check('S7 a server read keeps the syllabus exams (from the page and from the file), the syllabus links and the open date the extension read', k1.at===SV.at && k1.fms.includes('midterm') && k1.cis.includes('midterm') && k1.open===openAt && Array.isArray(k1.links) && k1.links.length===1, k1);
  const EX=JSON.parse(JSON.stringify(P1)); EX.at=Date.now()+3000; EX.courses=EX.courses.map(c=>c.tag==='FMS 265'?Object.assign({},c,{syl:''}):c);
  await ev(ws,`applyCanvasPayload(${JSON.stringify(EX)}); 1`); await sleep(300);
  const k2=JSON.parse(await ev(ws,`JSON.stringify({fms:sylExams('FMS 265').map(x=>x.name)})`));
  check('S7 an extension read that finds the syllabus empty is believed: nothing is brought back', !k2.fms.includes('midterm'), k2);
  ws.close(); try{execSync('curl -s http://localhost:9333/json/close/'+t.id)}catch(_){}
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.stack||e.message);process.exit(2)});

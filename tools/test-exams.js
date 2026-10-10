/* Exams (v71.3): the biggest things in a term, found and shown. Emiel's own term had exams LMK could see in two of seven
   classes: MAT 210 only had "Exam 2 Practice (NO CREDIT)" (isExam skips practice on purpose) and FMS 265's midterm was not
   in Canvas at all. Four classes here, one of each case:
     PSY 101  real exams in Canvas, an "Exams" category worth 80%, chapter practice quizzes, LockDown + webcam
     MAT 210  no exam item, only "… - Exam 2 Practice (NO CREDIT)"  -> a GUESS dated by the practice
     FMS 265  a weighted "Midterm and Final" category and nothing dated in it  -> a GAP
     CIS 105  no exams anywhere  -> nothing
   Run: node test-exams.js   (needs :8899 serving ~/lmk-web and headless Chrome on :9333) */
const {execSync}=require('child_process'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text);return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,400)));ok?pass++:fail++;};
const SEED={onboarded:1, profile:{name:"Sam"}, capacity:{weekday:3, weekend:4}, ext:null};
const DAY=864e5, at=d=>{ const t=new Date(Date.now()+d*DAY); t.setHours(23,59,0,0); return t.toISOString(); };
const payload=()=>{ const items={}; let n=9100;
  const add=(cid,c,t,d,grp,pts)=>{ const aid=String(n++); items[aid]={t,c,cid,due:at(d),pts,grp,st:'online_quiz',k:'',sub:'',subAt:'',score:null,url:`https://canvas.asu.edu/courses/${cid}/assignments/${aid}`}; return aid; };
  add('1010','PSY 101','Chapter 5 Practice Quiz',2,'gq',10);
  add('1010','PSY 101','Chapter 6 Practice Quiz',4,'gq',10);
  add('1010','PSY 101','Exam 2 (Ch. 5 and 6) - Requires Respondus LockDown Browser + Webcam',7,'ge',100);
  add('1010','PSY 101','Exam 3 (Ch. 8) - Requires Respondus LockDown Browser + Webcam',40,'ge',100);
  add('210','MAT 210','HW_4.4_Applications',1,'gh',10);
  add('210','MAT 210','Chain, Product, and Quotient Rule - Exam 2 Practice (NO CREDIT)',6,'gh',0);
  add('265','FMS 265','Play Journal #4',3,'ga',20);
  add('105','CIS 105','5.10 Charting Assessment',2,'gc',10);
  return {lmk:'canvas',v:3,at:Date.now(),host:'canvas.asu.edu',items,
    groups:{'1010':[{id:'gq',name:'Practice Quizzes',w:20},{id:'ge',name:'Exams',w:80}],'210':[{id:'gh',name:'Homework',w:30},{id:'gx',name:'Exams',w:70}],
            '265':[{id:'ga',name:'Assignments',w:60},{id:'gm',name:'Midterm and Final',w:40}],'105':[{id:'gc',name:'Homework',w:100}]},
    courses:[['1010','PSY 101'],['210','MAT 210'],['265','FMS 265'],['105','CIS 105']].map(([id,tag])=>({id,tag,name:tag+': a class',uuid:'u'+id+'x'.repeat(30),wt:true,cur:null,fin:null}))}; };
const STUB=`(function(){const J=o=>new Response(JSON.stringify(o),{status:200,headers:{"content-type":"application/json"}}); window.fetch=async(u,o)=>/\\/config$/.test(String(u))?J({ok:true,rooms:{on:false},push:{key:''}}):J({ok:false});})()`;
async function open(mobile){
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable'); await send(ws,'Page.bringToFront');
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:mobile?390:1100,height:1000,deviceScaleFactor:1,mobile:!!mobile});
  if (mobile) await send(ws,'Emulation.setUserAgentOverride',{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:STUB});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:`try{if(!sessionStorage.getItem('__s')){localStorage.clear();localStorage.setItem('duenorth_v1',${JSON.stringify(JSON.stringify(SEED))});sessionStorage.setItem('__s','1')}}catch(_){}`});
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(120); await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(2600);
  await ev(ws,`window.postMessage({lmk:'ext-hello',version:'0.9.2'},'*'); window.postMessage({lmk:'canvas-payload',payload:${JSON.stringify(payload())}},'*'); 1`); await sleep(2000);
  await ev(ws,`welcomeOverlay.classList.remove('open'); courseFilter=null; render(); 1`); await sleep(300);
  return {ws, close:()=>{ws.close(); try{execSync('curl -s http://localhost:9333/json/close/'+t.id)}catch(_){}}};
}
const list=ws=>ev(ws,`JSON.stringify(examList().map(x=>({k:x.key,c:x.course,n:x.name,approx:!!x.approx,gap:!!x.gap,w:x.weight||0,days:x.due?examDays(x):null,share:x.gap?null:examShare(x),rel:x.gap?0:examRelated(x).length})))`).then(JSON.parse);
const nowCard=ws=>ev(ws,`JSON.stringify((()=>{ /* innerText follows text-transform, so rows are matched case-insensitively */const v=document.getElementById('view-now'); const hs=[...v.querySelectorAll('h2.sec')].map(h=>h.textContent.replace(/\\s+/g,' ').trim()); const card=[...v.querySelectorAll('h2.sec')].find(h=>/^Exams/.test(h.textContent)); const runway=card&&card.nextElementSibling; return {hs, rows:runway?[...runway.querySelectorAll('[data-exam]')].map(r=>r.innerText.replace(/\\s+/g,' ').trim()):[], after:(runway&&runway.nextElementSibling&&runway.nextElementSibling.textContent)||''}})())`).then(JSON.parse);
const row=(ws,key)=>`document.querySelector('[data-exam="${key}"]')`;
(async()=>{
  let P=await open(false), ws=P.ws, L=await list(ws);
  const psy2=L.find(x=>x.k==='PSY 101|exam 2'), psy3=L.find(x=>x.k==='PSY 101|exam 3'), mat=L.find(x=>x.k==='MAT 210|exam 2'), fms=L.find(x=>x.k==='FMS 265|gap');
  check('E1 PSY 101: both Canvas exams are found, named without the "- Requires Respondus…" tail, linked to their chapter practice quizzes', psy2 && psy3 && !psy2.approx && psy2.n==='Exam 2 (Ch. 5 and 6)' && psy2.rel===2 && psy2.days===7, L);
  check('E1 MAT 210: no exam in Canvas, but "Exam 2 Practice" makes a GUESS dated by the practice (6 days)', mat && mat.approx && mat.n==='Exam 2' && mat.days===6 && mat.rel===1, mat);
  check('E1 FMS 265: a 40% "Midterm and Final" category with nothing dated is a GAP; CIS 105 (no exam category) is absent', fms && fms.gap && fms.w===40 && !L.some(x=>x.c==='CIS 105'), L);
  check('E1 a Canvas exam\'s share is its real weight (80% over two 100-point exams = 40 points); a guess has no share of its own', Math.round(psy2.share)===40 && mat.share===null, {psy2:psy2.share, mat:mat.share});
  let N=await nowCard(ws);
  const iToday=N.hs.findIndex(h=>/^Today/.test(h)), iEx=N.hs.findIndex(h=>/^Exams/.test(h));
  check('E2 Now has an Exams section right after today\'s plan (the hero and Today stay first)', iToday>=0 && iEx===iToday+1, N.hs);
  check('E2 the PSY row: days left, date, share, practice done, the LockDown + webcam tag, a Prep button', N.rows.some(r=>/^7 days Exam 2 \(Ch\. 5 and 6\) PSY 101/i.test(r) && /40% of grade/i.test(r) && /practice 0\/2/i.test(r) && /LockDown Browser \+ webcam/i.test(r) && /Prep/.test(r)), N.rows);
  check('E2 the MAT guess says it is a guess, never a fact: "~6", "about", "LMK\'s guess, not in Canvas", Set date', N.rows.some(r=>/^~6 days Exam 2 MAT 210 about .*LMK's guess, not in Canvas/i.test(r) && /Set date/.test(r)), N.rows);
  check('E2 a guess never claims its own share of the grade: it shows its category\'s ("exams: 70% of grade"), never "~70%" for one exam', N.rows.some(r=>/MAT 210/.test(r) && /exams: 70% of grade/i.test(r) && !/~70%/.test(r)), N.rows);
  check('E2 the FMS gap names the category and its weight and asks for the date', N.rows.some(r=>/FMS 265: exams with no date/.test(r) && /Midterm and Final count for 40% of your grade/.test(r) && /Add date/.test(r)), N.rows);
  check('E2 an exam more than three weeks out is one line under the card, not a row', /After that: PSY 101 · Exam 3 \(Ch\. 8\)/.test(N.after) && !N.rows.some(r=>/Exam 3/.test(r)), N.after);
  // practice done -> readiness moves
  await ev(ws,`toggleDone(EVENTS.find(e=>/Chapter 5 Practice/.test(e.title)).id); 1`); await sleep(700);
  N=await nowCard(ws);
  check('E3 marking a chapter practice quiz done moves the exam\'s readiness to 1/2', N.rows.some(r=>/Exam 2 \(Ch\. 5 and 6\)/.test(r) && /practice 1\/2/i.test(r)), N.rows);
  // Prep opens the plan with the facts and what it covers
  await ev(ws,`${row(ws,'PSY 101|exam 2')}.querySelector('[data-act="exam-open"]').click(); 1`); await sleep(500);
  let sh=await ev(ws,`document.getElementById('planModal').innerText.replace(/\\s+/g,' ')`);
  check('E4 Prep: the study plan says what it is worth, what it needs and what it covers, with the done one ticked', /Worth 40% of your final grade in PSY 101/.test(sh) && /Needs LockDown Browser \+ webcam/.test(sh) && /What it covers 1 of 2 done/i.test(sh) && /✓ Chapter 5 Practice Quiz/.test(sh), sh.slice(0,400));
  await ev(ws,`document.getElementById('ppClose').click(); 1`); await sleep(300);
  // Set date on the guess -> a real exam replaces it
  await ev(ws,`${row(ws,'MAT 210|exam 2')}.querySelector('[data-act="exam-date"]').click(); 1`); await sleep(400);
  let f=JSON.parse(await ev(ws,`JSON.stringify({open:addOverlay.classList.contains('open'), head:document.getElementById('addTitle').textContent, t:caTitle.value, c:caCourse.value, d:caDate.value, eff:caEffort.value, exp:(()=>{const x=examFind('MAT 210|exam 2'); const p=n=>String(n).padStart(2,'0'); return x.due.getFullYear()+'-'+p(x.due.getMonth()+1)+'-'+p(x.due.getDate())})()})`));
  check('E5 Set date opens the add sheet as "Add an exam" with the name, class, size and guessed date filled in', f.open && f.head==='Add an exam' && f.t==='Exam 2' && f.c==='MAT 210' && f.eff==='big' && f.d===f.exp, f);
  await ev(ws,`(()=>{const d=new Date(Date.now()+5*864e5); const p=n=>String(n).padStart(2,'0'); caDate.value=d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); caTime.value='10:30'; document.getElementById('caSave').click(); addOverlay.classList.remove('open');})(); 1`); await sleep(600);
  L=await list(ws); const matNow=L.filter(x=>x.c==='MAT 210');
  check('E5 saved, the guess is gone and a real MAT 210 Exam 2 in 5 days takes its place', matNow.length===1 && !matNow[0].approx && matNow[0].days===5 && matNow[0].n==='Exam 2', matNow);
  // the gap -> Add date
  await ev(ws,`${row(ws,'FMS 265|gap')}.querySelector('[data-act="exam-date"]').click(); 1`); await sleep(400);
  f=JSON.parse(await ev(ws,`JSON.stringify({t:caTitle.value, c:caCourse.value, msg:caMsg.textContent})`));
  check('E6 Add date on a gap: the class is filled in, the name starts as "Midterm", and the sheet says to keep exam/midterm/final in it', f.t==='Midterm' && f.c==='FMS 265' && /midterm/.test(f.msg), f);
  await ev(ws,`(()=>{const d=new Date(Date.now()+10*864e5); const p=n=>String(n).padStart(2,'0'); caDate.value=d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); document.getElementById('caSave').click(); addOverlay.classList.remove('open');})(); 1`); await sleep(600);
  L=await list(ws);
  check('E6 saved, FMS 265 has a dated Midterm and the gap is gone', L.some(x=>x.c==='FMS 265' && /midterm/i.test(x.n) && x.days===10) && !L.some(x=>x.gap), L.filter(x=>x.c==='FMS 265'));
  check('E6 the + button afterwards is the ordinary "Add your own assignment" sheet again', await ev(ws,`document.getElementById('addBtn').click(); const h=document.getElementById('addTitle').textContent; addOverlay.classList.remove('open'); h`)==='Add your own assignment', null);
  // Semester: exams first
  await ev(ws,`document.querySelector('[data-tab="semester"]').click(); 1`); await sleep(800);
  const S=JSON.parse(await ev(ws,`JSON.stringify({first:(document.querySelector('#view-semester h2.sec')||{}).textContent||'', runway:[...document.querySelectorAll('#view-semester h2.sec')].some(h=>/Exam runway/i.test(h.textContent)), n:document.querySelectorAll('#view-semester .runway [data-exam]').length})`));   // every tab's section stays in the page; read the one shown
  check('E7 Semester opens on its Exams section (every exam left this term) and the old runway under the radar is gone', /^Exams 4 left this term/.test(S.first.replace(/\s+/g,' ')) && !S.runway && S.n===4, S);
  P.close();
  // hide a guess, undo, and it stays hidden across a reload
  P=await open(false); ws=P.ws;
  await ev(ws,`${row(ws,'MAT 210|exam 2')}.querySelector('[data-act="exam-hide"]').click(); 1`); await sleep(400);
  let h=JSON.parse(await ev(ws,`JSON.stringify({gone:!examList().some(x=>x.key==='MAT 210|exam 2'), stored:!!(store.examHide||{})['MAT 210|exam 2'], toast:document.getElementById('toast').textContent})`));
  check('E8 ✕ on a guess hides it, records it in store.examHide, and offers Undo', h.gone && h.stored && /Undo/.test(h.toast), h);
  await ev(ws,`document.querySelector('#toast button').click(); 1`); await sleep(300);
  check('E8 Undo brings it back', await ev(ws,`examList().some(x=>x.key==='MAT 210|exam 2')`), null);
  await ev(ws,`${row(ws,'MAT 210|exam 2')}.querySelector('[data-act="exam-hide"]').click(); 1`); await sleep(300);
  await send(ws,'Page.reload'); await sleep(2800);
  check('E8 hidden survives a reload', await ev(ws,`!examList().some(x=>x.key==='MAT 210|exam 2') && examList().some(x=>x.key==='PSY 101|exam 2')`), null);
  P.close();
  // phone: the rows fit
  P=await open(true); ws=P.ws;
  const ph=JSON.parse(await ev(ws,`JSON.stringify((()=>{const W=innerWidth; const rows=[...document.querySelectorAll('section.view .runway [data-exam]')]; return {W, scrollW:document.documentElement.scrollWidth, n:rows.length, over:rows.flatMap(r=>[...r.querySelectorAll('*')]).filter(e=>{const b=e.getBoundingClientRect(); return b.width && (b.right>W+1||b.left<-1)}).map(e=>e.className||e.tagName).slice(0,5)}})())`));
  check('E9 on a 390px phone the exam rows fit: nothing past the edge, the page stays the phone\'s width', ph.n>=3 && ph.scrollW===ph.W && ph.over.length===0, ph);
  P.close();
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.stack||e.message);process.exit(2)});

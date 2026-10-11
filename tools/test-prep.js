/* Exam prep, planned (v72.0). Before it the planner booked an exam like homework ("Exam 2 · part 1 of 2", whose checkbox
   marked the EXAM done days before it was sat), piles and head starts could hold an exam, and a past exam was "past due".
   Scenario A (a normal week):  PSY 101 Exam 2 in 7 days, 40% of the grade, two chapter practice quizzes, LockDown + webcam;
                                ECN 211 Midterm in 2 days next to homework due today; PSY 101 Exam 1 sat 3 days ago, 85%.
   Scenario B (exam day):       FMS 265 Midterm today, late in the day.
   Scenario C (own blocks):     a "Study:" row the student added for PSY 101 switches LMK's plan off for that exam.
   Run: node test-prep.js   (needs :8899 serving ~/lmk-web and headless Chrome on :9333) */
const {execSync}=require('child_process'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text);return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,500)));ok?pass++:fail++;};
const DAY=864e5, at=(d,h=23,m=59)=>{ const t=new Date(Date.now()+d*DAY); t.setHours(h,m,0,0); return t.toISOString(); };
function payload(kind){ const items={}; let n=9300;
  const add=(cid,c,t,d,grp,pts,more={})=>{ const aid=String(n++); items[aid]=Object.assign({t,c,cid,due:typeof d==='string'?d:at(d),pts,grp,st:'online_quiz',k:'',sub:'',subAt:'',score:null,url:`https://canvas.asu.edu/courses/${cid}/assignments/${aid}`},more); return aid; };
  const groups={}, courses=[];
  const course=(cid,tag,gs)=>{ groups[cid]=gs; courses.push({id:cid,tag,name:tag+': a class',uuid:'u'+cid+'x'.repeat(30),wt:true,cur:null,fin:null}); };
  if (kind==='A' || kind==='C') {
    course('1010','PSY 101',[{id:'gq',name:'Practice Quizzes',w:20},{id:'ge',name:'Exams',w:80}]);
    add('1010','PSY 101','Chapter 5 Practice Quiz',2,'gq',10); add('1010','PSY 101','Chapter 6 Practice Quiz',4,'gq',10);
    add('1010','PSY 101','Exam 2 (Ch. 5 and 6) - Requires Respondus LockDown Browser + Webcam',7,'ge',100);
    add('1010','PSY 101','Exam 1 (Ch. 1 to 4)',-3,'ge',100,{score:85,subAt:at(-3,10,0),sub:'graded'});
  }
  if (kind==='A') {
    course('211','ECN 211',[{id:'gh',name:'Homework',w:50},{id:'gx',name:'Exams',w:50}]);
    add('211','ECN 211','Problem set 6',0,'gh',10); add('211','ECN 211','Midterm',2,'gx',100);
  }
  if (kind==='B') {
    course('265','FMS 265',[{id:'ga',name:'Assignments',w:60},{id:'gm',name:'Exams',w:40}]);
    add('265','FMS 265','Midterm - Requires Respondus LockDown Browser',0,'gm',100,{due:at(0,23,30)}); add('265','FMS 265','Play Journal #5',5,'ga',20);
  }
  return {lmk:'canvas',v:3,at:Date.now(),host:'canvas.asu.edu',items,groups,courses};
}
const STUB=`(function(){const J=o=>new Response(JSON.stringify(o),{status:200,headers:{"content-type":"application/json"}}); window.fetch=async(u,o)=>/\\/config$/.test(String(u))?J({ok:true,rooms:{on:false},push:{key:''}}):J({ok:false});})()`;
async function open(kind, seedExtra, mobile){
  const SEED=Object.assign({onboarded:1, profile:{name:"Sam"}, capacity:{weekday:4, weekend:4}, ext:null}, seedExtra||{});
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable'); await send(ws,'Page.bringToFront');
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:mobile?390:1100,height:1000,deviceScaleFactor:1,mobile:!!mobile});
  if (mobile) await send(ws,'Emulation.setUserAgentOverride',{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:STUB});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:`try{if(!sessionStorage.getItem('__s')){localStorage.clear();localStorage.setItem('duenorth_v1',${JSON.stringify(JSON.stringify(SEED))});sessionStorage.setItem('__s','1')}}catch(_){}`});
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(120); await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(2600);
  await ev(ws,`window.postMessage({lmk:'ext-hello',version:'0.9.2'},'*'); window.postMessage({lmk:'canvas-payload',payload:${JSON.stringify(payload(kind))}},'*'); 1`); await sleep(2200);
  await ev(ws,`welcomeOverlay.classList.remove('open'); courseFilter=null; render(); 1`); await sleep(400);
  return {ws, close:()=>{ws.close(); try{execSync('curl -s http://localhost:9333/json/close/'+t.id)}catch(_){}}};
}
const K={psy:'PSY 101|exam 2', ecn:'ECN 211|midterm'};
const plan=(ws,key)=>ev(ws,`JSON.stringify((()=>{const x=examFind('${key}'); const p=prepPlan(x); const ex=startOfDay(x.due).getTime(); return {total:p.total, N:p.N, amt:p.amt, own:p.own, done:p.done.length, sessions:p.sessions.map(s=>({n:s.n, of:s.of, d:Math.round((startOfDay(s.day)-startOfDay(now()))/864e5), m:s.mins})), daysToExam:examDays(x)}})())`).then(JSON.parse);
const planned=(ws)=>ev(ws,`JSON.stringify(Object.values(PLAN).map(d=>({k:d.key, items:d.items.map(c=>({prep:!!c.prep, key:c.prep?c.prep.x.key:'', title:c.e.title, exam:!!c.e.exam}))})))`).then(JSON.parse);
(async()=>{
  /* ---------------- A ---------------- */
  let P=await open('A'), ws=P.ws, p=await plan(ws,K.psy), days=await planned(ws);
  check('P1 an exam is never work in the plan: no day holds an exam item, only its study sessions', days.every(d=>d.items.every(c=>!c.exam)) && days.some(d=>d.items.some(c=>c.prep && c.key===K.psy)), days.slice(0,8));
  check('P1 sized by what it is worth: 40% of the grade -> 5h in six 50-minute sessions', p.total===300 && p.N===6 && p.sessions.length===6 && p.sessions.every(s=>s.m===50), p);
  check('P1 spaced: the last session is the day before the exam, none on exam day, never two on one day', p.sessions[p.sessions.length-1].d===p.daysToExam-1 && p.sessions.every(s=>s.d<p.daysToExam) && new Set(p.sessions.map(s=>s.d)).size===p.sessions.length, p.sessions);
  const perDay=days.map(d=>d.items.filter(c=>c.key===K.psy).length);
  check('P1 the planner never books two sessions of one exam on the same day', perDay.every(n=>n<=1), perDay);
  const ecn=await plan(ws,K.ecn);
  check('P2 an exam in 2 days gets its sessions in the 2 days left (fewer, longer, never past 2h)', ecn.sessions.length===2 && ecn.sessions.map(s=>s.d).join()==='0,1' && ecn.sessions.every(s=>s.m<=120 && s.m>=25), ecn);
  let hero=await ev(ws,`(document.querySelector('#view-now .hero')||{}).innerText||''`);
  check('P3 "Next up" is the ECN problem set due today, not the midterm study: work due before an exam is what the exam needs first', /Problem set 6/.test(hero) && !/study for an exam/i.test(hero), hero.slice(0,300));
  const order=JSON.parse(await ev(ws,`JSON.stringify((PLAN[dayKey(now())]||{items:[]}).items.map(c=>(c.prep?'P:':'')+c.e.course+' '+c.e.title.slice(0,20)))`));
  const iHw=order.findIndex(x=>/ECN 211 Problem set/.test(x)), iStudy=order.findIndex(x=>/^P:ECN 211/.test(x));
  check('P3 in Today, the problem set comes before the midterm\'s study session, which still follows the same day', iHw>=0 && iStudy>iHw, order);
  let rows=JSON.parse(await ev(ws,`JSON.stringify([...document.querySelectorAll('#view-now .item.prep')].map(r=>r.innerText.replace(/\\s+/g,' ').trim()))`));
  const both=JSON.parse(await ev(ws,`JSON.stringify(Object.values(PLAN).map(d=>d.items.map(c=>(c.prep?'P:':'')+c.e.course+' '+c.e.title.slice(0,24))).filter(l=>l.some(x=>/^P:PSY 101/.test(x)) && l.some(x=>/^PSY 101 Chapter [56] Practice/.test(x))))`));
  check('P3 on every day a PSY practice quiz and a PSY Exam 2 study session share, the quiz (due first) comes first — the live-data bug put study above homework due Sunday', both.length>0 && both.every(l=>l.findIndex(x=>/^PSY 101 Chapter/.test(x)) < l.findIndex(x=>/^P:PSY 101/.test(x))), both);
  check('P3 Today lists each session with its class, size, which session, the exam day and the step', rows.some(r=>/Study for PSY 101 Exam 2/.test(r) && /session 1 of 6/.test(r) && /First pass/.test(r)) && rows.some(r=>/Study for ECN 211 Midterm/.test(r)), rows);
  const pdays=JSON.parse(await ev(ws,`JSON.stringify({bundles:BUNDLE_LIST.some(b=>b.items.some(e=>e.exam)), ahead:Object.values(AHEAD).flat().some(a=>(a.e||a).exam), overdue:[...document.querySelectorAll('#view-now .triage .item, #view-now .triagecard .item')].map(r=>r.innerText).join('|')})`));
  check('P4 piles and head starts never hold an exam, and the exam sat 3 days ago is not "past due"', !pdays.bundles && !pdays.ahead && !/Exam 1/.test(pdays.overdue), pdays);
  // the step for the day before a LockDown exam names the check
  const last=await ev(ws,`(()=>{const x=examFind('${K.psy}'); const p=prepPlan(x); return prepStep(x, p.sessions[p.sessions.length-1]);})()`);
  check('P5 the last session (the day before) is the weak-spots review plus the LockDown Browser + webcam check', /Final review/.test(last) && /LockDown Browser \+ webcam check/.test(last), last);
  // mark the PSY session done from Today
  await ev(ws,`document.querySelector('#view-now .item.prep[data-exam="${K.psy}"] [data-act="prep-done"]').click(); 1`); await sleep(600);
  let st=JSON.parse(await ev(ws,`JSON.stringify({keys:Object.keys(store.prepDone||{}), streak:store.streakDays.includes(dayKey(now())), toast:document.getElementById('toast').textContent, examDone:!!store.done[EVENTS.find(e=>/Exam 2/.test(e.title)).id], today:(PLAN[dayKey(now())].items||[]).filter(c=>c.prep&&c.prep.x.key==='${K.psy}').length})`));
  p=await plan(ws,K.psy);
  check('P6 Done marks the SESSION (prepDone #1), not the exam, counts for the streak, and says how many are left', st.keys.includes(K.psy+'#1') && !st.examDone && st.streak && /Session 1 done\. 5 more/.test(st.toast), st);
  check('P6 after it, nothing more for that exam today and the five left re-spread from tomorrow', st.today===0 && p.done===1 && p.sessions.length===5 && p.sessions[0].d>=1 && p.sessions[p.sessions.length-1].d===p.daysToExam-1, {st, p});
  await ev(ws,`document.querySelector('#toast button').click(); 1`); await sleep(400);
  st=JSON.parse(await ev(ws,`JSON.stringify({keys:Object.keys(store.prepDone||{}), streak:store.streakDays.includes(dayKey(now()))})`));
  check('P6 Undo takes it back, streak day too (nothing else was done today)', !st.keys.length && !st.streak, st);
  // the sheet: amount, the plan, what it covers, how the last one went
  await ev(ws,`document.querySelector('#view-now [data-exam="${K.psy}"] [data-act="exam-open"]').click(); 1`); await sleep(500);
  let sh=await ev(ws,`document.getElementById('planModal').innerText.replace(/\\s+/g,' ')`);
  check('P7 the prep sheet: the amount and why ("40% of your grade"), every session with its day and step, what it covers', /set aside about 5h in 6 sessions because it is 40% of your grade in PSY 101/.test(sh) && /Session 1 · today/.test(sh) && /Session 6 ·/.test(sh) && /What it covers 0 of 2 done/i.test(sh), sh.slice(0,500));
  check('P7 and how the last exam in that class went: 85%, with the study it got', /Last exam in PSY 101: 85%/.test(sh), sh.slice(0,400));
  await ev(ws,`document.querySelector('#planModal [data-act="prep-amt"][data-v="off"]').click(); 1`); await sleep(400);
  days=await planned(ws); sh=await ev(ws,`document.getElementById('planModal').innerText.replace(/\\s+/g,' ')`);
  const chip=await ev(ws,`(document.querySelector('#view-now [data-exam="${K.psy}"] .examchips')||{}).innerText||''`);
  check('P8 Off: no PSY sessions anywhere in the plan, the sheet says so, the row says "prep off"', !days.some(d=>d.items.some(c=>c.key===K.psy)) && /Off for this exam/.test(sh) && /prep off/i.test(chip), {chip, sh:sh.slice(0,200)});
  await ev(ws,`document.querySelector('#planModal [data-act="prep-amt"][data-v="light"]').click(); 1`); await sleep(300);
  const light=await plan(ws,K.psy);
  await ev(ws,`document.querySelector('#planModal [data-act="prep-amt"][data-v="heavy"]').click(); 1`); await sleep(300);
  const heavy=await plan(ws,K.psy);
  check('P8 Light halves it, Heavy is half again more, and the choice is stored for this exam only', light.total===150 && heavy.total===450 && heavy.amt==='heavy' && (await plan(ws,K.ecn)).amt==='normal', {light:light.total, heavy:heavy.total});
  await ev(ws,`document.querySelector('#planModal [data-act="prep-amt"][data-v="normal"]').click(); document.getElementById('ppClose').click(); 1`); await sleep(300);
  // Semester: how the exams went
  await ev(ws,`document.querySelector('[data-tab="semester"]').click(); 1`); await sleep(700);
  const sem=await ev(ws,`document.getElementById('view-semester').innerText.replace(/\\s+/g,' ')`);
  check('P9 Semester: "How your exams went" shows the past exam with its score', /How your exams went/i.test(sem) && /Exam 1 \(Ch\. 1 to 4\).*85%/.test(sem), sem.slice(0,600));
  // Plan tab: a study-only day still appears, with its session
  await ev(ws,`document.querySelector('[data-tab="plan"]').click(); 1`); await sleep(700);
  const pl=JSON.parse(await ev(ws,`JSON.stringify({rows:document.querySelectorAll('#view-plan .item.prep').length, txt:document.getElementById('view-plan').innerText.replace(/\\s+/g,' ').slice(0,1500)})`));
  check('P10 the Plan tab shows study sessions on their days', pl.rows>=4 && /Study for PSY 101 Exam 2/.test(pl.txt), pl.rows);
  P.close();
  /* ---------------- B: exam day ---------------- */
  P=await open('B'); ws=P.ws;
  hero=await ev(ws,`(document.querySelector('#view-now .hero')||{}).innerText||''`);
  check('P11 exam day: the exam is "Next up" as "Exam today · 11:30 PM" (no "- Requires…" tail, no homework size), with what it needs and an Open-it button', /Exam today · 11:30/i.test(hero) && /\nMidterm\n/.test(hero) && !/Requires Respondus/.test(hero) && !/~2h|\bBIG\b/.test(hero) && /Needs LockDown Browser/.test(hero) && /Open it in Canvas/.test(hero), hero.slice(0,300));
  days=await planned(ws);
  check('P11 no study session is planned on or after exam day for it', !days.some(d=>d.items.some(c=>c.prep && /FMS 265/.test(c.key))), days.slice(0,3));
  P.close();
  /* ---------------- C: the student's own study blocks ---------------- */
  const d3=new Date(Date.now()+3*DAY), p2=n=>String(n).padStart(2,'0');
  P=await open('C',{customRows:[["Study: Exam 2 review","PSY 101",`${d3.getFullYear()}${p2(d3.getMonth()+1)}${p2(d3.getDate())}`,"","custom-1","","medium"]]}); ws=P.ws;
  p=await plan(ws,K.psy); days=await planned(ws);
  check('P12 a "Study:" row the student added for the class switches LMK\'s plan off for that exam (nothing booked twice)', p.own && p.total===0 && !days.some(d=>d.items.some(c=>c.key===K.psy)), p);
  P.close();
  /* ---------------- phone ---------------- */
  P=await open('A',null,true); ws=P.ws;
  const ph=JSON.parse(await ev(ws,`JSON.stringify((()=>{const W=innerWidth; const els=[...document.querySelectorAll('#view-now .hero, #view-now .item.prep')]; return {W, scrollW:document.documentElement.scrollWidth, n:els.length, over:els.flatMap(r=>[r,...r.querySelectorAll('*')]).filter(e=>{const b=e.getBoundingClientRect(); return b.width && (b.right>W+1||b.left<-1)}).map(e=>e.className||e.tagName).slice(0,5)}})())`));
  check('P13 on a 390px phone the study hero and session rows fit', ph.n>=3 && ph.scrollW===ph.W && ph.over.length===0, ph);
  P.close();
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.stack||e.message);process.exit(2)});

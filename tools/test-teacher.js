/* What happens when a professor changes the course mid-semester. Every case here is a real edit a teacher
   makes in Canvas, delivered as a second payload to a running app — the way a resync actually arrives.
   The app must end up describing the NEW course, and must not carry anything from the old one.
   Run:  cd ~/lmk-web && python3 -m http.server 8899 &
         "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 --user-data-dir=/tmp/lmk-cdp-t about:blank &
         node tools/test-teacher.js
   Needs node 22+ (global WebSocket). */
const {execSync}=require('child_process'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text);return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+JSON.stringify(d).slice(0,280)));ok?pass++:fail++;};

/* one weighted course: Homework 40 (three sets), Exams 60 (midterm graded, final to come) */
const MK = `(aid,t,d,pts,grp,score)=>it[aid]={t,c:"ECN 212",cid:"221",due:d===null?"":new Date(now+d*864e5).toISOString(),pts,grp,st:"online_upload",k:"",sub:score!=null?"online_upload":"",subAt:score!=null?new Date(now+d*864e5).toISOString():"",score:score==null?null:score,url:"",desc:"",rub:"",fb:"",gt:""}`;
const payload = (opts={}) => {
  const o = Object.assign({hwW:40, exW:60, wt:true, ps3:{d:6,pts:10}, extra:"", drop:"", ps1Title:"Problem set 1", finalPts:100, midScore:80, ps1Score:9, ps2Score:8}, opts);
  return `(function(){ const now=Date.now(); const it={}, mk=${MK};
    mk("101",${JSON.stringify(o.ps1Title)},-10,10,"g1",${o.ps1Score}); mk("102","Problem set 2",-3,10,"g1",${o.ps2Score});
    ${o.ps3 ? `mk("103","Problem set 3",${o.ps3.d},${o.ps3.pts},"g1",null);` : ""}
    mk("201","Midterm 1",-6,100,"g2",${o.midScore}); mk("202","Final exam",21,${o.finalPts},"g2",null);
    ${o.extra} ${o.drop ? `delete it[${JSON.stringify(o.drop)}];` : ""}
    return {lmk:"canvas",v:3,at:now+Math.random()*1e6,host:"canvas.asu.edu",items:it,
      groups:{"221":[{id:"g1",name:"Homework",w:${o.hwW}},{id:"g2",name:"Exams",w:${o.exW}}]},
      courses:[{id:"221",tag:"ECN 212",wt:${o.wt},cur:85,fin:55}]}; })()`;
};
const STUB=`(function(){const J=o=>new Response(JSON.stringify(o),{status:200,headers:{"content-type":"application/json"}});window.fetch=async u=>/\\/config$/.test(String(u))?J({ok:true,plus:{tiers:{}},rooms:{on:false}}):/\\/plus\\/status$/.test(String(u))?J({ok:true,plus:false,level:"free",rooms:[]}):J({ok:false});})()`;
const READ = `(function(){
  const byTitle = t => EVENTS.find(e=>e.title===t) || null;
  const w = t => { const e=byTitle(t); const x=e&&worthOf(e); return x? +x.share.toFixed(2) : null; };
  return JSON.stringify({
    titles: EVENTS.map(e=>e.title).sort(),
    rank: worthRank().map(x=>x.e.title),
    shareFinal: w("Final exam"), sharePs3: w("Problem set 3"),
    need: (needFor("ECN 212",90)||{}).need,
    ceiling: (targetMath("ECN 212")||{}).ceiling,
    left: (targetMath("ECN 212")||{}).left,
    grade: (gradeFor("ECN 212")||{}).pct,
    doneIds: Object.keys(store.done||{}),
    shelf: (store.undated||[]).map(u=>u.t||u.title),
    planTitles: Object.values(PLAN).flatMap(d=>d.items).map(c=>c.e.title),
  }); })()`;
(async()=>{
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable');
  const errs=[]; ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.method==='Runtime.exceptionThrown') errs.push(String((m.params.exceptionDetails.exception||{}).description||'').slice(0,160));});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:STUB});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:`try{localStorage.clear();localStorage.setItem('duenorth_v1',JSON.stringify({onboarded:1,profile:{name:"E"},capacity:{weekday:3,weekend:3},celebrated:{first:1}}));}catch(_){}`});
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:1100,height:1000,deviceScaleFactor:1,mobile:false});
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(150);
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(2500);
  const sync = async o => { await ev(ws,`window.postMessage({lmk:'canvas-payload', payload:${payload(o)}}, '*')`); await sleep(800); return JSON.parse(await ev(ws,READ)); };

  let base = await sync({});
  await ev(ws,`welcomeOverlay.classList.remove('open'); 1`);
  // Homework group holds 30 pts over three sets; Exams holds 200 over two.
  check('baseline: the final is 100 of 200 exam points at 60% = 30% of the grade', base.shareFinal===30, base);
  check('baseline: problem set 3 is 10 of 30 homework points at 40% = 13.3%', Math.abs(base.sharePs3-13.33)<0.02, base);

  // 1. the teacher moves a due date
  let r = await sync({ps3:{d:1,pts:10}});
  check('1. a moved due date reaches the plan', r.planTitles.includes("Problem set 3") && r.rank.includes("Problem set 3"), r.planTitles);

  // 2. a new assignment appears
  r = await sync({extra:`mk("104","Problem set 4",12,10,"g1",null);`});
  check('2. a new assignment shows up, and every homework share shrinks to make room (10 of 40)',
        r.titles.includes("Problem set 4") && Math.abs(r.sharePs3-10)<0.02, {t:r.titles, ps3:r.sharePs3});

  // 3. the teacher deletes one
  r = await sync({drop:"103"});
  check('3. a deleted assignment leaves the list, the ranking and the plan',
        !r.titles.includes("Problem set 3") && !r.rank.includes("Problem set 3") && !r.planTitles.includes("Problem set 3"), r.titles);

  // 4. points possible changes
  r = await sync({finalPts:200});
  check('4. more points on the final raises its share (200 of 300 exam pts at 60% = 40%)', Math.abs(r.shareFinal-40)<0.02, r.shareFinal);

  // 5. the category weights change
  r = await sync({hwW:20, exW:80});
  check('5. a reweighted category moves the share (100 of 200 x 80/100 = 40%)', Math.abs(r.shareFinal-40)<0.02, r.shareFinal);
  const weighted = r.need;

  // 6. the course stops using weights at all. Only `wt` differs between these two, and homework (50%) is
  //    far from the exam (95%), so the two ways of counting cannot agree by accident.
  const lop = {hwW:20, exW:80, ps1Score:5, ps2Score:5, midScore:95};
  const wOn = await sync(lop);
  const wOff = await sync(Object.assign({}, lop, {wt:false}));
  check('6. turning weights off switches to straight points (100 of 230 = 43.5%)', Math.abs(wOff.shareFinal-43.48)<0.05, wOff.shareFinal);
  check('6. and the best possible grade is recomputed the new way, not carried over',
        Math.abs(wOn.ceiling-91.33)<0.1 && Math.abs(wOff.ceiling-93.48)<0.1, {weighted:wOn.ceiling, points:wOff.ceiling});

  // 7. a rename keeps the student's progress, because LMK keys on the Canvas id and never the title
  const pre = await sync({});
  check('7. an assignment with a submission and a score arrives already ticked', pre.doneIds.includes("a101"), pre.doneIds);
  r = await sync({ps1Title:"Problem set 1 (revised)"});
  check('7. and a renamed assignment keeps that tick under its new name',
        r.doneIds.includes("a101") && r.titles.includes("Problem set 1 (revised)"), {done:r.doneIds, titles:r.titles});

  // 8. a grade is posted
  const before = (await sync({midScore:80})).need;
  r = await sync({midScore:95});
  check('8. a regraded midterm moves what you need on the rest', r.need < before - 0.001, {before, after:r.need});

  // 9. the teacher removes a due date entirely
  r = await sync({ps3:{d:null,pts:10}, extra:"", drop:""});
  check('9. an assignment with its date removed leaves the ranking rather than sitting at an invented date',
        !r.rank.includes("Problem set 3") && !r.planTitles.includes("Problem set 3"), {rank:r.rank, plan:r.planTitles});

  console.log('\nJS errors during run:', errs.length? errs.slice(0,3) : 'none');
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.message);process.exit(2)});

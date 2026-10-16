/* Brightspace, end to end (ext 0.9.11, app v74.2): the payload ~/lmk-backend/test-d2l.js builds from D2L's documented shapes
   (scenario 4: graded discussions, Content work, calendar exams, grades and comments from the grade book) goes into the real app,
   and the app must do with it what it does with Canvas: plan study for a calendar exam, mark a posted discussion done and a missed
   one missing, keep a publisher's running score in progress, and say Brightspace, never Canvas.
   Run: node tools/test-d2l-app.js [shots-dir]   (needs :8899 serving ~/lmk-web and headless Chrome on :9333) */
const {execSync}=require('child_process'); const fs=require('fs'), os=require('os'), path=require('path'); let id=0; const SHOTS=process.argv[2]||'';
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||'');return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,300)));ok?pass++:fail++;};
(async()=>{
  const dump=path.join(os.tmpdir(),'lmk-d2l-payload-'+process.pid+'.json');
  execSync('node '+os.homedir()+'/lmk-backend/test-d2l.js',{env:Object.assign({},process.env,{D2L_DUMP:dump}),stdio:'ignore'});
  const P=JSON.parse(fs.readFileSync(dump,'utf8')); fs.unlinkSync(dump); P.at=Date.now();
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString()); const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable');
  const errs=[]; ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.method==='Runtime.exceptionThrown') errs.push(String((m.params.exceptionDetails.exception||{}).description||'').slice(0,200));});
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:1100,height:1000,deviceScaleFactor:1,mobile:false});
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(500);
  await ev(ws,`localStorage.clear(); localStorage.setItem('duenorth_v1', JSON.stringify({onboarded:1,profile:{name:'Sam'},capacity:{weekday:3,weekend:3}})); 1`);
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(2500);
  await ev(ws,`window.postMessage({lmk:'ext-hello',version:'0.9.11'},'*'); window.postMessage({lmk:'canvas-payload',payload:${JSON.stringify(P)}},'*'); 1`); await sleep(2000);
  await ev(ws,`document.querySelectorAll('.overlay.open').forEach(o=>o.classList.remove('open')); 1`);
  const S=JSON.parse(await ev(ws,`(()=>{ const E=id=>EVENTS.find(e=>e.id===id)||null; return JSON.stringify({lms: store.ext && store.ext.lms, n: Object.keys((store.ext||{}).items||{}).length,
    exams: EVENTS.filter(e=>e.exam).map(e=>e.title+'|'+e.course), undated: (store.undated||[]).map(u=>u.title),
    d4: store.grades['a38808'] || null, hero: ((document.getElementById('view-now')||{}).innerText||'').split(String.fromCharCode(10)).join(' '), done1: !!store.done['a38801'], done2: !!store.done['a38802'], hw: !!store.done['a69300'],
    d2: E('a38802') ? {kind: E('a38802').kind, missing: !!(E('a38802').ext||{}).missing} : null, hwEv: !!E('a69300') }); })()`));
  check('the app takes the Brightspace payload', S.lms==='d2l' && S.n===Object.keys(P.items).length, S);
  check('both calendar exams are exams in the app (study gets planned)', S.exams.some(x=>/^Midterm Exam\|ENG 105/.test(x)) && S.exams.some(x=>/^Final Exam\|ENG 105/.test(x)), S.exams);
  check("a graded discussion's grade from the grade book is a grade in the app", S.d4 && S.d4.got===4 && S.d4.max===5, S.d4);
  check('the first-sync card names Brightspace, not Canvas', /read straight from Brightspace/.test(S.hero) && !/from Canvas/.test(S.hero), S.hero.slice(0,300));
  check('my posted discussion is done; the one I missed is not, and is flagged missing', S.done1 && !S.done2 && S.d2 && S.d2.missing, S);
  check('publisher homework with a running score before its due date is planned, not done', !S.hw && S.hwEv, S);
  for (const tab of ['now','plan','semester']) { await ev(ws,`(document.querySelector('[data-tab="${tab}"]')||{click(){}}).click(); 1`); await sleep(500);
    if (SHOTS) { const r=await send(ws,'Page.captureScreenshot',{format:'png',captureBeyondViewport:true}); fs.writeFileSync(SHOTS+'/d2l-'+tab+'.png',Buffer.from(r.data,'base64')); } }
  const sem=await ev(ws,`((document.getElementById('view-semester')||{}).innerText||'').replace(/\\s+/g,' ')`);
  check('Semester lists the midterm in the exam runway', /Midterm Exam/.test(sem), sem.slice(0,400));
  check('no uncaught error', errs.length===0, errs);
  ws.close(); try{execSync('curl -s http://localhost:9333/json/close/'+t.id)}catch(_){}
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`); process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.message);process.exit(2)});

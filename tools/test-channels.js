/* Channel attribution must not be able to put anything but a known word into the counter, and must still
   credit the right door weeks later when the link is long gone. Run: node channel-test.js */
const {execSync}=require('child_process'); const fs=require('fs'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||'');return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,200)));ok?pass++:fail++;};
(async()=>{
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable'); await send(ws,'Network.enable');
  const hits=[]; ws.addEventListener('message',e=>{const m=JSON.parse(e.data);
    if(m.method==='Network.requestWillBeSent'&&/\/hit$/.test(m.params.request.url)){try{hits.push(JSON.parse(m.params.request.postData).ev)}catch(_){}}});
  const go = async (qs) => { await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(120);
    await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'+qs}); await sleep(2500); };
  // a fresh device arriving through a tagged link
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:`try{localStorage.clear();localStorage.setItem('duenorth_v1',JSON.stringify({onboarded:1,capacity:{weekday:3,weekend:3}}));}catch(_){}`});
  await go('?from=reddit');
  check('a known channel is remembered', (await ev(ws,`localStorage.getItem('lmk_from')`))==='reddit', await ev(ws,`localStorage.getItem('lmk_from')`));
  check('and only the channel word leaves the device', (await ev(ws,`channelSaved()`))==='reddit', 'no');
  // a made-up channel must not stick
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:`try{localStorage.clear();}catch(_){}`});
  await go('?from=evil%3Cscript%3E');
  check('a made-up channel is ignored', !(await ev(ws,`localStorage.getItem('lmk_from')`)), await ev(ws,`localStorage.getItem('lmk_from')`));
  await go('?from=' + 'x'.repeat(200));
  check('a very long one is ignored too', !(await ev(ws,`localStorage.getItem('lmk_from')`)), await ev(ws,`localStorage.getItem('lmk_from')`));
  // the door survives the link disappearing from the address bar
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:`try{localStorage.clear();localStorage.setItem('lmk_from','prof');}catch(_){}`});
  await go('');
  check('a door set on an earlier visit still applies with no query string', (await ev(ws,`channelSaved()`))==='prof', await ev(ws,`channelSaved()`));
  check('and it names the event the worker expects', (await ev(ws,`(()=>{let sent='';const old=window.ping;window.ping=e=>{sent=e;return Promise.resolve(false)};pingChannel('act');window.ping=old;return sent})()`))==='act_prof', 'wrong event');
  check('only closed-set names are ever produced', (await ev(ws,`JSON.stringify(CHANNELS)`))==='["chat","reddit","club","prof","card","search","friend"]', await ev(ws,`JSON.stringify(CHANNELS)`));
  /* v73.5, in a fresh tab so the start-up scripts above (which clear storage and plant lmk_from) never run here. The
     homepage must keep the door through a Chrome Web Store install (until v73.5 not one tagged link had ever counted),
     a return is credited to its door, and the counter's message is a word, a day and, only once a school has answered
     a sync, that school's address. */
  const t2=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const w2=new WebSocket(t2.webSocketDebuggerUrl); await new Promise(r=>w2.addEventListener('open',r));
  await send(w2,'Page.enable'); await send(w2,'Runtime.enable');
  const nav=async url=>{ await send(w2,'Page.navigate',{url:'about:blank'}); await sleep(120); await send(w2,'Page.navigate',{url}); await sleep(2200); };
  await nav('http://localhost:8899/'); await ev(w2,`localStorage.clear(),1`);
  await nav('http://localhost:8899/?from=prof');
  check('the homepage remembers the door, so an install through the store is still credited', (await ev(w2,`localStorage.getItem('lmk_from')`))==='prof', await ev(w2,`localStorage.getItem('lmk_from')`));
  await nav('http://localhost:8899/app/');
  check('and the app, opened later with no ?from=, reads it', (await ev(w2,`channelSaved()`))==='prof', await ev(w2,`channelSaved()`));
  await ev(w2,`localStorage.clear(),1`); await nav('http://localhost:8899/?from=evil%3Cb%3E');
  check('a made-up door on the homepage is not remembered', !(await ev(w2,`localStorage.getItem('lmk_from')`)), await ev(w2,`localStorage.getItem('lmk_from')`));
  await ev(w2,`localStorage.setItem('lmk_from','chat'),1`); await nav('http://localhost:8899/?from=prof');
  check('the first door wins on the homepage too', (await ev(w2,`localStorage.getItem('lmk_from')`))==='chat', await ev(w2,`localStorage.getItem('lmk_from')`));
  await ev(w2,`localStorage.clear();localStorage.setItem('duenorth_v1',JSON.stringify({onboarded:1,capacity:{weekday:3,weekend:3}}));localStorage.setItem('lmk_from','prof');1`);
  await nav('http://localhost:8899/app/');
  const backs = await ev(w2,`(()=>{const sent=[];const old=window.ping;window.ping=e=>{sent.push(e);return Promise.resolve(true)};for(const k of Object.keys(localStorage))if(/^lmk_(back|ch_)/.test(k))localStorage.removeItem(k);store.since=Date.now()-8*864e5;pingReturn();window.ping=old;return sent.sort().join(',')})()`);
  check('a return is credited to the door that brought the device', backs==='back_d1,back_d1_prof,back_d7,back_d7_prof', backs);
  const cs = await ev(w2,`(()=>{const keep=store.ext,out=[];localStorage.setItem('lmk_school','canvas.typo.edu');store.ext=null;EXT.host='';out.push(countedSchool()||'-');store.ext={host:'Canvas.ASU.edu',items:{}};out.push(countedSchool());store.ext={host:'not a host'};out.push(countedSchool()||'-');store.ext=keep;localStorage.removeItem('lmk_school');return out.join(',')})()`);
  check('the counter names only a school that answered a sync, never a typed one', cs==='-,canvas.asu.edu,-', cs);
  const bodies = await ev(w2,`(async()=>{const got=[],of=window.fetch,opa=window.pingAllowed,keep=store.ext,ak=store.adminKey;window.pingAllowed=()=>true;window.fetch=(u,o)=>{if(/[/]hit$/.test(String(u)))got.push(o.body);return Promise.resolve(new Response('{}',{status:200}))};store.adminKey='';store.ext=null;EXT.host='';await ping('open');store.ext={host:'canvas.asu.edu',items:{}};await ping('open');store.ext=keep;store.adminKey=ak;window.fetch=of;window.pingAllowed=opa;return JSON.stringify(got.map(b=>{const j=JSON.parse(b);return Object.keys(j).sort().join('+')+':'+(j.s||'')}))})()`);
  check('the message is a word and a day, plus the school only once one has answered', bodies==='["d+ev:","d+ev+s:canvas.asu.edu"]', bodies);
  const seen = await ev(w2,`(()=>{const sent=[],old=window.ping,keep=store.ext;window.ping=e=>{sent.push(e);return Promise.resolve(true)};for(const k of Object.keys(localStorage))if(/^lmk_seen_/.test(k))localStorage.removeItem(k);store.ext={host:'canvas.asu.edu',items:{}};pingSchool();return new Promise(r=>setTimeout(()=>{pingSchool();store.ext=null;EXT.host='';pingSchool();store.ext=keep;window.ping=old;r(sent.join(','))},50))})()`);
  check('school_seen goes once per device per school, and never without a school', seen==='school_seen', seen);
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.message);process.exit(2)});

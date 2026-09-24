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
  check('only closed-set names are ever produced', (await ev(ws,`JSON.stringify(CHANNELS)`))==='["chat","reddit","club","prof","card","search"]', await ev(ws,`JSON.stringify(CHANNELS)`));
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.message);process.exit(2)});

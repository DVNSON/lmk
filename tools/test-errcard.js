/* The error card. Emiel's own crashes are never sent to /err, so if the card does not show him the fault
   there is no record of it anywhere. Run: node err-test.js */
const {execSync}=require('child_process'); const fs=require('fs'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||'');return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,220)));ok?pass++:fail++;};
(async()=>{
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable');
  const seed = k => `try{localStorage.clear();localStorage.setItem('duenorth_v1',JSON.stringify({onboarded:1,capacity:{weekday:3,weekend:3}${k?',adminKey:"'+k+'"':''}}));}catch(_){}`;
  // ---- a normal student sees the friendly card and nothing technical
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:seed('')});
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(120);
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(2600);
  await ev(ws,`reportErr(new TypeError("cannot read properties of undefined (reading 'pct')"), "render"); 1`);
  let card = await ev(ws,`(()=>{const e=document.getElementById('errcard');return e&&!e.hidden?e.innerText:''})()`);
  check('a student still gets the plain message', /Something went wrong/.test(card), card.slice(0,60));
  check('and is not shown a stack trace', !/pct/.test(card), card.slice(0,160));
  check('the report link still exists for them', await ev(ws,`!!document.querySelector('#errcard a[href]')`), 'missing');
  // ---- the admin sees the actual fault
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:seed('k'.repeat(24))});
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(120);
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(2600);
  await ev(ws,`reportErr(new TypeError("cannot read properties of undefined (reading 'pct')"), "render"); 1`);
  card = await ev(ws,`(()=>{const e=document.getElementById('errcard');return e&&!e.hidden?e.innerText:''})()`);
  check('the admin is shown what actually broke', /reading 'pct'/.test(card), card.slice(0,200));
  check('and where it broke', /render/.test(card), card.slice(0,200));
  check('with a copy button', await ev(ws,`!!document.querySelector('[data-act="err-copy"]')`), 'missing');
  check('the detail is escaped, not injected', await ev(ws,`(()=>{reportErr(new Error("<img src=x onerror=alert(1)>"),"render");
    return !document.querySelector('#errcard img')})()`), 'HTML got through');
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.message);process.exit(2)});

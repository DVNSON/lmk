/* Every Admin sub-tab must render. Only one of them was ever opened in testing, so a crash in the Plus tab
   sat there for days — and because reportErr never sends the admin's own errors, nothing recorded it.
   Run: node admin-tabs-test.js <adminkey> */
const {execSync}=require('child_process'); const fs=require('fs'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||'');return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,260)));ok?pass++:fail++;};
const KEY=process.argv[2];
(async()=>{
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable');
  const errs=[]; ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.method==='Runtime.exceptionThrown') errs.push(String((m.params.exceptionDetails.exception||{}).description||'').slice(0,240));});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:`try{localStorage.clear();localStorage.setItem('duenorth_v1',JSON.stringify({onboarded:1,capacity:{weekday:3,weekend:3},adminKey:${JSON.stringify(KEY)}}));}catch(_){}`});
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:1200,height:1000,deviceScaleFactor:1,mobile:false});
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(150);
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/#admin='+KEY}); await sleep(3000);
  await ev(ws,`(()=>{const b=[...document.querySelectorAll('[data-tab]')].find(x=>x.dataset.tab==='admin');if(b)b.click();return !!b})()`);
  await sleep(3500);
  check('the admin bundle loaded', await ev(ws,`!!ADMIN.data`), await ev(ws,`ADMIN.err`));
  const tabs = await ev(ws,`JSON.stringify([...document.querySelectorAll('.adm-tabs [data-act="adm-tab"]')].map(b=>b.dataset.tab))`);
  const ids = JSON.parse(tabs);
  check(`there are ${ids.length} sub-tabs to check`, ids.length >= 3 && new Set(ids).size === ids.length, ids);
  for (const id of ids) {
    await ev(ws,`document.getElementById('errcard').hidden = true; ADMIN.tab=${JSON.stringify(id)}; render(); 1`);
    await sleep(350);
    const crashed = await ev(ws,`!document.getElementById('errcard').hidden`);
    const detail = crashed ? await ev(ws,`document.getElementById('errcard').innerText.replace(/\\s+/g,' ').slice(0,180)`) : '';
    const text = await ev(ws,`((document.getElementById('view-admin')||{}).innerText||'').trim().length`);
    check(`the ${id} tab renders`, !crashed && text > 40, detail || {chars:text});
  }
  console.log('\nuncaught errors:', errs.length?errs.slice(0,3):'none');
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.message);process.exit(2)});

/* The scan trigger. It only ever fired on a fresh document load, so typing #lmk-scan onto the page you are
   already on did nothing — and the only way to make it "work" was to change the path too, which is how all
   four of the first scans landed on the wrong page. */
const {execSync}=require('child_process'); const fs=require('fs'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||'');return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,200)));ok?pass++:fail++;};
(async()=>{
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable');
  await send(ws,'Page.navigate',{url:'http://localhost:8901/canvas-replica.html'}); await sleep(600);
  // the real trigger, with themeScan stubbed so we only measure WHEN it fires
  const src = fs.readFileSync(require('os').homedir()+'/lmk-extension/canvas-cs.js','utf8');
  const i = src.indexOf('  function scanTrigger(wait){'), j = src.indexOf('window.addEventListener("hashchange"');
  const trigger = src.slice(i, src.indexOf('\n', j)+1);
  await ev(ws, `window.__scans=0; function themeScan(){window.__scans++}\n${trigger}`);
  check('nothing fires on a page with no hash', (await ev(ws,`window.__scans`))===0, await ev(ws,`window.__scans`));
  await ev(ws, `location.hash = "#lmk-scan"`); await sleep(900);
  check('typing #lmk-scan on the page you are already on fires it', (await ev(ws,`window.__scans`))===1, await ev(ws,`window.__scans`));
  check('and the hash is cleared, so the path is never touched', (await ev(ws,`location.hash`))==='' && (await ev(ws,`location.pathname`))==='/canvas-replica.html', [await ev(ws,`location.hash`), await ev(ws,`location.pathname`)]);
  await ev(ws, `location.hash = "#lmk-scan"`); await sleep(900);
  check('the same page can be scanned a second time', (await ev(ws,`window.__scans`))===2, await ev(ws,`window.__scans`));
  await ev(ws, `location.hash = "#something-else"`); await sleep(600);
  check('an unrelated hash does not trigger a scan', (await ev(ws,`window.__scans`))===2, await ev(ws,`window.__scans`));
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.message);process.exit(2)});

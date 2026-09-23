/* Do the colours picked in LMK actually reach Canvas, and do they reach a tab that is ALREADY open?
   Run: node colors-test.js */
const {execSync}=require('child_process'); const fs=require('fs'); const os=require('os'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||'');return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,200)));ok?pass++:fail++;};
const src=fs.readFileSync(os.homedir()+'/lmk-extension/canvas-cs.js','utf8');
const slice=(a,b)=>src.slice(src.indexOf(a), src.indexOf(b));
(async()=>{
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable');
  await send(ws,'Page.navigate',{url:'http://localhost:8901/canvas-replica.html'}); await sleep(600);
  // give the replica cards real course links, as Canvas has
  await ev(ws,`[...document.querySelectorAll('.ic-DashboardCard')].forEach((c,i)=>{
    const a=document.createElement('a');a.href='/courses/'+(269886+i);a.textContent='x';c.appendChild(a)}); 1`);
  const palette = slice('  const SLOT_LIGHT =', '  function cvSurface(');
  const cards   = slice("  /* The dashboard card", "  let decoBusy = false");
  const retag   = slice('  let lastColors = null;', '  chrome.storage.local.get("lmkPlan")');
  await ev(ws, palette + cards + retag + `
    window.__items={"1":{cid:"269886",c:"MAT 210"},"2":{cid:"269887",c:"PSY 101"}};
    window.__tag=(course)=>{const a=document.querySelector('.ig-title');a.setAttribute('data-lmk-tagged','1');
      a.insertAdjacentHTML('afterend','<span class="lmk-tag" data-lmk><i class="lmk-cdot" style="background:'+course+'"></i>~10m</span>')};`);
  const hero = () => ev(ws,`getComputedStyle(document.querySelector('.ic-DashboardCard__header_hero')).backgroundColor`);
  const before = await hero();
  check('a course card starts on Canvas\'s own colour', before==='rgb(37, 66, 132)', before);
  await ev(ws,`paintCards({"MAT 210":"c3"}, window.__items)`); await sleep(120);
  check('picking a colour in LMK repaints that course\'s card', (await hero())==='rgb(27, 175, 122)', await hero());
  const other = await ev(ws,`getComputedStyle(document.querySelectorAll('.ic-DashboardCard__header_hero')[1]).backgroundColor`);
  check('a course with no colour picked keeps Canvas\'s', other==='rgb(50, 74, 77)', other);
  await ev(ws,`paintCards({}, window.__items)`); await sleep(120);
  check('clearing the colour hands the card back to Canvas', (await hero())==='rgb(37, 66, 132)', await hero());
  // the live-update path: a tag already stamped must be redrawn, not skipped for ever
  await ev(ws,`window.__tag('#1baf7a')`);
  check('a tag exists and is marked as already stamped', await ev(ws,`!!document.querySelector('.lmk-tag[data-lmk]') && !!document.querySelector('[data-lmk-tagged]')`), 'missing');
  await ev(ws,`retagAll()`);
  check('changing colours clears the old tags so they are drawn again', await ev(ws,`!document.querySelector('.lmk-tag[data-lmk]') && !document.querySelector('[data-lmk-tagged]')`), 'stale tag survived');
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.message);process.exit(2)});

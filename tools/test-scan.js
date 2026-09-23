const {execSync}=require('child_process'); const fs=require('fs'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text);return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,300)));ok?pass++:fail++;};
(async()=>{
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable');
  await send(ws,'Page.navigate',{url:'http://localhost:8901/scan-fixture.html'}); await sleep(900);
  await ev(ws, fs.readFileSync('scan-harness.js','utf8'));
  const out = await ev(ws, `window.__run()`);
  if (!out) { console.log('FAIL scanner produced nothing'); process.exit(1); }
  const j = JSON.parse(out);
  check('it produces a selector map', Array.isArray(j.rows) && j.rows.length > 4, j.rows && j.rows.length);
  check('it names the real Canvas selectors', j.rows.some(r=>/ic-DashboardCard/.test(r.sel)) && j.rows.some(r=>/ig-row/.test(r.sel)), j.rows.slice(0,6).map(r=>r.sel));
  check('it records the colours Canvas paints', j.rows.some(r=>(r.bg||[]).some(c=>/3, 116, 181/.test(c))), (j.rows.find(r=>/btn-primary/.test(r.sel))||{}).bg);
  /* the contamination that made the first real scan useless: with LMK's look ON, header#header reported
     #efeeec (239,238,236) — a value out of themeCss(), not out of Canvas. The scan must strip the theme. */
  check('it notices LMK\'s look was on', j.lookWasOn === true, j.lookWasOn);
  check('it measures Canvas underneath, not LMK on top', !JSON.stringify(j.rows).includes('239, 238, 236'), (j.rows.find(r=>/ic-app-header/.test(r.sel))||{}).bg);
  check('the header reports Canvas\'s own colour', (j.rows.find(r=>r.sel==='div#header')||{bg:[]}).bg.some(c=>/57, 75, 88/.test(c)), (j.rows.find(r=>r.sel==='div#header')||{}).bg);
  check('and it puts the theme back afterwards', await ev(ws,`document.documentElement.classList.contains('lmk-dark') && !document.getElementById('lmk-theme-css').disabled`), 'theme left off');
  check('the recolour pass is restored too', await ev(ws,`window.__unlift===1 && window.__lift===1`), await ev(ws,`[window.__unlift,window.__lift]`));
  // the privacy claim, which is the whole reason this is safe to send
  /* "Dashboard" is deliberately NOT in this list: it collides with Canvas's own class name
     ic-DashboardCard, so it would fail on a selector rather than on leaked content. Every word below
     appears in the fixture ONLY as page text or in an href. */
  const SECRETS = ["Derivatives Power Rule","NO CREDIT","53.42","MAT 210","Brief Calculus","Submit Assignment","Exponential","Grades","7731533","269886","/courses/"];
  const leaked = SECRETS.filter(w => out.includes(w));
  check('no assignment titles, scores, course names or hrefs are in it', leaked.length === 0, leaked);
  /* belt and braces: a selector is a tag, an id and class names, so it can only contain these characters.
     Anything with a space or an apostrophe in it would be text that slipped through. */
  const badSel = j.rows.map(r => r.sel).filter(sel => !/^[a-z]+[#.a-zA-Z0-9_-]*$/.test(sel));
  check('every row is a bare selector, never a fragment of the page', badSel.length === 0, badSel);
  check('only structure and colour fields are present', j.rows.every(r => Object.keys(r).every(k => ["sel","n","text","bg","fg","bd"].includes(k))), Object.keys(j.rows[0] || {}));
  check('numeric ids are stripped from the page path', !/[0-9]{3,}/.test(j.page), j.page);
  check('it skips LMK\'s own elements', !/lmk-/.test(out), (out.match(/lmk-[a-z]*/g)||[]).slice(0,3));
  console.log(`\nbytes: ${out.length}  rows: ${j.rows.length}`);
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.message);process.exit(2)});

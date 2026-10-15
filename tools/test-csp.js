/* The app page's Content-Security-Policy (2026-10-15, for school security reviews). It must let through everything the app
   really uses — its own files and fonts, Google sign-in, Drive and Calendar, LMK's worker — and nothing else. A new host the
   app starts to call is blocked on lmktoday.app while every other suite (which stubs or bypasses) still passes, so this is
   the one that notices. Run: node tools/test-csp.js   (needs :8899 serving ~/lmk-web and headless Chrome on :9333; it
   reaches Google and the live worker, so it needs the network). */
const {execSync}=require('child_process'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text);return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,300)));ok?pass++:fail++;};
(async()=>{
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable');
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:`window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI));`});
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:1100,height:900,deviceScaleFactor:1,mobile:false});
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(400);
  await ev(ws,`localStorage.clear(); localStorage.setItem('duenorth_v1', JSON.stringify({onboarded:1,profile:{name:'Sam'},capacity:{weekday:3,weekend:3}}));`);
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(3000);
  const meta=await ev(ws,`(document.querySelector('meta[http-equiv="Content-Security-Policy"]')||{}).content||''`);
  check('the app page declares a Content-Security-Policy with no wildcard host and no eval', /default-src 'self'/.test(meta) && /object-src 'none'/.test(meta) && !/\s\*[\s;]|https:\s|unsafe-eval/.test(meta), meta);
  const now=Date.now(), d=n=>new Date(now+n*864e5).toISOString();
  const p={lmk:'canvas',v:3,at:now,host:'canvas.asu.edu',items:{'901':{t:'Problem set 1',c:'BIO 202',cid:'C1',due:d(2),pts:10,st:'online_upload',grp:'g',k:'',sub:'',score:null,url:'https://x/901'},'902':{t:'Midterm Exam',c:'BIO 202',cid:'C1',due:d(6),pts:100,st:'online_quiz',grp:'g',k:'quiz',sub:'',score:null,url:''}},groups:{},courses:[{id:'C1',tag:'BIO 202',wt:false,syl:'Final Exam: December 10'}]};
  await ev(ws,`window.postMessage({lmk:'ext-hello',version:'0.9.10'},'*'); window.postMessage({lmk:'canvas-payload',payload:${JSON.stringify(p)}},'*'); 1`); await sleep(1500);
  await ev(ws,`welcomeOverlay.classList.remove('open'); 1`);
  for (const tab of ['plan','semester','now']) { await ev(ws,`(document.querySelector('[data-tab="${tab}"]')||{click(){}}).click(); 1`); await sleep(400); }
  await ev(ws,`document.getElementById('gearBtn').click(); 1`); await sleep(500); await ev(ws,`document.querySelectorAll('.overlay.open').forEach(o=>o.classList.remove('open')); 1`);
  const gis=await ev(ws,`(async()=>{ try { await loadGIS(); return !!(window.google&&google.accounts&&google.accounts.oauth2); } catch(e){ return 'err '+e.message } })()`);
  check('Google sign-in loads (accounts.google.com/gsi/client)', gis===true, gis);
  const cfg=await ev(ws,`fetch(apiUrl('/config')).then(r=>r.status).catch(e=>'blocked '+e.message)`);
  check("LMK's worker answers (/config)", cfg===200, cfg);
  const g=await ev(ws,`fetch('https://www.googleapis.com/drive/v3/about').then(r=>r.status).catch(e=>'blocked '+e.message)`);
  check('Drive and Calendar (www.googleapis.com) are reachable: a 401 without a token, not a block', g===401, g);
  const f=await ev(ws,`document.fonts.ready.then(()=>JSON.stringify({b:document.fonts.check('700 20px "Bricolage Grotesque"'), p:document.fonts.check('400 15px "Public Sans"'), m:document.fonts.check('500 12px "Spline Sans Mono"'), google:[...document.styleSheets].some(s=>/googleapis/.test(s.href||''))}))`);
  const ff=JSON.parse(f); check('all three fonts load from lmktoday.app itself, none from Google', ff.b && ff.p && ff.m && !ff.google, ff);
  const v=JSON.parse(await ev(ws,`JSON.stringify(window.__csp)`));
  check('using the app produced no policy violation', v.length===0, v);
  const x=await ev(ws,`fetch('https://example.com/').then(()=>'reached').catch(()=>'blocked')`); await sleep(200);
  const v2=JSON.parse(await ev(ws,`JSON.stringify(window.__csp)`));
  check('an unknown host is refused (the policy is real, not decorative)', x==='blocked' && v2.some(s=>/connect-src https:\/\/example\.com/.test(s)), {x, v2});
  ws.close(); try{execSync('curl -s http://localhost:9333/json/close/'+t.id)}catch(_){}
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.message);process.exit(2)});

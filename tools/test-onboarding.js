/* Onboarding state machine, end to end, in a real headless Chrome. 40 checks: the checklist hero's states
   (fresh / checking / waiting / stuck / empty / phone), the welcome overlay's copy per state, the first-sync
   reveal and its 10-minute flag, the name draft, the sync-from-anywhere consent box, the ASU note.
   Run:  cd ~/lmk-web && python3 -m http.server 8899 &
         "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 --user-data-dir=/tmp/lmk-cdp-wi about:blank &
         node tools/test-onboarding.js
   It drives the PUBLIC build at localhost:8899/app/ (mirror first), posts the extension's messages from the page
   itself (ev.source === window), and reads the DOM back. Needs node 22+ for the global WebSocket. */
const {execSync}=require('child_process'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{ if(r&&r.exceptionDetails) throw new Error((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text); return r&&r.result?r.result.value:undefined; });
let pass=0, fail=0; const check=(n,ok,d)=>{ console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+(d===undefined?'':JSON.stringify(d)).slice(0,220))); ok?pass++:fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const PAYLOAD = `(function(){ const now=Date.now(); const it={}, mk=(aid,c,cid,d,t)=>it[aid]={t,c,cid,due:new Date(now+d*864e5).toISOString(),pts:10,st:"online_upload",grp:"g",k:"",sub:"",score:null,url:"https://x/"+aid,desc:"",rub:"",fb:""};
  mk("901","BIO 202","C1",2,"Problem set 1"); mk("902","BIO 202","C1",5,"Problem set 2"); mk("903","ENG 105","C2",3,"Essay 1");
  return {lmk:"canvas",v:3,at:now,host:"canvas.asu.edu",items:it,groups:{},courses:[{id:"C1",tag:"BIO 202",wt:true},{id:"C2",tag:"ENG 105",wt:true}]}; })()`;
async function fresh(ws, {seed={onboarded:0}, ls={}, mobile=false}={}){
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:mobile?500:1100,height:900,deviceScaleFactor:1,mobile});
  await send(ws,'Emulation.setUserAgentOverride',{userAgent: mobile?'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0 Safari/537.36'});
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(400);
  await ev(ws,`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('duenorth_v1', ${JSON.stringify(JSON.stringify(seed))}); ${Object.entries(ls).map(([k,v])=>`localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(String(v))});`).join('')}`);
  await ev(ws,`navigator.serviceWorker && navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()))`);
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(2600);
}
const Q = `(function(){ const $=s=>document.querySelector(s); const rows=[...document.querySelectorAll('.checks li')].map(li=>li.className+':'+li.textContent.trim());
  const hero=$('section.view .hero'); return JSON.stringify({rows, h1: hero? (hero.querySelector('h1')||{}).textContent : null, waiting: !!(hero&&hero.classList.contains('waiting')),
  addToChrome: !!(hero && /Add to Chrome/.test(hero.innerHTML)), overlay: welcomeOverlay.classList.contains('open'), wInstallHidden: $('#wInstall').hidden, wHead2: $('#wHead2').textContent,
  wChips: $('#wClasses')? {hidden:$('#wClasses').hidden, n:$('#wClasses').querySelectorAll('.chip').length} : null,
  syncedIn: !!$('.hero.celebrate .synced-in'), chips: document.querySelectorAll('.synced-in .chip').length, confetti: document.querySelectorAll('.synced-in .confetti i').length,
  ext: !!store.ext, firstKey: localStorage.getItem('lmk_synced_first'), draft: localStorage.getItem('lmk_name_draft'), leaked: /\\$\\{/.test(document.body.innerText)}); })()`;
(async()=>{
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable'); await send(ws,'Network.enable'); await send(ws,'Network.setCacheDisabled',{cacheDisabled:true});
  const errs=[]; ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.method==='Runtime.exceptionThrown') errs.push(String((m.params.exceptionDetails.exception||{}).description||'').slice(0,160));});

  // T1 fresh laptop
  await fresh(ws); let r=JSON.parse(await ev(ws,Q));
  check('T1 fresh: checklist renders with row 1 current', r.rows.length===3 && /^now:/.test(r.rows[0]) && /^todo:/.test(r.rows[1]), r.rows);
  check('T1 fresh: Add to Chrome is the primary action', r.addToChrome, r);
  check('T1 fresh: overlay open, its install button hidden, step 2 points at the card', r.overlay && r.wInstallHidden && r.wHead2==='Get your classes in.', {o:r.overlay,h:r.wInstallHidden,w:r.wHead2});
  check('T1 fresh: no template literal leaked into visible text', !r.leaked);

  // T2 hello arrives (posted FROM the page, satisfying ev.source === window)
  await ev(ws,`window.postMessage({lmk:'ext-hello', version:'0.4.2'}, '*')`); await sleep(600); r=JSON.parse(await ev(ws,Q));
  check('T2 hello: row 1 done, row 2 current, hero waiting', /^done:Extension added/.test(r.rows[0]) && /^now:Canvas or Brightspace read once/.test(r.rows[1]) && r.waiting, r.rows);
  check('T2 hello: headline says waiting', r.h1==='Extension added. Waiting for Canvas or Brightspace…', r.h1);
  check('T2 hello: overlay step 2 now says added', r.wHead2==='Extension added ✓' && r.wInstallHidden, r.wHead2);
  const stable = await ev(ws,`(function(){ const a=document.querySelector('section.view').innerHTML; render(); render(); return a===document.querySelector('section.view').innerHTML; })()`);
  check('T2 hello: hero string is byte-stable across renders (pulse never restarts)', stable===true);
  const noStore = await ev(ws,`(function(){ const a=document.getElementById('wInstall').hidden; applyStoreUrl(); return document.getElementById('wInstall').hidden===a && a===true; })()`);
  check('T12 applyStoreUrl cannot resurrect the overlay install button', noStore===true);

  // T3 the 60s clock only runs while visible: drive the interval by hand
  const clock = await ev(ws,`(function(){ let cb=null; const si=window.setInterval; window.setInterval=(f,ms)=>{cb=f; return 1;}; clearInterval(nudgeTimer); nudgeTimer=0; extStuck=false; nudgeExtension(); window.setInterval=si;
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}); for(let i=0;i<20;i++) cb(); const hiddenStuck=extStuck;
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>false}); for(let i=0;i<20;i++) cb(); const visibleStuck=extStuck;
    return JSON.stringify({hiddenStuck, visibleStuck}); })()`);
  const c=JSON.parse(clock); check('T3 stuck escalation ignores hidden time and fires when visible', c.hiddenStuck===false && c.visibleStuck===true, c);
  r=JSON.parse(await ev(ws,Q)); check('T3 stuck headline', r.h1==='Nothing has come back from Canvas or Brightspace yet.' && /^now:Canvas or Brightspace read once/.test(r.rows[1]), r.h1);

  // T4 empty answer
  await fresh(ws); await ev(ws,`window.postMessage({lmk:'ext-hello', version:'0.4.2'}, '*')`); await sleep(300);
  await ev(ws,`window.postMessage({lmk:'canvas-payload', payload:{lmk:'canvas',v:3,at:Date.now(),host:'canvas.uw.edu',items:{},courses:[],groups:{}}}, '*')`); await sleep(500); r=JSON.parse(await ev(ws,Q));
  check('T4 empty: rows 1+2 done, row 3 current, headline explains', /^done:/.test(r.rows[0]) && /^done:/.test(r.rows[1]) && /^now:/.test(r.rows[2]) && r.h1==='Canvas answered, but no active courses came back.', {rows:r.rows,h1:r.h1});
  check('T4 empty: store.ext not written, no first-sync key', !r.ext && r.firstKey===null, {ext:r.ext,key:r.firstKey});
  const href = await ev(ws,`canvasHref()`); check('T4 empty: Open Canvas now points at the school that answered', /canvas\.uw\.edu/.test(href), href);

  // T5 first sync with the overlay open, then Let's go
  await fresh(ws); await ev(ws,`window.postMessage({lmk:'ext-hello', version:'0.4.2'}, '*')`); await sleep(300);
  await ev(ws,`window.__toasts=[]; const _t=toast; toast=(m,a)=>{window.__toasts.push(String(m)); return _t(m,a);}; window.postMessage({lmk:'canvas-payload', payload:${PAYLOAD}}, '*')`); await sleep(700); r=JSON.parse(await ev(ws,Q));
  const toasts = await ev(ws,`JSON.stringify(window.__toasts)`);
  check('T5 sync: first-sync flag persisted, sync toast suppressed', r.firstKey!==null && !/Canvas synced:/.test(toasts), {key:r.firstKey,toasts});
  check('T5 sync: overlay step 2 says classes are in, with 2 chips', r.wHead2==='Your classes are in ✓' && r.wChips && !r.wChips.hidden && r.wChips.n===2, {w:r.wHead2,c:r.wChips});
  check('T5 sync: no reveal while the overlay covers it', !r.syncedIn);
  await ev(ws,`document.getElementById('wName').value='Sam'; document.getElementById('wGo').click()`); await sleep(500); r=JSON.parse(await ev(ws,Q));
  check('T5 go: overlay closed, key consumed, reveal shows 2 chips and 14 confetti', !r.overlay && r.firstKey===null && r.syncedIn && r.chips===2 && r.confetti===14, {o:r.overlay,k:r.firstKey,s:r.syncedIn,c:r.chips,f:r.confetti});
  const revealText = await ev(ws,`(document.querySelector('.synced-in .why')||{}).textContent||''`);
  check('T5 go: reveal counts 3 assignments across 2 classes', /3 assignments across 2 classes/.test(revealText), revealText);
  await ev(ws,`CELEBRATE=false; render();`); r=JSON.parse(await ev(ws,Q));
  check('T5 after: reveal gone, normal hero', !r.syncedIn && !!r.h1);

  // T6 reload-consumed celebration (the openApp second reload)
  const seeded = await ev(ws,`JSON.parse(localStorage.getItem('duenorth_v1'))`);
  await fresh(ws,{seed:Object.assign({},seeded,{onboarded:1,profile:{name:'Sam'}}), ls:{lmk_synced_first:String(Date.now())}}); await sleep(600); r=JSON.parse(await ev(ws,Q));
  check('T6 reload: a pending first-sync flag reveals on boot without the overlay', r.syncedIn && !r.overlay, {s:r.syncedIn,o:r.overlay});
  await fresh(ws,{seed:Object.assign({},seeded,{onboarded:1,profile:{name:'Sam'}}), ls:{lmk_synced_first:String(Date.now()-11*60e3)}}); await sleep(600); r=JSON.parse(await ev(ws,Q));
  check('T6 stale: an 11-minute-old flag reveals nothing and is removed', !r.syncedIn && r.firstKey===null, {s:r.syncedIn,k:r.firstKey});

  // T7 phone
  await fresh(ws,{mobile:true}); r=JSON.parse(await ev(ws,Q));
  check('T7 phone: no checklist, computer-first headline, install button hidden', r.rows.length===0 && r.h1==='Start on a computer, not here.' && r.wInstallHidden, {rows:r.rows,h1:r.h1});

  // T10 the hint suppresses the flash
  await fresh(ws,{ls:{lmk_ping_ext:'1'}}); r=JSON.parse(await ev(ws,Q));
  check('T10 hint: paints "Checking…" and no store button before hello', /Checking for the extension/.test(r.rows[0]) && !r.addToChrome, r.rows);
  await sleep(2800); r=JSON.parse(await ev(ws,Q));
  check('T10 hint: settles to Add to Chrome when no hello arrives', r.addToChrome && /^now:Add the LMK/.test(r.rows[0]), r.rows);

  // T11 the typed name survives a reload
  await fresh(ws); await ev(ws,`const n=document.getElementById('wName'); n.value='Sam'; n.dispatchEvent(new Event('input'))`); r=JSON.parse(await ev(ws,Q));
  check('T11 draft: typing writes the draft', r.draft==='Sam', r.draft);
  await fresh(ws,{ls:{lmk_name_draft:'Sam'}}); const pre=await ev(ws,`document.getElementById('wName').value`); check('T11 draft: reload prefills it', pre==='Sam', pre);
  await ev(ws,`document.getElementById('wGo').click()`); await sleep(300); const after=await ev(ws,`JSON.stringify({d:localStorage.getItem('lmk_name_draft'), n:store.profile.name})`);
  check("T11 draft: Let's go saves it and clears the draft", after==='{"d":null,"n":"Sam"}', after);

  // T13 custom row only: no checklist
  await fresh(ws,{seed:{onboarded:1,profile:{name:'Sam'},customRows:[["My thing","ENG 105","20261001T170000Z","","custom-1","","medium","",1,""]]}}); r=JSON.parse(await ev(ws,Q));
  check('T13 custom row: no checklist, the plan hero renders', r.rows.length===0 && !!r.h1, {rows:r.rows,h1:r.h1});

  // T14 existing user, extension update reload
  await fresh(ws,{seed:Object.assign({},seeded,{onboarded:1,profile:{name:'Sam'}})}); await ev(ws,`window.postMessage({lmk:'ext-hello', version:'0.5.0'}, '*')`); await sleep(400); r=JSON.parse(await ev(ws,Q));
  const adopt=await ev(ws,`extCanAdopt()`);
  check('T14 existing user: no checklist, no reveal, no overlay; 0.5.0 gate works', r.rows.length===0 && !r.syncedIn && !r.overlay && adopt===true, {rows:r.rows,s:r.syncedIn,o:r.overlay,adopt});


  // T15 the sync-from-anywhere box is a real choice, and step 3 stops claiming what the box undoes
  await fresh(ws); r=JSON.parse(await ev(ws,`JSON.stringify({row: !document.getElementById('wCloudRow').hidden, checked: document.getElementById('wCloud').checked, body: document.getElementById('wBody3').textContent})`));
  check('T15 consent: shown on a desktop first run, ticked, and step 3 no longer says "never sees grades"', r.row && r.checked && !/never sees/.test(r.body), r);
  await ev(ws,`document.getElementById('wCloud').checked=false; document.getElementById('wName').value='Sam'; document.getElementById('wGo').click()`); await sleep(400);
  r=JSON.parse(await ev(ws,`JSON.stringify({on: !!(store.cloud&&store.cloud.on), sid: !!(store.cloud&&store.cloud.sid), overlay: welcomeOverlay.classList.contains('open')})`));
  check('T15 consent: unticked -> store.cloud kept with on:false, overlay closed', !r.on && r.sid && !r.overlay, r);
  await fresh(ws); await ev(ws,`document.getElementById('wName').value='Sam'; document.getElementById('wGo').click()`); await sleep(400);
  r=JSON.parse(await ev(ws,`JSON.stringify({on: !!(store.cloud&&store.cloud.on)})`));
  check('T15 consent: left ticked -> on', r.on, r);
  await fresh(ws,{mobile:true}); r=JSON.parse(await ev(ws,`JSON.stringify({row: !document.getElementById('wCloudRow').hidden})`));
  check('T15 consent: not offered on a phone', !r.row, r);
  // T15b the same choice through the two other exits
  await fresh(ws); await ev(ws,`document.getElementById('wCloud').checked=false; document.getElementById('wOther').click()`); await sleep(400);
  r=JSON.parse(await ev(ws,`JSON.stringify({on: !!(store.cloud&&store.cloud.on), sid: !!(store.cloud&&store.cloud.sid), onboarded: !!store.onboarded})`));
  check('T15b consent: unticked + Other ways -> on:false kept', !r.on && r.sid && r.onboarded, r);
  await ev(ws,`window.postMessage({lmk:'ext-hello', version:'0.5.1'}, '*')`); await sleep(500);
  r=JSON.parse(await ev(ws,`JSON.stringify({on: !!(store.cloud&&store.cloud.on)})`));
  check('T15b consent: a later ext-hello does not flip it on', !r.on, r);
  await fresh(ws); await ev(ws,`document.getElementById('wCloud').checked=false; document.getElementById('wSignin3').click()`); await sleep(400);
  r=JSON.parse(await ev(ws,`JSON.stringify({on: !!(store.cloud&&store.cloud.on), sid: !!(store.cloud&&store.cloud.sid)})`));
  check('T15b consent: unticked + Sign in with Google -> on:false kept', !r.on && r.sid, r);
  // T17 a parent back from Stripe is not a student: the flag must survive its own declaration
  // a fragment-only navigation never reloads the document, so leave the page first; then wait past the welcome delay
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(400); await ev(ws,`localStorage.clear(); sessionStorage.clear();`);
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(300);
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/#gift=ok'}); await sleep(10500);
  r=JSON.parse(await ev(ws,`JSON.stringify({flag: GIFT_RETURN, overlay: welcomeOverlay.classList.contains('open')})`));
  check('T17 gift return: GIFT_RETURN stays true after boot and the welcome overlay is not open', r.flag===true && !r.overlay, r);
  // T16 before any school has answered, "Open Canvas" is ASU's and says so
  await fresh(ws); r=await ev(ws,`/opens ASU's Canvas/.test(document.querySelector('section.view .hero').textContent)`);
  check('T16 ASU note: shown on a fresh laptop', r===true, r);
  await fresh(ws,{mobile:true}); r=await ev(ws,`/opens ASU's Canvas/.test(document.querySelector('section.view .hero').textContent)`);
  check('T16 ASU note: not on a phone', r===false, r);
  // T18 the LMS choice on the first-run card: Brightspace hides the Canvas-only routes and says where to go; it survives a reload
  await fresh(ws); r=JSON.parse(await ev(ws,`JSON.stringify({chips:document.querySelectorAll('[data-act="lms-hint"]').length, canvasBtn:!!document.querySelector('section.view .hero a[href*="lmk-sync"]'), asu:/opens ASU's Canvas/.test(document.querySelector('section.view .hero').textContent)})`));
  check('T18 fresh: both LMS chips, the Canvas button and the ASU note (Canvas is the default)', r.chips===2 && r.canvasBtn && r.asu, r);
  await ev(ws,`document.querySelector('[data-act="lms-hint"][data-lms="d2l"]').click()`); await sleep(300);
  r=JSON.parse(await ev(ws,`JSON.stringify({hint:localStorage.getItem('lmk_lms_hint'), txt:document.querySelector('section.view .hero').textContent, canvasBtn:!!document.querySelector('section.view .hero a[href*="lmk-sync"]'), token:!!document.querySelector('section.view .hero [data-act="open-token"]'), rows:[...document.querySelectorAll('.checks li')].map(li=>li.textContent.trim())})`));
  check('T18 Brightspace chosen: no Canvas button, no token route, the brightspace.com line, the checklist says Brightspace', r.hint==='d2l' && !r.canvasBtn && !r.token && /brightspace\.com/.test(r.txt) && !/opens ASU's Canvas/.test(r.txt) && /finds it there/.test(r.txt) && !/opens your school's site by itself/.test(r.txt) && /Brightspace read once/.test(r.rows[1]), r);
  await send(ws,'Page.reload'); await sleep(2200);
  r=JSON.parse(await ev(ws,`JSON.stringify({txt:document.querySelector('section.view .hero').textContent, pressed:(document.querySelector('[data-act="lms-hint"][data-lms="d2l"]')||{}).getAttribute&&document.querySelector('[data-act="lms-hint"][data-lms="d2l"]').getAttribute('aria-pressed')})`));
  check('T18 the choice survives a reload', /brightspace\.com/.test(r.txt) && r.pressed==='true', r);
  await ev(ws,`document.querySelector('[data-act="lms-hint"][data-lms="canvas"]').click()`); await sleep(300);
  r=JSON.parse(await ev(ws,`JSON.stringify({canvasBtn:!!document.querySelector('section.view .hero a[href*="lmk-sync"]'), hint:localStorage.getItem('lmk_lms_hint')})`));
  check('T18 back to Canvas: the button returns', r.canvasBtn && r.hint==='canvas', r);
  console.log('\\nJS errors during run:', errs.length? errs.slice(0,4) : 'none');
  console.log(`\\n${fail? fail+' FAILED' : 'ALL OK'}  (${pass} passed)`);
  ws.close(); process.exit(fail?1:0);
})().catch(e=>{ console.log('HARNESS ERROR', e.message); process.exit(2); });

/* Onboarding state machine, end to end, in a real headless Chrome. 40 checks: the checklist hero's states
   (fresh / checking / waiting / stuck / empty / phone), the welcome overlay's copy per state, the first-sync
   reveal and its 10-minute flag, the name draft, the sync-from-anywhere consent box, and (v73.4) the setup steps:
   platform, school address, approval, and that nothing points at ASU.
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
async function fresh(ws, {seed={onboarded:0}, ls={}, mobile=false, ua=''}={}){
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:mobile?500:1100,height:900,deviceScaleFactor:1,mobile});
  await send(ws,'Emulation.setUserAgentOverride',{userAgent: ua ? ua : mobile?'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0 Safari/537.36'});
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(400);
  await ev(ws,`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('duenorth_v1', ${JSON.stringify(JSON.stringify(seed))}); ${Object.entries(ls).map(([k,v])=>`localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(String(v))});`).join('')}`);
  await ev(ws,`navigator.serviceWorker && navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()))`);
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(2600);
}
const READY = {lmk_lms_hint:'canvas', lmk_school:'myschool.instructure.com'};   // the two setup answers, for a school read out of the box
const Q = `(function(){ const $=s=>document.querySelector(s); const rows=[...document.querySelectorAll('.checks li')].map(li=>li.className+':'+li.textContent.trim());
  const wb2=document.getElementById('wBody2'), heroTxt=(document.querySelector('section.view .hero')||{}).textContent||'';
  const s3el=document.getElementById('wSignin3');
  const hero=$('section.view .hero'); return JSON.stringify({rows, h1: hero? (hero.querySelector('h1')||{}).textContent : null, waiting: !!(hero&&hero.classList.contains('waiting')),
  addToChrome: !!(hero && /Add to Chrome/.test(hero.innerHTML)), overlay: welcomeOverlay.classList.contains('open'), wInstallHidden: $('#wInstall').hidden, wBody2: wb2?wb2.textContent:'', s3: s3el?s3el.textContent:'', s3cls: s3el?s3el.className:'', reqTag: !!document.querySelector('.checks .req'), signinLbl: [...document.querySelectorAll('section.view .hero [data-act="web-signin"]')].map(b=>b.textContent).join(''), otherLbl: [...document.querySelectorAll('section.view .hero [data-act="open-gear"]')].map(b=>b.textContent).join(''), heroTxt, wHead2: $('#wHead2').textContent,
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
  check('T1 fresh: the steps start with the platform, five rows, row 1 current', r.rows.length===5 && /^now:Which one your school uses/.test(r.rows[0]) && /^todo:/.test(r.rows[1]), r.rows);
  { const p1=JSON.parse(await ev(ws,`JSON.stringify({picks:[...document.querySelectorAll('.pick')].map(b=>b.dataset.lms), asu:!!document.querySelector('section.view .hero a[href*="asu.edu"]'), href:canvasHref()})`));
    check('T1 fresh: three choices (Canvas, Brightspace, something else), no store button yet, and nothing points at ASU', p1.picks.join()==='canvas,d2l,other' && !r.addToChrome && !p1.asu && p1.href==='', p1); }
  check('T1 fresh: the extension row is marked required from the start', r.reqTag, r.rows);
  /* v71.1: on a computer with nothing synced the welcome no longer opens over the card (it covered the one required
     button); it opens at the first sync. Opened by hand (the gear's setup guide), the sheet still says the same things. */
  check('T1 fresh: the welcome does NOT open over the setup card on a computer', !r.overlay, {o:r.overlay});
  await sleep(7000); check('T1 fresh: and it has not opened 9 s in either (the boot timer)', !(await ev(ws,`welcomeOverlay.classList.contains('open')`)));
  await ev(ws,`openWelcome()`); r=JSON.parse(await ev(ws,Q));
  check('T1 opened by hand: its install button hidden, step 2 names the extension as the required step', r.overlay && r.wInstallHidden && /required step/.test(r.wHead2) && /no automatic way in without it/.test(r.wBody2), {o:r.overlay,h:r.wInstallHidden,w:r.wHead2,b:r.wBody2});
  check('T1 opened by hand: the sheet\'s Google button is a demoted restore, not the loudest thing in it', r.s3==='Used LMK before? Sign in' && r.s3cls==='btn ghost', {t:r.s3, c:r.s3cls});
  check('T1 fresh: no template literal leaked into visible text', !r.leaked);
  // T1b both answers given: the extension is the step, and the alternatives say what they are for
  await fresh(ws,{ls:READY}); r=JSON.parse(await ev(ws,Q));
  check('T1b answered: row 3 (the extension) is current and Add to Chrome is the primary action', /^done:My school uses Canvas/.test(r.rows[0]) && /^done:My school is at myschool\.instructure\.com/.test(r.rows[1]) && /^now:Add the LMK/.test(r.rows[2]) && r.addToChrome, r.rows);
  check('T1b answered: the alternatives say what they are for', /required step/.test(r.heroTxt) && /myschool\.instructure\.com/.test(r.heroTxt) && r.signinLbl==='Used LMK before? Sign in' && r.otherLbl==="Can't add it? Other ways", {s:r.signinLbl, o:r.otherLbl});

  // T2 hello arrives (posted FROM the page, satisfying ev.source === window)
  await fresh(ws,{ls:READY});
  await ev(ws,`window.postMessage({lmk:'ext-hello', version:'0.4.2'}, '*')`); await sleep(600); r=JSON.parse(await ev(ws,Q));
  check('T2 hello: the extension row done, "read once" current, hero waiting', /^done:Extension added/.test(r.rows[2]) && /^now:Canvas read once/.test(r.rows[3]) && r.waiting, r.rows);
  check('T2 hello: the headline names the school to open, and the button opens it', r.h1==='Open myschool.instructure.com and sign in.' && /href="https:\/\/myschool\.instructure\.com\/#lmk-sync"/.test(await ev(ws,`document.querySelector('section.view .hero .actions').innerHTML`)), r.h1);
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
  r=JSON.parse(await ev(ws,Q)); check('T3 stuck headline, and it says how to check the address', r.h1==='Nothing has come back from Canvas yet.' && /^now:Canvas read once/.test(r.rows[3]) && /compare the first part of the address bar/.test(r.heroTxt), r.h1);

  // T4 empty answer
  await fresh(ws); await ev(ws,`window.postMessage({lmk:'ext-hello', version:'0.4.2'}, '*')`); await sleep(300);
  await ev(ws,`window.postMessage({lmk:'canvas-payload', payload:{lmk:'canvas',v:3,at:Date.now(),host:'canvas.uw.edu',items:{},courses:[],groups:{}}}, '*')`); await sleep(500); r=JSON.parse(await ev(ws,Q));
  check('T4 empty: every row done but the last, which is current; headline explains', r.rows.slice(0, -1).every(x => /^done:/.test(x)) && /^now:Your classes land here/.test(r.rows[r.rows.length-1]) && r.h1==='Canvas answered, but no active courses came back.', {rows:r.rows,h1:r.h1});
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
  check('T7 phone: no checklist, laptop-first headline, install button hidden', r.rows.length===0 && r.h1==='Set up LMK on your laptop.' && r.wInstallHidden, {rows:r.rows,h1:r.h1});
  { const ph=JSON.parse(await ev(ws,`JSON.stringify({first:(document.querySelector('section.view .hero .actions .btn')||{}).textContent||'', sample:!!document.querySelector('section.view .hero [data-act="try-sample"]')})`));
    check('T7 phone: the main button sends the link to a laptop, and a sample is one tap away', ph.first==='Send this link to my laptop' && ph.sample, ph); }

  // T10 the hint suppresses the flash
  await fresh(ws,{ls:Object.assign({lmk_ping_ext:'1'}, READY)}); r=JSON.parse(await ev(ws,Q));
  check('T10 hint: paints "Checking…" and no store button before hello', /Checking for the extension/.test(r.rows[2]) && !r.addToChrome, r.rows);
  await sleep(2800); r=JSON.parse(await ev(ws,Q));
  check('T10 hint: settles to Add to Chrome when no hello arrives', r.addToChrome && /^now:Add the LMK/.test(r.rows[2]), r.rows);

  // T11 the typed name survives a reload
  await fresh(ws); await ev(ws,`const n=document.getElementById('wName'); n.value='Sam'; n.dispatchEvent(new Event('input'))`); r=JSON.parse(await ev(ws,Q));
  check('T11 draft: typing writes the draft', r.draft==='Sam', r.draft);
  await fresh(ws,{ls:{lmk_name_draft:'Sam'}}); await ev(ws,`openWelcome()`); const pre=await ev(ws,`document.getElementById('wName').value`); check('T11 draft: reload prefills it', pre==='Sam', pre);
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
  // v71.1: opt-in. The box starts unticked; the welcome is opened by hand here (on a computer it now opens at the first sync)
  await fresh(ws); await ev(ws,`openWelcome()`); r=JSON.parse(await ev(ws,`JSON.stringify({row: !document.getElementById('wCloudRow').hidden, checked: document.getElementById('wCloud').checked, body: document.getElementById('wBody3').textContent})`));
  check('T15 consent: shown on a desktop, UNticked (opt-in), and step 3 claims nothing about grades', r.row && !r.checked && !/never sees|no grades/.test(r.body), r);
  await ev(ws,`document.getElementById('wCloud').checked=false; document.getElementById('wName').value='Sam'; document.getElementById('wGo').click()`); await sleep(400);
  r=JSON.parse(await ev(ws,`JSON.stringify({on: !!(store.cloud&&store.cloud.on), sid: !!(store.cloud&&store.cloud.sid), overlay: welcomeOverlay.classList.contains('open')})`));
  check('T15 consent: unticked -> store.cloud kept with on:false, overlay closed', !r.on && r.sid && !r.overlay, r);
  await fresh(ws); await ev(ws,`openWelcome(); document.getElementById('wName').value='Sam'; document.getElementById('wGo').click()`); await sleep(400);
  r=JSON.parse(await ev(ws,`JSON.stringify({on: !!(store.cloud&&store.cloud.on), sid: !!(store.cloud&&store.cloud.sid)})`));
  check('T15 consent: left as it opens (unticked) -> off, but the identity exists for rooms and the morning note', !r.on && r.sid, r);
  await fresh(ws); await ev(ws,`openWelcome(); document.getElementById('wCloud').checked=true; document.getElementById('wName').value='Sam'; document.getElementById('wGo').click()`); await sleep(400);
  r=JSON.parse(await ev(ws,`JSON.stringify({on: !!(store.cloud&&store.cloud.on)})`));
  check('T15 consent: ticked -> on', r.on, r);
  // T18 the sample semester works on the public build (SEED_ROWS is empty there) and gives way to real classes
  await fresh(ws); await ev(ws,`document.querySelector('[data-act="try-sample"]').click()`); await sleep(400);
  r=JSON.parse(await ev(ws,`JSON.stringify({n: EVENTS.length, bar: !!document.querySelector('.samplebar'), ids: EVENTS.every(e => /^a99900000[0-9]{4}$/.test(e.id)), label: document.getElementById('srcLabel').textContent, stored: JSON.stringify(store).includes('99900000')})`));
  check('T18 sample: a made-up semester appears with its own bar and label, and none of it is in the store', r.n >= 15 && r.bar && r.ids && /Sample semester/.test(r.label) && !r.stored, r);
  await ev(ws,`toggleDone(EVENTS[0].id); toggleDone(EVENTS[1].id)`); await sleep(500);
  r=JSON.parse(await ev(ws,`JSON.stringify({done: Object.keys(store.done).length, streak: store.streakDays.length, dur: Object.keys(store.dur||{}).length, cel: Object.keys(store.celebrated||{}).length})`));
  check('T18 sample: a made-up checkmark earns no streak day, no timing and no celebration', r.done === 2 && r.streak === 0 && r.dur === 0 && r.cel === 0, r);
  await ev(ws,`window.postMessage({lmk:'ext-hello', version:'0.9.2'}, '*'); window.postMessage({lmk:'canvas-payload', payload:${PAYLOAD}}, '*')`); await sleep(900);
  r=JSON.parse(await ev(ws,`JSON.stringify({n: EVENTS.length, bar: !!document.querySelector('.samplebar'), flag: localStorage.getItem('lmk_sample'), left: JSON.stringify(Object.assign({}, store, {deleted: null})).includes('99900000'), tombs: Object.keys(store.deleted||{}).filter(k => /^done:a99900000/.test(k)).length})`));
  check('T18 sample: real classes replace it, the flag goes, its checkmarks leave the store as tombstones (so Drive cannot bring them back)', r.n === 3 && !r.bar && r.flag === null && !r.left && r.tombs === 2, r);
  // T19 a browser that cannot install the extension
  await fresh(ws,{ls:READY, ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'}); r=JSON.parse(await ev(ws,Q));
  { const sf=JSON.parse(await ev(ws,`JSON.stringify({first:(document.querySelector('section.view .hero .actions .btn')||{}).textContent||'', txt:(document.querySelector('section.view .hero .why')||{}).textContent||''})`));
    check('T19 Safari: the card says which browsers work and the main button copies the link instead of opening the store', sf.first==='Copy this link' && /Chrome, Edge, Brave or Arc, not in this browser/.test(sf.txt) && !r.addToChrome, sf); }
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
  // T17 an old Stripe return link (#gift=ok, #plus=ok) from before v71.2 just opens the app: no receipt sheet, no plans
  // sheet, no error, and the first-run card is there. A fragment-only navigation never reloads, so leave the page first.
  for (const h of ['gift=ok', 'plus=ok']) {
    await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(400); await ev(ws,`localStorage.clear(); sessionStorage.clear();`);
    await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(300);
    await send(ws,'Page.navigate',{url:'http://localhost:8899/app/#'+h}); await sleep(3500);
    r=JSON.parse(await ev(ws,`JSON.stringify({open:[...document.querySelectorAll('body > .overlay.open')].map(o=>o.id), hero:!!document.querySelector('section.view .hero'), plans:/LMK Plus|per month|\\$[0-9]/.test(document.body.innerText), err:(window.__errs||[]).length})`));
    check('T17 #'+h+' (an old Stripe return link) opens the app normally: no sheet, no price anywhere, the first-run card', r.open.length===0 && r.hero && !r.plans, r);
  }
  // T16 nothing points at ASU before a school is known (v73.4: "Open Canvas" used to be ASU's for everyone)
  await fresh(ws,{ls:{lmk_lms_hint:'canvas'}}); r=JSON.parse(await ev(ws,`JSON.stringify({href:canvasHref(), links:[...document.querySelectorAll('section.view .hero a')].map(a=>a.href).filter(h=>/asu\\.edu/.test(h)), txt:/ASU's Canvas/.test(document.querySelector('section.view .hero').textContent)})`));
  check('T16 Canvas picked, no school yet: no Open button, no ASU link, no "ASU\'s Canvas" note', r.href==='' && !r.links.length && !r.txt, r);
  // T18 the platform choice and the school address, step by step
  await fresh(ws); await ev(ws,`document.querySelector('.pick[data-lms="d2l"]').click()`); await sleep(300);
  r=JSON.parse(await ev(ws,`JSON.stringify({hint:localStorage.getItem('lmk_lms_hint'), h1:document.querySelector('section.view .hero h1').textContent, ph:(document.getElementById('schoolIn')||{}).placeholder, token:!!document.querySelector('section.view .hero [data-act="open-token"]'), focus:document.activeElement&&document.activeElement.id})`));
  check('T18 Brightspace picked: the address step asks for the Brightspace address, focused, with its example and no token route', r.hint==='d2l' && r.h1==="What's your school's Brightspace address?" && r.ph==='yourschool.brightspace.com' && !r.token && r.focus==='schoolIn', r);
  await ev(ws,`{const i=document.getElementById('schoolIn'); i.value='not an address'; document.querySelector('[data-act="school-save"]').click()}`); await sleep(200);
  r=JSON.parse(await ev(ws,`JSON.stringify({msg:document.getElementById('schoolMsg').textContent, hidden:document.getElementById('schoolMsg').hidden, saved:localStorage.getItem('lmk_school')})`));
  check('T18 a bad address is refused with a sentence, nothing saved', !r.hidden && /doesn't look like a web address/.test(r.msg) && r.saved===null, r);
  await ev(ws,`{const i=document.getElementById('schoolIn'); i.value='https://Learn.School.Brightspace.com/d2l/home'; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))}`); await sleep(300);
  r=JSON.parse(await ev(ws,Q));
  check('T18 a pasted URL (Enter) is cut to its host and saved; a brightspace.com school needs no approval, so the extension is next', (await ev(ws,`localStorage.getItem('lmk_school')`))==='learn.school.brightspace.com' && /^now:Add the LMK/.test(r.rows[2]) && r.rows.length===5, r.rows);
  await send(ws,'Page.reload'); await sleep(2200); r=JSON.parse(await ev(ws,Q));
  check('T18 both answers survive a reload', /^done:My school uses Brightspace/.test(r.rows[0]) && /learn\.school\.brightspace\.com/.test(r.rows[1]), r.rows);
  await ev(ws,`document.querySelector('[data-act="setup-change"][data-step="platform"]').click()`); await sleep(300);
  r=JSON.parse(await ev(ws,`JSON.stringify({hint:localStorage.getItem('lmk_lms_hint'), school:localStorage.getItem('lmk_school'), picks:document.querySelectorAll('.pick').length})`));
  check('T18 Change on the platform clears it and the school after it', r.hint===null && r.school===null && r.picks===3, r);
  await ev(ws,`window.__toasts=[]; const _t2=toast; toast=(m,a)=>{window.__toasts.push(String(m)); return _t2(m,a);}; document.querySelector('.pick[data-lms="canvas"]').click()`); await sleep(300);
  await ev(ws,`{const i=document.getElementById('schoolIn'); i.value='x.brightspace.com'; document.querySelector('[data-act="school-save"]').click()}`); await sleep(300);
  r=JSON.parse(await ev(ws,`JSON.stringify({hint:localStorage.getItem('lmk_lms_hint'), toasts:window.__toasts})`));
  check('T18 a Brightspace address typed under Canvas switches the platform and says so', r.hint==='d2l' && /switched to Brightspace/.test(r.toasts.join(' ')), r);
  // T20 a school on its own address: the approval step, ticked off by the extension
  await fresh(ws,{ls:{lmk_lms_hint:'canvas', lmk_school:'canvas.uw.edu'}}); await ev(ws,`window.postMessage({lmk:'ext-hello', version:'0.9.8'}, '*')`); await sleep(500); r=JSON.parse(await ev(ws,Q));
  check('T20 own address: six rows, "Let LMK read canvas.uw.edu" current, step 4 of 5', r.rows.length===6 && /^now:Let LMK read canvas\.uw\.edu/.test(r.rows[3]) && /Step 4 of 5/.test(await ev(ws,`document.querySelector('section.view .hero .kicker').textContent`)), r.rows);
  await ev(ws,`window.__posted=[]; const _pm=window.postMessage.bind(window); window.postMessage=(d,o)=>{window.__posted.push(d); return _pm(d,o);}; document.querySelector('[data-act="host-add"]').click()`); await sleep(200);
  r=JSON.parse(await ev(ws,`JSON.stringify(window.__posted.filter(d=>d&&d.lmk==='host-page'))`));
  check('T20 Approve asks the extension for its page with the typed school as a suggestion', r.length===1 && r[0].host==='canvas.uw.edu', r);
  await ev(ws,`window.postMessage({lmk:'ext-hosts', hosts:['canvas.uw.edu']}, '*')`); await sleep(400); r=JSON.parse(await ev(ws,Q));
  check('T20 once Chrome granted it, the row ticks and the school is next to open', /^done:canvas\.uw\.edu approved in Chrome/.test(r.rows[3]) && /^now:Canvas read once/.test(r.rows[4]) && r.h1==='Open canvas.uw.edu and sign in.', r.rows);
  await fresh(ws,{ls:{lmk_lms_hint:'canvas', lmk_school:'canvas.uw.edu'}}); await ev(ws,`window.postMessage({lmk:'ext-hello', version:'0.4.2'}, '*')`); await sleep(500);
  r=JSON.parse(await ev(ws,`JSON.stringify({txt:document.querySelector('section.view .hero .why').textContent, btn:!!document.querySelector('[data-act="host-add"]')})`));
  check('T20 an extension too old to add a school says to update it, with no dead button', /Update it/.test(r.txt) && !r.btn, r);
  // T21 a platform LMK cannot read yet
  await fresh(ws); await ev(ws,`document.querySelector('.pick[data-lms="other"]').click()`); await sleep(300);
  r=JSON.parse(await ev(ws,`JSON.stringify({h1:document.querySelector('section.view .hero h1').textContent, ask:!!document.querySelector('section.view .hero a[href*="mail"]'), store:/Add to Chrome/.test(document.querySelector('section.view .hero').innerHTML)})`));
  check('T21 "Something else": an honest no, a way to ask for it, and no store button', r.h1==="LMK can't read that one yet." && r.ask && !r.store, r);
  await ev(ws,`document.querySelector('[data-act="setup-change"][data-step="platform"]').click()`); await sleep(300);
  check('T21 Back returns to the choice', (await ev(ws,`document.querySelectorAll('.pick').length`))===3);
  console.log('\\nJS errors during run:', errs.length? errs.slice(0,4) : 'none');
  console.log(`\\n${fail? fail+' FAILED' : 'ALL OK'}  (${pass} passed)`);
  ws.close(); process.exit(fail?1:0);
})().catch(e=>{ console.log('HARNESS ERROR', e.message); process.exit(2); });

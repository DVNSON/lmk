/* The counter's v74.8 words, end to end in a real headless Chrome. A phone's copy of the words where a phone and a computer
   mean different things (open_m and friends), never on words that mean the same; the first useful outcome (plan_viewed: the
   student's own plan on screen for 5 seconds, once per student); the weekly headcount (active_w, once per student per ISO
   week); the ISO week itself; and Mission control folding the phone words back into the plain ones while its funnel shows
   phones apart. Run: node tools/test-counter.js (needs :8899 serving ~/lmk-web and Chrome :9333). Count: what it prints. */
const {execSync}=require('child_process'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text);return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,260)));ok?pass++:fail++;};
const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const MAC='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const payload=()=>({lmk:'canvas',v:3,at:Date.now(),host:'canvas.asu.edu',groups:{},courses:[{id:'1',tag:'BIO 202',wt:false}],
  items:{'901':{t:'Problem set 1',c:'BIO 202',cid:'1',due:new Date(Date.now()+2*864e5).toISOString(),pts:10,st:'online_upload',grp:'g',k:'',sub:'',score:null}}});
/* every /hit body the page sends, with the counter allowed to run on localhost for this test only */
const CAPTURE=`window.__hits=[]; window.pingAllowed=()=>true; const __of=window.fetch;
  window.fetch=function(u,o){ if(/[/]hit$/.test(String(u))){ try{ window.__hits.push(JSON.parse(o.body).ev); }catch(_){} return Promise.resolve(new Response('{"ok":true}',{status:200})); } return __of.apply(this,arguments); }; 1`;
async function page({mobile, seed, hash=''}){
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable');
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:mobile?500:1100,height:900,deviceScaleFactor:1,mobile:!!mobile});
  await send(ws,'Emulation.setUserAgentOverride',{userAgent:mobile?IPHONE:MAC});
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(300);
  await ev(ws,`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('duenorth_v1', ${JSON.stringify(JSON.stringify(seed||{onboarded:1}))}); 1`);
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(100);
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'+hash}); await sleep(2200);
  await ev(ws,CAPTURE);
  return {ws, close:()=>{ try{ ws.close(); execSync('curl -s http://localhost:9333/json/close/'+t.id,{stdio:'pipe'}); }catch(_){} }};
}
(async()=>{
  // 1. the phone split, and only on the words it is for
  let P=await page({mobile:false});
  let r=JSON.parse(await ev(P.ws,`(async()=>{ for (const e of ['open','install','firstsync','synced','back_d7','school_seen','from_chat']) await ping(e); return JSON.stringify(__hits); })()`));
  check('a computer sends the plain words', JSON.stringify(r)===JSON.stringify(['open','install','firstsync','synced','back_d7','school_seen','from_chat']), r);
  P.close();
  P=await page({mobile:true});
  r=JSON.parse(await ev(P.ws,`(async()=>{ for (const e of ['open','install','firstsync','synced','back_d7','school_seen','from_chat','back_d7_chat']) await ping(e); return JSON.stringify(__hits); })()`));
  check('a phone sends the split words with _m, and every other word unchanged', JSON.stringify(r)===JSON.stringify(['open_m','install_m','firstsync_m','synced_m','back_d7_m','school_seen','from_chat','back_d7_chat']), r);
  r=await ev(P.ws,`(()=>{ const b=JSON.stringify({ev:'open_m'}); return Object.keys(JSON.parse(b)).join(','); })()`);
  P.close();

  // 2. the ISO week
  P=await page({mobile:false});
  r=JSON.parse(await ev(P.ws,`JSON.stringify(['2026-01-01','2024-12-30','2021-01-03','2026-10-19','2026-10-25','2026-12-31'].map(d=>isoWeekKey(Date.parse(d+'T12:00:00Z'))))`));
  check('isoWeekKey: year edges and a Sunday land in the right ISO week', JSON.stringify(r)===JSON.stringify(['2026-W01','2025-W01','2020-W53','2026-W43','2026-W43','2026-W53']), r);

  // 3. the first useful outcome: their own plan on screen for 5 seconds, once per student
  await ev(P.ws,`window.postMessage({lmk:'canvas-payload', payload:${JSON.stringify(payload())}}, '*'); 1`); await sleep(900);
  await ev(P.ws,`welcomeOverlay.classList.remove('open'); __hits.length=0; 1`);
  await sleep(1500);
  check('the plan is not "seen" before 5 seconds', !(await ev(P.ws,`__hits.includes('plan_viewed')`)), await ev(P.ws,`JSON.stringify(__hits)`));
  await sleep(4500);
  r=JSON.parse(await ev(P.ws,`JSON.stringify({hits:__hits, seen:store.planSeen||0})`));
  check('after 5 seconds on Now with their classes: plan_viewed once, and the student\'s store remembers it', r.hits.filter(x=>x==='plan_viewed').length===1 && r.seen>0, r);
  await ev(P.ws,`__hits.length=0; planSeenMaybe(); 1`); await sleep(5600);
  check('never again for this student', !(await ev(P.ws,`__hits.includes('plan_viewed')`)), await ev(P.ws,`JSON.stringify(__hits)`));
  // 4. the weekly headcount
  r=JSON.parse(await ev(P.ws,`JSON.stringify({hits:__hits, wk:store.activeWk||'', now:isoWeekKey()})`));
  check('active_w went once this week, and the store holds the week it counted', r.wk===r.now, r);
  await ev(P.ws,`__hits.length=0; pingWeekly(); 1`); await sleep(300);
  check('a second open in the same week sends nothing', !(await ev(P.ws,`__hits.includes('active_w')`)), await ev(P.ws,`JSON.stringify(__hits)`));
  await ev(P.ws,`store.activeWk='2020-W01'; __hits.length=0; pingWeekly(); 1`); await sleep(400);
  check('a new week counts the student again', JSON.stringify(await ev(P.ws,`JSON.stringify(__hits)`))===JSON.stringify(JSON.stringify(['active_w'])) && (await ev(P.ws,`store.activeWk`))===(await ev(P.ws,`isoWeekKey()`)), await ev(P.ws,`JSON.stringify({h:__hits,wk:store.activeWk})`));
  P.close();

  // 5. not on the Plan tab, and not for the sample semester
  P=await page({mobile:false, seed:{onboarded:1, tab:{}}});
  await ev(P.ws,`window.postMessage({lmk:'canvas-payload', payload:${JSON.stringify(payload())}}, '*'); 1`); await sleep(900);
  await ev(P.ws,`welcomeOverlay.classList.remove('open'); document.querySelector('nav.topnav [data-tab="plan"], [data-tab="plan"]').click(); __hits.length=0; 1`); await sleep(6000);
  check('another tab is not "seeing their plan"', !(await ev(P.ws,`__hits.includes('plan_viewed')`)) && !(await ev(P.ws,`store.planSeen||0`)), await ev(P.ws,`JSON.stringify(__hits)`));
  await ev(P.ws,`document.querySelector('[data-tab="now"]').click(); 1`); await sleep(5600);
  check('switching to Now starts the 5 seconds', (await ev(P.ws,`__hits.filter(x=>x==='plan_viewed').length`))===1, await ev(P.ws,`JSON.stringify(__hits)`));
  P.close();
  P=await page({mobile:false});   // the sample the way a student gets it: its own button, no classes of theirs (theirs would replace it)
  await ev(P.ws,`welcomeOverlay.classList.remove('open'); document.querySelector('[data-act="try-sample"]').click(); 1`); await sleep(1500);
  const sampleShown = await ev(P.ws,`sampleOn() && EVENTS.length > 0`);   // the sample fills the plan from made-up rows, never store.ext
  await ev(P.ws,`__hits.length=0; planSeenMaybe(); pingWeekly(); 1`); await sleep(5800);
  check('the sample semester (on screen, with its made-up classes) counts for neither', sampleShown && !(await ev(P.ws,`__hits.some(x=>/plan_viewed|active_w/.test(x))`)), {sampleShown, hits: await ev(P.ws,`JSON.stringify(__hits)`)});
  P.close();

  // 6. a phone sends the phone copies of the new words
  P=await page({mobile:true});
  await ev(P.ws,`window.postMessage({lmk:'canvas-payload', payload:${JSON.stringify(payload())}}, '*'); 1`); await sleep(900);
  await ev(P.ws,`welcomeOverlay.classList.remove('open'); __hits.length=0; store.planSeen=0; store.activeWk=''; planSeenMaybe(); pingWeekly(); 1`); await sleep(5800);
  r=JSON.parse(await ev(P.ws,`JSON.stringify(__hits)`));
  check('on a phone: plan_viewed_m and active_w_m', r.includes('plan_viewed_m') && r.includes('active_w_m') && !r.includes('plan_viewed') && !r.includes('active_w'), r);
  P.close();

  // 6b. the cohort funnel (v75.0): only a device whose first open came after it shipped sends f_*, each once
  P=await page({mobile:false});
  r=JSON.parse(await ev(P.ws,`JSON.stringify({c:localStorage.getItem('lmk_cohort'), today:utcDayKey()})`));
  check('a device opening LMK for the first time joins the cohort (its first day)', r.c===r.today, r);
  await ev(P.ws,`__hits.length=0; pingFunnel('install'); pingFunnel('install'); 1`); await sleep(300);
  await ev(P.ws,`window.postMessage({lmk:'ext-hello', version:'0.9.12'}, '*'); 1`); await sleep(400);
  await ev(P.ws,`window.postMessage({lmk:'canvas-payload', payload:${JSON.stringify(payload())}}, '*'); 1`); await sleep(900);
  await ev(P.ws,`welcomeOverlay.classList.remove('open'); store.planSeen=Date.now()-864e5; planSeenMaybe(); 1`); await sleep(5800);
  r=JSON.parse(await ev(P.ws,`JSON.stringify(__hits.filter(x=>/^f_|plan_viewed/.test(x)))`));
  check('cohort computer: f_install once, then f_ext, f_sync and f_plan (even for a student whose plan_viewed was already counted)', JSON.stringify(r)===JSON.stringify(['f_install','f_ext','f_sync','f_plan']), r);
  await ev(P.ws,`__hits.length=0; localStorage.setItem('lmk_cohort', new Date(Date.now()-8*864e5).toISOString().slice(0,10)); localStorage.removeItem('lmk_ping_day'); pingDaily(); 1`); await sleep(400);
  r=JSON.parse(await ev(P.ws,`JSON.stringify(__hits.filter(x=>/^f_/.test(x)))`));
  check('eight days after its first open: f_back1 and f_back7', JSON.stringify(r)===JSON.stringify(['f_back1','f_back7']), r);
  P.close();
  P=await page({mobile:false});
  await ev(P.ws,`localStorage.removeItem('lmk_cohort'); localStorage.setItem('lmk_ping_day','2026-01-01'); 1`);
  await send(P.ws,'Page.navigate',{url:'about:blank'}); await sleep(100); await send(P.ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(2200); await ev(P.ws,CAPTURE);
  await ev(P.ws,`pingFunnel('install'); window.postMessage({lmk:'ext-hello', version:'0.9.12'}, '*'); window.postMessage({lmk:'canvas-payload', payload:${JSON.stringify(payload())}}, '*'); 1`); await sleep(900);
  await ev(P.ws,`welcomeOverlay.classList.remove('open'); planSeenMaybe(); pingFunnelReturn(); 1`); await sleep(5800);
  r=JSON.parse(await ev(P.ws,`JSON.stringify({cohort:localStorage.getItem('lmk_cohort'), f:__hits.filter(x=>/^f_/.test(x))})`));
  check('a device that opened LMK before the cohort began never sends an f_ word', r.cohort===null && r.f.length===0, r);
  P.close();
  P=await page({mobile:true});
  await ev(P.ws,`__hits.length=0; pingFunnel('install'); pingFunnel('ext'); pingFunnel('sync'); 1`); await sleep(400);
  r=JSON.parse(await ev(P.ws,`JSON.stringify(__hits)`));
  check('a phone in the cohort sends only f_install_m (discovery)', JSON.stringify(r)===JSON.stringify(['f_install_m']), r);
  P.close();

  // 7. Mission control: phones folded back into the plain words once; the funnel shows them apart
  const today=new Date().toISOString().slice(0,10), off=k=>new Date(Date.parse(today+'T00:00:00Z')-k*864e5).toISOString().slice(0,10);
  P=await page({mobile:false});
  r=JSON.parse(await ev(P.ws,`(()=>{ const d={days:{'${today}':{open:2,open_m:3,school_seen_m:9}},allTime:{install:5,install_m:2},totals:{},today:{open:2,open_m:3}};
    foldPhones(d); foldPhones(d); return JSON.stringify({o:d.days['${today}'].open, i:d.allTime.install, s:d.days['${today}'].school_seen||0, t:d.today.open}); })()`));
  check('foldPhones adds a phone word into its plain word once (twice is still once), and leaves other words alone', r.o===5 && r.i===7 && r.s===0 && r.t===5, r);
  P.close();
  const AT={install:30,install_m:10,firstsync:12,firstsync_m:4,plan_viewed:7,plan_viewed_m:2,open:50,open_m:20,step_fresh:20,step_waiting:14,
    f_install:20,f_install_m:6,f_ext:12,f_sync:8,f_plan:6,f_back1:4,f_back7:2,f_stuck:1};
  const BUNDLE={ok:true,settings:{},lmsHosts:[],rooms:null,ops:{version:24,cronAt:Date.now()},cloud:{},problems:[],errs:[],today:{open:5,open_m:3},errToday:0,
    since:off(60),totals:AT,allTime:AT,firstDay:off(60),todayKey:today,days:{[today]:{active_w:3,active_w_m:2,open:5,open_m:3},[off(7)]:{active_w:4},[off(3)]:{f_install:20,f_install_m:6,step_waiting:14}},schools:[],school:null,schoolMin:10};
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable');
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:1200,height:1000,deviceScaleFactor:1,mobile:false});
  await send(ws,'Emulation.setUserAgentOverride',{userAgent:MAC});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:`
    try{ if(!sessionStorage.getItem('seeded')){ localStorage.clear(); localStorage.setItem('duenorth_v1',JSON.stringify({onboarded:1,adminKey:'test-key'})); sessionStorage.setItem('seeded','1'); } }catch(_){}
    const __B=${JSON.stringify(BUNDLE)}, __of=window.fetch;
    window.fetch=function(u,o){ if(/[/]admin[?]/.test(String(u))) return Promise.resolve(new Response(JSON.stringify(__B),{status:200,headers:{'content-type':'application/json'}})); return __of.apply(this,arguments); };`});
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(150);
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/#admin=test-key'}); await sleep(3000);
  await ev(ws,`(()=>{const b=[...document.querySelectorAll('[data-tab]')].find(x=>x.dataset.tab==='admin'); if(b) b.click(); ADMIN.tab='overview'; render(); return 1})()`); await sleep(1500);
  r=JSON.parse(await ev(ws,`JSON.stringify((()=>{ const rows={}; document.querySelectorAll('#view-admin .fnrow').forEach(x=>{ rows[x.querySelector('.fnl').textContent.trim()]=+x.querySelector('.fnv').textContent; });
    const pct={}; document.querySelectorAll('#view-admin .fnrow').forEach(x=>{ pct[x.querySelector('.fnl').textContent.trim()]=(x.querySelector('.fnp')||{}).textContent||''; });
    const card=[...document.querySelectorAll('#view-admin .adm-card')].find(c=>/Where setup stops/.test(c.textContent))||{textContent:''};
    const all=[...(card.querySelectorAll ? card.querySelectorAll('details tr') : [])].map(tr=>[...tr.children].map(td=>td.textContent.trim()));
    const tiles=[...document.querySelectorAll('#view-admin .tile')].map(x=>[...x.children].map(c=>c.textContent.trim()).join(' ').replace(/\\s+/g,' ')); return {rows, pct, note:card.textContent.replace(/\\s+/g,' '), all, wk:tiles.find(x=>/Active this week/.test(x))||'', act:tiles.find(x=>/Active today/.test(x))||''}; })())`));
  check('the funnel is the cohort: 20 computers opened, 12 added the extension, 8 synced, 6 saw their plan, 4 back next day, 2 after a week', JSON.stringify(r.rows)===JSON.stringify({'Opened LMK on a computer':20,'Added the extension':12,'Synced their school':8,'Saw their plan':6,'Came back the next day':4,'Came back after a week':2}), r.rows);
  check('each row is a share of the computers that opened (60%, 40%, ...) and every row is at most the one above', r.pct['Added the extension']==='60%' && r.pct['Synced their school']==='40%' && Object.values(r.rows).every((v,i,a)=>!i||v<=a[i-1]), r.pct);
  check('phones (6) and stuck computers (1) are named beside it, not as funnel rows', /Phones that opened LMK in the same time: 6\b/.test(r.note) && /school never answered: 1\b/.test(r.note), r.note.slice(0,400));
  check('the all-time counters are kept, each with the day it began counting', r.all.some(x=>x[0]==='Waiting on the school after adding it' && x[1]==='14' && /[A-Z][a-z]{2} [0-9]{1,2}/.test(x[2])) && r.all.some(x=>x[0]==='Synced at least once' && x[1]==='16'), r.all);
  check('"Active this week" sums this week\'s active_w from phones and computers (5), with last week beside it (4)', /Active this week\s*5\b/.test(r.wk) && /last week 4\b/.test(r.wk), r.wk);
  check('"Active today" still counts every device (5 + 3)', /Active today\s*8\b/.test(r.act), r.act);
  try{ ws.close(); execSync('curl -s http://localhost:9333/json/close/'+t.id,{stdio:'pipe'}); }catch(_){}
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.stack||e.message);process.exit(2)});

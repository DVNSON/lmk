/* Mission control by school (v73.5, worker v20). Hermetic: the worker's /admin answer is a fixture, so this runs
   before the worker ships and never reads live numbers. Drives the state it changes — Growth on All schools, Growth
   on one school, the switch back — rather than the Overview that loads first, because a tab nobody opened in testing
   is how the Plus tab crashed for days. Run: node tools/test-schools.js [shots-dir]
   (needs: cd ~/lmk-web && python3 -m http.server 8899, plus headless Chrome on :9333) */
const {execSync}=require('child_process'); const fs=require('fs'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||'');return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,260)));ok?pass++:fail++;};
const SHOTS=process.argv[2]||'';
const today=new Date().toISOString().slice(0,10);
const dayOff=k=>new Date(Date.parse(today+'T00:00:00Z')-k*864e5).toISOString().slice(0,10);
// everyone: numbers no school has, so a view that mixes the two is caught
const G={install:777,firstsync:300,open:900,synced:800,back_d1:90,back_d7:50,back_d30:20,from_prof:12,act_prof:8,back_d7_prof:5,school_seen:17};
const SCH={host:'canvas.asu.edu',since:dayOff(89),firstDay:dayOff(15),todayKey:today,min:10,
  days:{[dayOff(15)]:{school_seen:10,firstsync:6,open:20,synced:15},[dayOff(3)]:{school_seen:4,firstsync:3,back_d1:6,back_d7:4,fin_ontime:7,fin_late:2,act_prof:5,back_d7_prof:3,open:20,synced:15}},
  allTime:{school_seen:14,firstsync:9,back_d1:6,back_d7:4,back_d30:0,fin_ontime:7,fin_late:2,act_prof:5,back_d7_prof:3,open:40,synced:30}};
SCH.totals=SCH.allTime;
const BUNDLE={ok:true,settings:{storeUsers:19},lmsHosts:[],rooms:null,ops:{version:20,cronAt:Date.now()},cloud:{},problems:[],errs:[],today:{},errToday:0,
  since:dayOff(89),totals:G,allTime:G,firstDay:dayOff(40),todayKey:today,days:{[dayOff(15)]:{install:400,firstsync:150,open:450},[dayOff(3)]:{install:377,firstsync:150,open:450}},
  schools:[{host:'canvas.asu.edu',seen:14,firstsync:9,back_d7:4,fin_ontime:7,fin_late:2,open:true},{host:'canvas.small.edu',seen:3,firstsync:0,back_d7:0,fin_ontime:0,fin_late:0,open:false}],
  school:null,schoolMin:10};
const KEY='test-key';
(async()=>{
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable');
  const errs=[]; ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.method==='Runtime.exceptionThrown') errs.push(String((m.params.exceptionDetails.exception||{}).description||'').slice(0,240));});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:`
    try{ if(!sessionStorage.getItem('seeded')){ localStorage.clear(); localStorage.setItem('duenorth_v1',JSON.stringify({onboarded:1,capacity:{weekday:3,weekend:3},adminKey:${JSON.stringify(KEY)}})); sessionStorage.setItem('seeded','1'); } }catch(_){}
    window.__adminUrls=[]; const B=${JSON.stringify(BUNDLE)}, SCH=${JSON.stringify(SCH)}; const of=window.fetch;
    window.fetch=function(u,o){ const s=String(u);
      if(/[/]admin[?]/.test(s)){ window.__adminUrls.push(s); const m=s.match(/[?&]school=([^&]+)/); const b=JSON.parse(JSON.stringify(B));
        b.school = m && decodeURIComponent(m[1])==='canvas.asu.edu' ? SCH : null;
        return Promise.resolve(new Response(JSON.stringify(b),{status:200,headers:{'content-type':'application/json'}})); }
      return of.apply(this, arguments); };
    navigator.clipboard && (navigator.clipboard.writeText=t=>{ window.__csv=t; return Promise.resolve(); });`});
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:1200,height:1000,deviceScaleFactor:1,mobile:false});
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(150);
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/#admin='+KEY}); await sleep(3000);
  await ev(ws,`(()=>{const b=[...document.querySelectorAll('[data-tab]')].find(x=>x.dataset.tab==='admin');if(b)b.click();return !!b})()`);
  await sleep(1500);
  check('the fixture bundle loaded', await ev(ws,`!!(ADMIN.data && ADMIN.data.schools)`), await ev(ws,`ADMIN.err`));
  const view=()=>ev(ws,`((document.getElementById('view-admin')||{}).innerText||'').replace(/\\s+/g,' ')`);
  const shot=async name=>{ if(!SHOTS) return; const r=await send(ws,'Page.captureScreenshot',{format:'png',captureBeyondViewport:true}); fs.writeFileSync(SHOTS+'/'+name+'.png',Buffer.from(r.data,'base64')); };
  await ev(ws,`ADMIN.tab='growth'; ADMIN.school=''; render(); 1`); await sleep(500);
  let v=await view();
  const chips=await ev(ws,`JSON.stringify([...document.querySelectorAll('[data-act="adm-school"]')].map(b=>b.innerText.trim()))`);
  check('All schools: the picker offers only schools past the floor', chips==='["All schools","canvas.asu.edu"]', chips);
  check('All schools: the by-school table shows a small school as counted with everyone', /canvas[.]small[.]edu 3 counted with everyone until 10 devices/i.test(v), v.slice(0,400));
  check('All schools: the by-school table shows ASU\'s own numbers', /canvas[.]asu[.]edu 14 9 4 7 of 9/i.test(v), v.slice(0,400));
  check('All schools: the door table has returns by door', /Back after a week/i.test(v) && /A professor \?from=prof 12 8 67% \(39–86%\) 5 of 8 — too few to read/i.test(v), v.slice(v.indexOf('Which door'), v.indexOf('Which door')+400));
  check('All schools: the store tile and the rooms card are still there', /On the Chrome store/i.test(v) && /Invites and rooms/i.test(v), '');
  await shot('growth-all');
  await ev(ws,`document.querySelector('[data-act="adm-school"][data-school="canvas.asu.edu"]').click(); 1`); await sleep(700);
  check('picking a school asks the worker for that school', await ev(ws,`/[?&]school=canvas[.]asu[.]edu/.test(window.__adminUrls[window.__adminUrls.length-1]||'')`), await ev(ws,`window.__adminUrls`));
  v=await view();
  check('one school: its own tiles', /Devices at this school 14/i.test(v) && /Got it working 9/i.test(v), v.slice(0,500));
  check('one school: week-one returns against first syncs a week old', /Came back within a week 4 of the 6 that first synced here a week or more ago · too few to read/i.test(v), v.slice(0,700));
  check('one school: finished on time', /Finished on time 7 of 9 finished here · too few to read/i.test(v), v.slice(0,700));
  check('one school: the funnel starts at the first sync', /After the first sync/i.test(v) && /Synced at least once 9 100%/i.test(v) && !/Opened LMK [0-9]/i.test(v), v.slice(v.indexOf('After the first'), v.indexOf('After the first')+300));
  check('one school: nothing that is everyone\'s (store, rooms, 777 devices)', !/On the Chrome store/i.test(v) && !/Invites and rooms/i.test(v) && !/777/i.test(v), '');
  check('one school: its doors, with returns', /A professor \?from=prof 5 3 of 5 — too few to read/i.test(v), v.slice(v.indexOf('Which door'), v.indexOf('Which door')+300));
  check('the chip shows which school is picked', await ev(ws,`document.querySelector('[data-act="adm-school"][aria-pressed="true"]').dataset.school`)==='canvas.asu.edu', '');
  await ev(ws,`document.querySelector('[data-act="adm-copy-csv"]').click(); 1`); await sleep(300);
  const csv=await ev(ws,`String(window.__csv||'')`);
  check('CSV copies the school\'s days', csv.split('\n').length===3 && csv.includes(','+'6'+',') , csv);
  await shot('growth-asu');
  await ev(ws,`ADMIN.tab='overview'; render(); 1`); await sleep(400);
  check('Overview stays everyone\'s while a school is picked', /777/i.test(await view()), (await view()).slice(0,300));
  await ev(ws,`ADMIN.tab='growth'; render(); 1`); await sleep(300);
  await ev(ws,`document.querySelector('[data-act="adm-school"][data-school=""]').click(); 1`); await sleep(700);
  v=await view();
  check('All schools again', await ev(ws,`ADMIN.school`)==='' && /By school/i.test(v) && /On the Chrome store/i.test(v), v.slice(0,200));
  await ev(ws,`document.querySelector('[data-act="adm-school"][data-school="canvas.asu.edu"]').click(); 1`); await sleep(500);
  await ev(ws,`ADMIN.school='canvas.small.edu'; ADMIN.data.school=null; ADMIN.loading=false; render(); 1`); await sleep(300);
  check('a school with no numbers says so instead of crashing', /No numbers for canvas[.]small[.]edu yet/i.test(await view()), (await view()).slice(0,300));
  await send(ws,'Page.reload'); await sleep(3000);
  check('the pick is not remembered on the device', await ev(ws,`ADMIN.school===''&&!Object.keys(localStorage).some(k=>/admin.*school/.test(k))`), await ev(ws,`JSON.stringify([ADMIN.school,Object.keys(localStorage)])`));
  if (SHOTS) {   // the phone sheet: 500px with an iPhone user agent, light mode
    await send(ws,'Emulation.setUserAgentOverride',{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'});
    await send(ws,'Emulation.setDeviceMetricsOverride',{width:500,height:1000,deviceScaleFactor:2,mobile:true});
    await send(ws,'Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
    await ev(ws,`(()=>{const b=[...document.querySelectorAll('[data-tab]')].find(x=>x.dataset.tab==='admin');if(b)b.click();return 1})()`); await sleep(1200);
    await ev(ws,`ADMIN.tab='growth'; render(); document.querySelector('[data-act="adm-school"][data-school="canvas.asu.edu"]').click(); 1`); await sleep(900);
    check('at 500px the page is no wider than the screen', await ev(ws,`document.documentElement.scrollWidth<=innerWidth+1`), await ev(ws,`[document.documentElement.scrollWidth,innerWidth]`));
    await shot('growth-asu-phone');
    await send(ws,'Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
    await ev(ws,`document.querySelector('[data-act="adm-school"][data-school=""]').click(); 1`); await sleep(900);
    await shot('growth-all-phone-dark');
  }
  check('no uncaught errors', !errs.length, errs.slice(0,3));
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.message);process.exit(2)});

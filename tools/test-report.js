/* The partner report (v74.1): one school's counts by month, for the school (Admin → Growth → a school → Report for the
   school). Hermetic: /admin is a fixture. What it guards is the small-cell rule a school's research office relies on —
   a count from 1 to 9 never prints, and no printed total, average or share lets one be worked back out — plus the
   labels (devices, not students) and that the button really downloads what the model built.
   Run: node tools/test-report.js [shots-dir]   (needs :8899 serving ~/lmk-web and headless Chrome on :9333) */
const {execSync}=require('child_process'); const fs=require('fs'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||'');return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,300)));ok?pass++:fail++;};
const SHOTS=process.argv[2]||'';
const today=new Date().toISOString().slice(0,10);
const dayOff=k=>new Date(Date.parse(today+'T00:00:00Z')-k*864e5).toISOString().slice(0,10);
/* A fixed school year, so every expected cell is known: devices before the floor in August, the floor on Sep 3. */
const REP={host:'canvas.asu.edu',since:'2025-10-16',firstDay:'2026-08-20',todayKey:'2026-10-15',min:10,days:{
  '2026-08-20':{school_seen:4},
  '2026-09-03':{school_seen:8,open:12,fin_ontime:10,fin_late:2},
  '2026-09-10':{open:60,back_d7:3,fin_ontime:30,fin_late:10},
  '2026-09-30':{open:78},
  '2026-10-02':{school_seen:12,open:40,back_d7:11,fin_ontime:8},
  '2026-10-15':{open:50}},allTime:{school_seen:24}};
// the 90-day Growth view's own fixture (test-schools.js shape), on real dates
const SCH={host:'canvas.asu.edu',since:dayOff(89),firstDay:dayOff(15),todayKey:today,min:10,
  days:{[dayOff(15)]:{school_seen:10,firstsync:6,open:20,synced:15},[dayOff(3)]:{school_seen:4,firstsync:3,back_d7:4,fin_ontime:7,fin_late:2,open:20}},
  allTime:{school_seen:14,firstsync:9,back_d7:4,fin_ontime:7,fin_late:2,open:40}}; SCH.totals=SCH.allTime;
const G={install:777,firstsync:300,open:900,school_seen:17};
const BUNDLE={ok:true,settings:{},lmsHosts:[],rooms:null,ops:{version:22,cronAt:Date.now(),purge:{at:Date.now()-3600e3,errs:2,reports:0,tutor_ip:0,usage:0,tutor_use:0,students:1}},cloud:{},problems:[],errs:[],today:{},errToday:0,
  since:dayOff(89),totals:G,allTime:G,firstDay:dayOff(40),todayKey:today,days:{[dayOff(3)]:{install:377,open:450}},
  schools:[{host:'canvas.asu.edu',seen:24,firstsync:9,back_d7:14,fin_ontime:48,fin_late:12,open:true}],school:null,schoolMin:10};
const KEY='test-key';
(async()=>{
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable');
  const errs=[]; ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.method==='Runtime.exceptionThrown') errs.push(String((m.params.exceptionDetails.exception||{}).description||'').slice(0,240));});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:`
    try{ if(!sessionStorage.getItem('seeded')){ localStorage.clear(); localStorage.setItem('duenorth_v1',JSON.stringify({onboarded:1,capacity:{weekday:3,weekend:3},adminKey:${JSON.stringify(KEY)}})); sessionStorage.setItem('seeded','1'); } }catch(_){}
    window.__admin=[]; const B=${JSON.stringify(BUNDLE)}, SCH=${JSON.stringify(SCH)}, REP=${JSON.stringify(REP)}; const of=window.fetch;
    window.fetch=function(u,o){ const s=String(u);
      if(/[/]admin[?]/.test(s)){ window.__admin.push({url:s, key:((o||{}).headers||{})['x-lmk-key']||''}); const m=s.match(/[?&]school=([^&]+)/); const b=JSON.parse(JSON.stringify(B));
        b.school = m && decodeURIComponent(m[1])==='canvas.asu.edu' ? (/days=365/.test(s) ? REP : SCH) : null;
        return Promise.resolve(new Response(JSON.stringify(b),{status:200,headers:{'content-type':'application/json'}})); }
      return of.apply(this, arguments); };`});
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:1200,height:1000,deviceScaleFactor:1,mobile:false});
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(150);
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/#admin='+KEY}); await sleep(3000);

  /* ---- 1. the model, cell by cell ---- */
  const M=JSON.parse(await ev(ws,`JSON.stringify(reportModel(${JSON.stringify(REP)}))`));
  const T=(r,k)=>(r==='total'?M.total:M.rows[r].c)[k].text;
  check('three months, the first from its first day, the last to today', M.rows.map(r=>r.label).join(' | ')==='Aug 2026 (from Aug 20) | Sep 2026 | Oct 2026 (to Oct 15)', M.rows.map(r=>r.label));
  check('the floor is the first day anything but a device count arrived', M.floorDay==='2026-09-03' && M.floorText==='September 3, 2026', [M.floorDay,M.floorText]);
  check('a count from 1 to 9 prints as "fewer than 10"', T(0,'school_seen')==='fewer than 10' && T(1,'school_seen')==='fewer than 10' && T(1,'back_d7')==='fewer than 10' && T(2,'fin_ontime')==='fewer than 10');
  check('a month before the floor says "not counted" for everything but devices, never a 0', T(0,'open')==='not counted' && T(0,'back_d7')==='not counted' && T(0,'fin_ontime')==='not counted' && T(0,'fin_late')==='not counted' && T(0,'avg')==='—' && T(0,'share')==='—', M.rows[0].c);
  check('zero and 10 or more print exactly', T(1,'open')==='150' && T(2,'school_seen')==='12' && T(2,'back_d7')==='11' && T(2,'fin_late')==='0' && T(1,'fin_ontime')==='40' && T(1,'fin_late')==='12');
  check('devices a day: over the days counted from the floor (Sep 3–30 is 28 days), none before it', T(0,'avg')==='—' && T(1,'avg')==='5.4' && T(2,'avg')==='6.0', [T(0,'avg'),T(1,'avg'),T(2,'avg')]);
  check('a share prints only when both of its counts print exactly', T(1,'share')==='77%' && T(2,'share')==='—' && T('total','share')==='—', [T(1,'share'),T(2,'share'),T('total','share')]);
  check('a total with a hidden month prints as "more than" the printed months', T('total','school_seen')==='more than 12' && T('total','back_d7')==='more than 11' && T('total','fin_ontime')==='more than 40', [T('total','school_seen'),T('total','back_d7'),T('total','fin_ontime')]);
  check('a total with nothing hidden prints exactly, with its average', T('total','open')==='240' && T('total','fin_late')==='12' && T('total','avg')==='5.6', [T('total','open'),T('total','avg')]);
  /* the floor is the day the tenth device arrived, not the first day another word happened to be sent */
  const F=JSON.parse(await ev(ws,`JSON.stringify(reportModel({host:'x.edu',since:'2025-10-16',todayKey:'2026-10-15',min:10,allTime:{school_seen:11},days:{'2026-09-01':{school_seen:6},'2026-09-04':{school_seen:5},'2026-09-06':{open:12}}}))`));
  check('the floor day is when the device count reached 10 (Sep 4), and devices a day counts from it', F.floorDay==='2026-09-04' && F.rows[0].c.avg.text===(12/27).toFixed(1), [F.floorDay, F.rows[0].c.avg.text]);
  const E=JSON.parse(await ev(ws,`JSON.stringify(reportModel({host:'x.edu',since:'2025-10-16',todayKey:'2026-10-15',min:10,allTime:{school_seen:40},days:{'2026-09-01':{school_seen:3,open:20}}}))`));
  const Eh=await ev(ws,`reportHtml(reportModel({host:'x.edu',since:'2025-10-16',todayKey:'2026-10-15',min:10,allTime:{school_seen:40},days:{'2026-09-01':{school_seen:3,open:20}}}))`);
  check('a school past the floor before the window counts every month, and says so', E.floorEarly===true && E.rows[0].c.open.text==='20' && /reached that before this report's period began/.test(Eh), [E.floorEarly, E.rows[0].c.open]);
  /* the rule itself, for any input: never an exact total over a hidden month, never a lone 1–9 in a count column */
  const cols=['school_seen','open','back_d7','fin_ontime','fin_late'];
  const leaks=[]; const rnd=await ev(ws,`(()=>{ const out=[]; let seed=7; const r=()=>(seed=(seed*16807)%2147483647)/2147483647;
    for(let i=0;i<300;i++){ const days={}; for(let d=0;d<40;d++){ const k=new Date(Date.UTC(2026,7,1)+Math.floor(r()*76)*864e5).toISOString().slice(0,10); days[k]=days[k]||{}; for(const e of ${JSON.stringify(cols)}) if(r()<.4) days[k][e]=(days[k][e]||0)+Math.floor(r()*r()*14); }
      out.push(reportModel({host:'x.edu',since:'2025-10-16',todayKey:'2026-10-15',days})); } return JSON.stringify(out); })()`);
  for(const m of JSON.parse(rnd)) for(const c of cols){
    const hid=m.rows.some(r=>r.c[c].n===null);
    if(hid && m.total[c].n!==null) leaks.push(['exact total over a hidden month',c,m.total[c].text]);
    for(const r of [...m.rows.map(x=>x.c),m.total]) if(/^[1-9]$/.test(r[c].text)) leaks.push(['a lone small count',c,r[c].text]);
    for(const r of [...m.rows.map(x=>x.c),m.total]) if(r.share.n!==null && (r.fin_ontime.n===null||r.fin_late.n===null)) leaks.push(['a share from a hidden count']);
    for(const r of [...m.rows.map(x=>x.c),m.total]) if(r.avg.n!==null && r.open.n===null) leaks.push(['an average from a hidden count']);
  }
  check('300 random schools: no exact total over a hidden month, no lone 1–9, no share or average from a hidden count', leaks.length===0, leaks.slice(0,4));

  /* ---- 2. the two files ---- */
  const csv=await ev(ws,`reportCsv(reportModel(${JSON.stringify(REP)}))`);
  const L=csv.trim().split('\r\n');
  check('the CSV: a header, one line a month, the whole period', L.length===5 && /^Month,Devices that started,Days opened,Devices a day,Came back a week later,Finished on time,Finished late,Share on time$/.test(L[0]) && /^Whole period,more than 12,240,5\.6,more than 11,more than 40,12,—$/.test(L[4]), L);
  check('the CSV quotes a label with a comma or a bracket safely', /^"?Aug 2026 \(from Aug 20\)"?,fewer than 10,not counted,—/.test(L[1]), L[1]);
  const html=await ev(ws,`reportHtml(reportModel(${JSON.stringify(REP)}))`);
  check('the page is self-contained: no script, no stylesheet link, nothing loaded from anywhere', !/<script|<link|\ssrc=|url\(|@import/i.test(html), (html.match(/<script|<link|\ssrc=|url\(|@import/i)||[])[0]);
  check('the page names its unit and its rule up front', /Counted in <b>devices<\/b>, not students/.test(html) && /print as <b>fewer than 10<\/b>/.test(html) && /<title>LMK at canvas\.asu\.edu: usage report<\/title>/.test(html));
  check('the page says when the school\'s own counts began', /At canvas\.asu\.edu that was on September 3, 2026/.test(html));
  check('the page defines every column', ['Devices that started','Days opened','Devices a day','Came back a week later','Finished on time','Finished late','Share on time'].every(c=>html.includes('<dt>'+c+'</dt>')));
  check('the page never calls a count students', !/[0-9] students|students that|students who started/i.test(html.replace(/<[^>]+>/g,'')));
  if(SHOTS){ fs.writeFileSync(SHOTS+'/report.html',html); fs.writeFileSync(SHOTS+'/report.csv',csv); }

  /* ---- 3. the button, driven ---- */
  await ev(ws,`(()=>{const b=[...document.querySelectorAll('[data-tab]')].find(x=>x.dataset.tab==='admin');if(b)b.click();return !!b})()`); await sleep(1200);
  await ev(ws,`ADMIN.tab='growth'; ADMIN.school=''; render(); 1`); await sleep(400);
  await ev(ws,`document.querySelector('[data-act="adm-school"][data-school="canvas.asu.edu"]').click(); 1`); await sleep(900);
  const view=await ev(ws,`((document.getElementById('view-admin')||{}).innerText||'').replace(/\\s+/g,' ')`);
  check('one school\'s Growth view offers the report', /Report for the school/.test(view) && /Download report/.test(view) && /Download spreadsheet/.test(view), view.slice(-600));
  check('All schools does not (a report is for one school)', await ev(ws,`(()=>{ ADMIN.school=''; render(); const has=!!document.querySelector('[data-act="adm-report"]'); ADMIN.school='canvas.asu.edu'; render(); return !has; })()`));
  await ev(ws,`window.__saved=[]; window.saveText=(text,name,type)=>window.__saved.push({text,name,type}); 1`);
  await ev(ws,`document.querySelector('[data-act="adm-report"][data-fmt="html"]').click(); 1`); await sleep(900);
  await ev(ws,`document.querySelector('[data-act="adm-report"][data-fmt="csv"]').click(); 1`); await sleep(900);
  const saved=JSON.parse(await ev(ws,`JSON.stringify(window.__saved)`)), calls=JSON.parse(await ev(ws,`JSON.stringify(window.__admin)`));
  const rep=calls.filter(c=>/days=365/.test(c.url));
  check('each button asks the worker for twelve months of that school, key in a header and never in the URL', rep.length===2 && rep.every(c=>/school=canvas\.asu\.edu/.test(c.url) && c.key===KEY && !c.url.includes(KEY)), calls);
  check('the page downloads as LMK-<school>-report-<day>.html with the model\'s table', saved[0] && saved[0].name==='LMK-canvas.asu.edu-report-2026-10-15.html' && saved[0].type==='text/html' && saved[0].text===html, saved[0] && saved[0].name);
  check('the spreadsheet downloads as .csv with the same cells', saved[1] && saved[1].name==='LMK-canvas.asu.edu-report-2026-10-15.csv' && saved[1].text===csv, saved[1] && saved[1].name);
  check('the buttons come back after a download', await ev(ws,`!document.querySelector('[data-act="adm-report"][disabled]') && ADMIN.reporting===''`));
  if(SHOTS){ await ev(ws,`document.querySelector('[data-act="adm-report"]').scrollIntoView({block:'center'}); 1`); await sleep(300); const r=await send(ws,'Page.captureScreenshot',{format:'png'}); fs.writeFileSync(SHOTS+'/report-card.png',Buffer.from(r.data,'base64')); }

  /* the claude.ai copy cannot save a file (its viewer blocks downloads): no button that silently does nothing */
  const noSave=await ev(ws,`(()=>{ const keep=window.canSave, n=window.__saved.length; window.canSave=()=>false; render();
    const card=[...document.querySelectorAll('.adm-card')].find(c=>/Report for the school/.test(c.innerText)); const txt=card?card.innerText.replace(/\\s+/g,' '):'';
    const btns=document.querySelectorAll('[data-act="adm-report"]').length; adminReport('html'); const saved=window.__saved.length-n; window.canSave=keep; render();
    return JSON.stringify({txt,btns,saved}); })()`);
  const NS=JSON.parse(noSave);
  check('where files cannot be saved, the card says so and offers no button', NS.btns===0 && /can't save files/.test(NS.txt) && /lmktoday\.app/.test(NS.txt) && NS.saved===0, NS);
  await sleep(300);

  /* ---- 4. the Ops tab shows the daily cleanup (worker v22) ---- */
  await ev(ws,`ADMIN.tab='ops'; render(); 1`); await sleep(400);
  const ops=await ev(ws,`((document.getElementById('view-admin')||{}).innerText||'').replace(/\\s+/g,' ')`);
  check('Ops shows the daily data cleanup and what it removed', /Data cleanup/i.test(ops) && /last removed 1 sync copy, 2 crash rows, 0 reports/.test(ops), ops.slice(0,500));
  check('Ops describes the cron that really runs', /Cloudflare's cron, every 3 min/.test(ops) && !/GitHub Actions tick, every 5 min/.test(ops));
  await ev(ws,`ADMIN.data.ops.purge={at:Date.now()-3*864e5,errs:0,reports:0,tutor_ip:0,usage:0,tutor_use:0,students:"err"}; render(); 1`); await sleep(300);
  const ops2=await ev(ws,`((document.getElementById('view-admin')||{}).innerText||'').replace(/\\s+/g,' ')`);
  await ev(ws,`ADMIN.tab='overview'; render(); 1`); await sleep(300);
  const ov=await ev(ws,`((document.getElementById('view-admin')||{}).innerText||'').replace(/\\s+/g,' ')`);
  check('a failed cleanup step is called out on the tile and under Needs attention', /a step failed: students/.test(ops2) && /Data cleanup failed on: students\. Privacy\.html promises/.test(ov), [ops2.slice(0,300), ov.slice(ov.indexOf('Needs attention'), ov.indexOf('Needs attention')+300)]);
  check('no uncaught error', errs.length===0, errs);
  ws.close(); try{execSync('curl -s http://localhost:9333/json/close/'+t.id)}catch(_){}
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.message);process.exit(2)});

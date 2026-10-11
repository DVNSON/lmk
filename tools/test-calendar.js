/* Your calendar (v73.0): the plan fits around the student's own calendar, and the study time lands on it.
   C1 the iCal reader on its own: a weekly class (BYDAY, UNTIL), an EXDATE, a moved instance (RECURRENCE-ID), a TZID in
      another zone, DURATION, all-day and "free" events that must never block.
   C2 a calendar LINK (Apple/Outlook path) through /cal/fetch: tomorrow busy 8 AM–9 PM caps tomorrow's plan to the 2 h
      left and puts the work at 9 PM or later; rows carry a time; Today says how much is free.
   C3 GOOGLE: one tap (GIS stubbed), freeBusy on "primary" only, an "LMK" calendar created, study blocks and exams
      upserted with deterministic ids, a stale LMK event deleted, a foreign event left alone; off = no writes.
   C4 disconnect: the plan uses study hours again, times disappear; the card goes back to the two buttons.
   Google and the worker are stubbed in the page: no request leaves the machine.
   Run: node test-calendar.js   (needs :8899 serving ~/lmk-web and headless Chrome on :9333) */
const {execSync}=require('child_process'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text);return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,500)));ok?pass++:fail++;};
const DAY=864e5;
const pad=n=>String(n).padStart(2,'0'), ymd=d=>`${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
const tomorrow=new Date(Date.now()+DAY), t2=new Date(Date.now()+2*DAY);
/* tomorrow: busy 8:00–21:00 (floating local time) */
const ICS=['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:work','DTSTART:'+ymd(tomorrow)+'T080000','DTEND:'+ymd(tomorrow)+'T210000','SUMMARY:Shift','END:VEVENT',
  'BEGIN:VEVENT','UID:allday','DTSTART;VALUE=DATE:'+ymd(t2),'DTEND;VALUE=DATE:'+ymd(new Date(Date.now()+3*DAY)),'SUMMARY:Holiday','END:VEVENT','END:VCALENDAR'].join('\r\n');
function payload(){ const items={}; let n=9700; const at=(d,h=23,m=59)=>{const t=new Date(Date.now()+d*DAY); t.setHours(h,m,0,0); return t.toISOString();};
  const add=(c,cid,t,d,pts)=>{const aid=String(n++); items[aid]={t,c,cid,due:at(d),pts,grp:'g'+cid,st:'online_quiz',k:'',sub:'',subAt:'',score:null,url:`https://canvas.asu.edu/courses/${cid}/assignments/${aid}`};};
  add('ENG 102','102','Essay draft',2,50); add('ENG 102','102','Reading response',1,10); add('STAT 120','120','Homework 7',2,20); add('STAT 120','120','Homework 8',3,20);
  add('PSY 101','1010','Exam 2 (Ch. 5 and 6)',5,100);
  return {lmk:'canvas',v:3,at:Date.now(),host:'canvas.asu.edu',items,groups:{'102':[{id:'g102',name:'Work',w:100}],'120':[{id:'g120',name:'Work',w:100}],'1010':[{id:'g1010',name:'Exams',w:100}]},
    courses:[['102','ENG 102'],['120','STAT 120'],['1010','PSY 101']].map(([id,tag])=>({id,tag,name:tag,uuid:'u'+id+'x'.repeat(30),wt:true,cur:null,fin:null}))}; }
/* the page's network: the worker's config and /cal/fetch, and Google's Calendar API, all answered here and logged */
const STUB=`(function(){
  const J=(o,s)=>new Response(JSON.stringify(o),{status:s||200,headers:{"content-type":"application/json"}});
  window.__net=[]; window.__g={cal:false, events:[{id:"lmkstale1",summary:"LMK · old"},{id:"partyAbc",summary:"Birthday"}]};
  window.fetch=async(u,o)=>{ u=String(u); const m=(o&&o.method)||"GET"; let b=null; try{b=o&&o.body?JSON.parse(o.body):null}catch(_){}
    window.__net.push({u,m,b});
    if (/\\/config$/.test(u)) return J({ok:true,rooms:{on:false},push:{key:''}});
    if (/\\/cal\\/fetch$/.test(u)) return new Response(${JSON.stringify(ICS)},{status:200,headers:{"content-type":"text/calendar"}});
    if (/calendar\\/v3\\/calendars\\/primary\\/events/.test(u)) { const t=new Date(Date.now()+864e5); t.setHours(8,0,0,0); const e=new Date(t); e.setHours(21,0,0,0); const a=new Date(Date.now()+864e5); a.setHours(22,0,0,0);
      return J({items:[{summary:"Work shift",start:{dateTime:t.toISOString()},end:{dateTime:e.toISOString()}},{summary:"Gym (free)",transparency:"transparent",start:{dateTime:a.toISOString()},end:{dateTime:new Date(+a+36e5).toISOString()}},{summary:"Birthday",start:{date:"2026-01-01"},end:{date:"2026-01-02"}},{summary:"Cancelled thing",status:"cancelled",start:{dateTime:a.toISOString()},end:{dateTime:new Date(+a+36e5).toISOString()}}]}); }
    if (/calendar\\/v3\\/calendars$/.test(u) && m==="POST") { window.__g.cal=true; return J({id:"lmkcal123@group.calendar.google.com"}); }
    if (/calendar\\/v3\\/calendars\\/[^/]+$/.test(u)) return window.__g.cal ? J({id:"lmkcal123@group.calendar.google.com"}) : J({},404);
    if (/\\/events\\?/.test(u)) return J({items:window.__g.events});
    if (/\\/events\\/[^/?]+$/.test(u) && m==="PUT") return J({},404);
    if (/\\/events$/.test(u) && m==="POST") return J(b);
    if (/\\/events\\/[^/?]+$/.test(u) && m==="DELETE") return new Response(null,{status:204});
    return J({ok:false});
  };
  window.google={accounts:{oauth2:{initTokenClient:cfg=>{ window.__scope=cfg.scope; const tc={callback:cfg.callback,requestAccessToken(){ setTimeout(()=>tc.callback({access_token:"tok123",expires_in:3600}),10); }}; return tc; }}}};
  try{ localStorage.setItem("lmk_gcid","test-client.apps.googleusercontent.com"); }catch(_){}
})()`;
async function open(mobile){
  const SEED={onboarded:1, profile:{name:"Sam"}, capacity:{weekday:4, weekend:4}, ext:null};
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable'); await send(ws,'Page.bringToFront');
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:mobile?390:1100,height:1000,deviceScaleFactor:1,mobile:!!mobile});
  if (mobile) await send(ws,'Emulation.setUserAgentOverride',{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:STUB});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:`try{if(!sessionStorage.getItem('__s')){localStorage.clear();localStorage.setItem('lmk_gcid','test-client.apps.googleusercontent.com');if(!/nogcal/.test(location.search))localStorage.setItem('lmk_gcal_test','1');localStorage.setItem('duenorth_v1',${JSON.stringify(JSON.stringify(SEED))});sessionStorage.setItem('__s','1')}}catch(_){}`});
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(120); await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(2600);
  await ev(ws,`window.postMessage({lmk:'ext-hello',version:'0.9.3'},'*'); window.postMessage({lmk:'canvas-payload',payload:${JSON.stringify(payload())}},'*'); 1`); await sleep(2000);
  await ev(ws,`welcomeOverlay.classList.remove('open'); courseFilter=null; render(); 1`); await sleep(300);
  return {ws, close:()=>{ws.close(); try{execSync('curl -s http://localhost:9333/json/close/'+t.id)}catch(_){}}};
}
const tk=`dayKey(addDays(startOfDay(now()),1))`;
(async()=>{
  let P=await open(false), ws=P.ws;
  /* C1 the reader */
  const r1=JSON.parse(await ev(ws,`JSON.stringify((()=>{
    const p=n=>String(n).padStart(2,'0'), mon=(()=>{const d=startOfDay(now()); d.setDate(d.getDate()+((8-d.getDay())%7||7)); return d;})(), f=d=>d.getFullYear()+p(d.getMonth()+1)+p(d.getDate());
    const wed=addDays(mon,2), fri=addDays(mon,4), mon2=addDays(mon,8), wed2=addDays(mon,10);   // a Tuesday and a Thursday: the MWF class is never on them, so nothing merges with what is being checked
    const ics=['BEGIN:VCALENDAR',
      'BEGIN:VEVENT','UID:cls','DTSTART:'+f(mon)+'T103000','DTEND:'+f(mon)+'T112000','RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL='+f(addDays(mon,11))+'T235959Z','EXDATE:'+f(wed)+'T103000','END:VEVENT',
      'BEGIN:VEVENT','UID:cls','RECURRENCE-ID:'+f(fri)+'T103000','DTSTART:'+f(fri)+'T140000','DTEND:'+f(fri)+'T145000','END:VEVENT',
      'BEGIN:VEVENT','UID:ny','DTSTART;TZID=America/New_York:'+f(mon2)+'T120000','DURATION:PT1H','END:VEVENT',
      'BEGIN:VEVENT','UID:hol','DTSTART;VALUE=DATE:'+f(wed2),'DTEND;VALUE=DATE:'+f(addDays(wed2,1)),'END:VEVENT',
      'BEGIN:VEVENT','UID:free','DTSTART:'+f(wed2)+'T090000','DTEND:'+f(wed2)+'T100000','TRANSP:TRANSPARENT','END:VEVENT','END:VCALENDAR'].join('\\r\\n');
    const b=calParseIcs(ics, mon.getTime(), addDays(mon,14).getTime());
    const at=d=>b.filter(x=>dayKey(new Date(x.s))===dayKey(d)).map(x=>new Date(x.s).getHours()+':'+p(new Date(x.s).getMinutes())+'-'+new Date(x.e).getHours()+':'+p(new Date(x.e).getMinutes()));
    const ny=b.find(x=>dayKey(new Date(x.s))===dayKey(mon2) && (x.e-x.s)===36e5);
    const nyExpect=(()=>{ const g=Date.UTC(mon2.getFullYear(),mon2.getMonth(),mon2.getDate(),12,0,0); return g - tzOffsetMin('America/New_York', g)*6e4; })();
    return {mon:at(mon), wed:at(wed), fri:at(fri), mon2:at(mon2).length, wed2:at(wed2), ny:ny?ny.s===nyExpect:false};
  })())`));
  check('C1 a weekly class repeats on its days, an EXDATE skips one, a moved instance lands at its new time', r1.mon.join()==='10:30-11:20' && r1.wed.length===0 && r1.fri.join()==='14:00-14:50', r1);
  check('C1 a TZID in another zone converts to the right instant (DURATION form); all-day and "free" events never block', r1.ny && r1.wed2.length===0, r1);
  /* C2 a calendar link */
  await ev(ws,`document.getElementById('gearBtn').click(); 1`); await sleep(400);
  let card=await ev(ws,`document.getElementById('setupMyCal').innerText.replace(/\\s+/g,' ')`);
  check('C2 the card offers Google and "Apple, Outlook or another", nothing else', /Your calendar/.test(card) && /Connect Google Calendar/.test(card) && /Apple, Outlook or another/.test(card), card);
  await ev(ws,`document.querySelector('[data-cal="other"]').click(); document.getElementById('myCalUrl').value='webcal://p42-caldav.icloud.com/published/2/abc'; document.getElementById('myCalUse').click(); 1`); await sleep(1200);
  let r=JSON.parse(await ev(ws,`JSON.stringify({cal:store.cal, busy:(CAL.busy||[]).length, req:__net.filter(x=>/cal\\/fetch/.test(x.u)).map(x=>x.b), cap:PLAN[${tk}].cap, full:PLAN[${tk}].capFull, items:PLAN[${tk}].items.map(c=>{const t=PLAN_TIME.get(c); return t?t.s:null}), card:document.getElementById('setupMyCal').innerText.replace(/\\s+/g,' ')})`));
  check('C2 the link (webcal:// made https://) goes through /cal/fetch; store.cal says "ics"', r.cal && r.cal.src==='ics' && r.req.length && r.req[0].url==='https://p42-caldav.icloud.com/published/2/abc' && r.busy>=1, r);
  check('C2 tomorrow\'s plan holds no more than the 2 h left after a shift until 9 PM (budget 4 h)', r.cap===120 && r.full===240, {cap:r.cap, full:r.full});
  check('C2 every planned thing tomorrow gets a time at 9 PM or later', r.items.length>0 && r.items.every(s=>s!==null && s>=21*60), r.items);
  const dl=await ev(ws,`(()=>{const d=PLAN[${tk}]; const h=dayListHtml(d.items,d,startOfDay(now())); const div=document.createElement('div'); div.innerHTML=h; return [...div.querySelectorAll('.item')].map(x=>(x.classList.contains('calev')?'CAL:':'LMK:')+x.querySelector('.t').textContent.trim()).join(' | ')})()`);
  check('C2 your day is one list in time order: the 8 AM shift from your calendar, then LMK\'s work after 9 PM', /^CAL:Shift \| LMK:/.test(dl), dl);
  check('C2 the card says it is connected and that your events are in your plan', /Connected: your calendar link/.test(r.card) && /Your events are in your plan/.test(r.card) && /Disconnect/.test(r.card), r.card);
  await ev(ws,`document.getElementById('overlay').classList.remove('open'); document.querySelector('[data-tab="plan"]').click(); 1`); await sleep(600);
  const tags=await ev(ws,`[...document.querySelectorAll('#view-plan .timetag, #view-now .timetag')].map(t=>t.textContent).join('|')`);
  await ev(ws,`document.querySelector('[data-tab="now"]').click(); 1`); await sleep(500);
  const line=await ev(ws,`(document.querySelector('#view-now .budget')||{}).innerText||''`);
  check('C2 no "free time" line anywhere (people don\'t need an app to tell them when they\'re free)', !/free today|free time/i.test(line), line);
  // your day: tomorrow's own event sits in the Plan tab line, by time
  await ev(ws,`document.querySelector('[data-tab="plan"]').click(); 1`); await sleep(500);
  const cl=await ev(ws,`[...document.querySelectorAll('#view-plan .calline')].map(x=>x.innerText).join(' | ')`);
  check('C2 the Plan tab shows the day\'s own events as one quiet line with their times', /8:00\s?AM/i.test(cl), cl);
  await ev(ws,`document.querySelector('[data-tab="now"]').click(); 1`); await sleep(300);
  /* C4 disconnect */
  await ev(ws,`calDisconnect(); 1`); await sleep(400);
  r=JSON.parse(await ev(ws,`JSON.stringify({cal:store.cal, cap:PLAN[${tk}].cap, times:PLAN_TIME.size, card:(renderMyCal(), document.getElementById('setupMyCal').innerText.replace(/\\s+/g,' '))})`));
  check('C4 disconnect: store.cal is {src:null} (so it travels), the plan uses the 4 h budget again, no times, the two buttons are back', r.cal && r.cal.src===null && r.cap===240 && r.times===0 && /Connect Google Calendar/.test(r.card), r);
  P.close();
  /* C3 Google */
  P=await open(false); ws=P.ws;
  await ev(ws,`document.getElementById('gearBtn').click(); 1`); await sleep(300);
  await ev(ws,`document.querySelector('[data-cal="google"]').click(); 1`); await sleep(6500);
  r=JSON.parse(await ev(ws,`JSON.stringify({cal:store.cal, scope:window.__scope, fb:__net.filter(x=>/calendars\\/primary\\/events/.test(x.u)).map(x=>x.u), ev:CAL.busy, created:__net.filter(x=>/calendars$/.test(x.u)&&x.m==='POST').map(x=>x.b.summary), puts:__net.filter(x=>x.m==='PUT').map(x=>x.u.split('/').pop()), posts:__net.filter(x=>/\\/events$/.test(x.u)&&x.m==='POST').map(x=>x.b), dels:__net.filter(x=>x.m==='DELETE').map(x=>x.u.split('/').pop()), cap:PLAN[${tk}].cap})`));
  check('C3 one tap asks Google to read events and manage LMK\'s own calendar only (events.readonly + app.created), nothing broader', /calendar\.events\.readonly/.test(r.scope) && /calendar\.app\.created/.test(r.scope) && !/auth\/calendar(\s|$)|calendar\.readonly|calendar\.events(\s|$)/.test(r.scope), r.scope);
  check('C3 events come from "primary" only; "free", cancelled and all-day ones are dropped; tomorrow is capped to 2 h', r.fb.length && r.fb.every(u=>/calendars\/primary\/events/.test(u)) && r.ev.length===1 && r.ev[0].t==='Work shift' && r.cap===120, {fb:r.fb, ev:r.ev, cap:r.cap});
  check('C3 an "LMK" calendar is created once and its id kept in store.cal (write on by default)', r.created.length===1 && r.created[0]==='LMK' && r.cal.src==='google' && r.cal.write===true && /lmkcal123/.test(r.cal.calId), {created:r.created, cal:r.cal});
  check('C3 study blocks and the exam are written with deterministic ids ("lmk…"), a PUT first then a POST when new', r.puts.length && r.puts.every(id=>/^lmk[0-9a-v]+$/.test(id)) && r.posts.length===r.puts.length && r.posts.some(p=>/PSY 101 · Exam 2/.test(p.summary)) && r.posts.some(p=>/^LMK · /.test(p.summary) && p.start.dateTime), {puts:r.puts.length, posts:r.posts.map(p=>p.summary)});
  check('C3 a stale LMK event is deleted and the student\'s own event is never touched', r.dels.includes('lmkstale1') && !r.dels.includes('partyAbc'), r.dels);
  const desc=await ev(ws,`(__net.filter(x=>/\\/events$/.test(x.u)&&x.m==='POST').map(x=>x.b).find(b=>/^LMK/.test(b.summary))||{}).description||''`);
  check('C3 a block\'s description lists what is in it on separate lines (real newlines, not "\\\\n")', /\n/.test(desc) && !/\\n/.test(desc), desc);
  // the same plan written again costs nothing; with writing off, nothing is written
  await ev(ws,`__net.length=0; calWrite(false); 1`); await sleep(1500);
  const again=JSON.parse(await ev(ws,`JSON.stringify(__net.filter(x=>/googleapis/.test(x.u)).length)`));
  check('C3 an unchanged plan is not rewritten', again===0, again);
  await ev(ws,`(()=>{const b=document.querySelector('[data-cal="write"]'); b.checked=false; b.dispatchEvent(new Event('change',{bubbles:true}));})(); __net.length=0; CAL.lastSig=''; calWrite(true); 1`); await sleep(1500);
  const off=JSON.parse(await ev(ws,`JSON.stringify({w:store.cal.write, n:__net.filter(x=>/googleapis/.test(x.u)).length})`));
  check('C3 "Put my study time on my calendar" off: nothing is written', off.w===false && off.n===0, off);
  P.close();
  /* until Google approves the scope, an ordinary student sees one "Connect your calendar" button, no Google one */
  P=await open(false); ws=P.ws;
  await ev(ws,`localStorage.removeItem('lmk_gcal_test'); calDisconnect(); store.cal=null; renderMyCal(); 1`); await sleep(300);
  const plain=await ev(ws,`document.getElementById('myCalActs').innerText`);
  await ev(ws,`location.hash='gcaltest'; renderMyCal(); 1`); await sleep(200);
  const tester=await ev(ws,`document.getElementById('myCalActs').innerText`);
  check('C6 before Google\'s approval: a student sees only "Connect your calendar"; #gcaltest (test users, the review video) brings the Google button back', !/Google/.test(plain) && /Connect your calendar/.test(plain) && /Connect Google Calendar/.test(tester), {plain, tester});
  P.close();
  /* phone */
  P=await open(true); ws=P.ws;
  await ev(ws,`document.getElementById('gearBtn').click(); 1`); await sleep(400);
  const ph=JSON.parse(await ev(ws,`JSON.stringify((()=>{const W=innerWidth; const box=document.getElementById('setupMyCal'); return {W, vis:!box.hidden, over:[box,...box.querySelectorAll('*')].filter(e=>{const b=e.getBoundingClientRect(); return b.width && (b.right>W+1)}).map(e=>e.id||e.className||e.tagName).slice(0,5)}})())`));
  check('C5 on a 390px phone the calendar card fits', ph.vis && ph.over.length===0, ph);
  P.close();
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.stack||e.message);process.exit(2)});

/* The term GPA (v70.5): one number from the per-course standing the grade pills already show, never presented as a
   fact. Four classes with Canvas current scores of 95 / 88 / 72 and one with no grade; the standard 4.0 scale on an
   instructure.com host and ASU's (A+ 4.33, no C-/D+) on canvas.asu.edu; credits editable in the sheet, 0 = not
   counted; the recap shows it only behind the grades tap. Run: node test-gpa.js (needs :8899 and Chrome :9333) */
const {execSync}=require('child_process'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text);return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,300)));ok?pass++:fail++;};
const SEED={onboarded:1, profile:{name:"Emiel"}, ext:null};
const COURSES=[['101','ASU Ready',95],['210','MAT 210',88],['211','ECN 211',72],['265','FMS 265',null]];
const payload=host=>{ const items={}, now=Date.now(); let n=9000;
  for (const [cid,tag] of COURSES){ const aid=String(n++); items[aid]={t:`${tag} homework`,c:tag,cid,due:new Date(now+3*864e5).toISOString(),pts:10,grp:'g'+cid,st:'online_upload',k:'',sub:'',subAt:'',score:null,url:`https://${host}/courses/${cid}/assignments/${aid}`,desc:'',rub:'',fb:''}; }
  return {lmk:'canvas',v:3,at:now,host,items,groups:{},courses:COURSES.map(([id,tag,cur])=>({id,tag,name:tag+': a class',uuid:'u'+id+'x'.repeat(30),wt:false,cur,fin:cur}))}; };
const STUB=`(function(){const J=o=>new Response(JSON.stringify(o),{status:200,headers:{"content-type":"application/json"}}); window.fetch=async(u,o)=>/\\/config$/.test(String(u))?J({ok:true,rooms:{on:true,days:0},plus:{tiers:{}}}):J({ok:false});})()`;
async function open(host, mobile){
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable');
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:mobile?500:1100,height:1000,deviceScaleFactor:1,mobile});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:STUB});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:`try{localStorage.clear();localStorage.setItem('duenorth_v1',${JSON.stringify(JSON.stringify(SEED))});}catch(_){}`});
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(120); await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(2600);
  await ev(ws,`window.postMessage({lmk:'ext-hello',version:'0.8.9'},'*'); window.postMessage({lmk:'canvas-payload',payload:${JSON.stringify(payload(host))}},'*'); 1`); await sleep(2000);
  await ev(ws,`welcomeOverlay.classList.remove('open'); 1`);
  return {ws, close:()=>{ws.close(); execSync('curl -s http://localhost:9333/json/close/'+t.id);}};
}
const strip=ws=>ev(ws,`JSON.stringify({pill:(document.querySelector('.gstrip [data-act="gpa"]')||{}).textContent||'', first:(document.querySelector('.gstrip .gpill')||{}).dataset?.act||'', note:(document.querySelector('.gstrip .gnote')||{}).textContent||''})`).then(JSON.parse);
const sheet=ws=>ev(ws,`document.getElementById('detailModal').innerText.replace(/\\s+/g,' ')`);
(async()=>{
  /* standard scale */
  let P=await open('school.instructure.com', false); let r=await strip(P.ws);
  check('G1 the GPA pill is the first thing in the Grades strip and reads 2.50 on the standard scale (B+ 3.3, C- 1.7; ASU Ready is not counted by default, one class has no grade)', r.first==='gpa' && /GPA\s*2\.50/.test(r.pill) && /estimate/.test(r.note), r);
  await ev(P.ws,`document.querySelector('.gstrip [data-act="gpa"]').click(); 1`); await sleep(300); let t=await sheet(P.ws);
  check('G2 the sheet says estimate, names the standard scale, lists each class with letter and points, and says which class has no grade', /Term GPA 2\.50 estimate/.test(t) && /standard 4\.0 scale/.test(t) && /ASU Ready · 95% A\+? 4\.00 not counted/.test(t) && /MAT 210 · 88% B\+ 3\.30/.test(t) && /ECN 211 · 72% C- 1\.70/.test(t) && /No grade yet, so not counted: FMS 265/.test(t) && /never sent anywhere, never on the recap card/.test(t), t.slice(0,500));
  await ev(P.ws,`(()=>{const s=document.querySelector('[data-act="gpa-credits"][data-course="ASU Ready"]'); s.value='3'; s.dispatchEvent(new Event('change',{bubbles:true}));})(); 1`); await sleep(300); t=await sheet(P.ws); r=await strip(P.ws);
  check('G3 ASU Ready is "not counted" by default (ASU\'s zero-credit orientation); counting it in at 3 cr adds its A: (4 + 3.3 + 1.7) / 3 = 3.00 in the sheet, the pill and the store', /Term GPA 3\.00/.test(t) && /GPA\s*3\.00/.test(r.pill) && (await ev(P.ws,`(store.credits||{})["ASU Ready"]`))===3, {t:t.slice(0,80), r});
  await ev(P.ws,`(()=>{const s=document.querySelector('[data-act="gpa-credits"][data-course="ASU Ready"]'); s.value='0'; s.dispatchEvent(new Event('change',{bubbles:true}));})(); 1`); await sleep(300);
  await ev(P.ws,`(()=>{const s=document.querySelector('[data-act="gpa-credits"][data-course="MAT 210"]'); s.value='4'; s.dispatchEvent(new Event('change',{bubbles:true}));})(); 1`); await sleep(300); t=await sheet(P.ws);
  check('G4 credits weight it: MAT 210 at 4 cr, ECN 211 at 3 → (13.2 + 5.1) / 7 = 2.61, divided by 7 credits', /Term GPA 2\.61/.test(t) && /divided by 7 credits/.test(t), t.slice(0,120));
  await ev(P.ws,`document.getElementById('ddClose').click(); openWrapped('semester'); WR.grades=true; renderWrapped(); 1`); await sleep(400);
  const rc=await ev(P.ws,`JSON.stringify({card:(document.querySelector('.wr[data-card="grades"]')||{innerText:''}).innerText.replace(/\\s+/g,' '), canvas:(()=>{const c=document.getElementById('wrCanvas'); return !!c;})()})`).then(JSON.parse);
  check('G5 the recap shows the term GPA only behind the grades tap, marked as an estimate', /term GPA 2\.61/.test(rc.card) && /estimate/.test(rc.card), rc.card.slice(0,200));
  const src=require('fs').readFileSync(require('os').homedir()+'/lmk-web/app/index.html','utf8');
  check('G6 the share card never draws the GPA (drawWrappedCard has no gpa call)', !/function drawWrappedCard[\s\S]*?\n}\n/.exec(src)[0].includes('gpa'), null);
  P.close();
  /* ASU's scale */
  P=await open('canvas.asu.edu', true); r=await strip(P.ws);
  await ev(P.ws,`document.querySelector('.gstrip [data-act="gpa"]').click(); 1`); await sleep(300); t=await sheet(P.ws);
  check('G7 on canvas.asu.edu the sheet uses ASU\'s scale — B+ 3.33, C- counted as C (2.00), ASU Ready not counted — and reads 2.67', /GPA\s*2\.67/.test(r.pill) && /ASU's scale/.test(t) && /MAT 210 · 88% B\+ 3\.33/.test(t) && /ECN 211 · 72% C- 2\.00/.test(t), {r, t:t.slice(0,300)});
  check('G8 phone: the strip still starts with the pill and nothing spills past the screen', r.first==='gpa' && (await ev(P.ws,`document.documentElement.scrollWidth<=innerWidth`)), r);
  P.close();
  /* no grades at all → no pill */
  P=await open('school.instructure.com', false); await ev(P.ws,`store.ext.courses.forEach(c=>{c.cur=null;c.fin=null}); GRADES=null; render(); 1`); await sleep(300); r=await strip(P.ws);
  check('G9 with no graded class there is no GPA pill and no strip', r.pill==='' && r.first==='', r);
  P.close();
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.stack||e.message);process.exit(2)});

/* Accessibility, measured (v71.1). An audit before the university pitch found the sheets never managed focus, the
   recap could not scroll above 800px, muted text and the gradient buttons failed contrast, Mark done dropped focus on
   <body>, the toast's button stayed tabbable after it faded, focus scrolled under the phone's bars, labels clipped at
   320px, and five animations looped forever. This drives the PUBLIC build at localhost:8899/app/ and checks each one:
   - axe-core 4.10.2 (wcag2a, wcag2aa, wcag21a, wcag21aa) reports zero violations on first run, the sample semester,
     Today, Plan, Semester, the settings sheet, the room sheet, Study, the recap and the welcome, light and dark,
     desktop 1100 and phone 390 (iPhone UA). axe cannot judge text over a gradient, so G-checks sample every stop.
     No known exceptions since v71.2: pinch zoom is on, so axe's `meta-viewport` (1.4.4) is counted like everything else.
   - every sheet moves focus inside on open, makes the page behind inert, keeps Tab inside for 20 presses, closes on
     Escape and hands focus back to the control that opened it.
   - the recap scrolls at 1280x720; focus stays on a row after Mark done; a hidden toast's buttons are not focusable;
     no tab stop hides under the phone's header or bottom bar; nothing loops past 5 s; labels wrap at 320px.
   Run: node test-a11y.js   (needs :8899 serving ~/lmk-web and headless Chrome on :9333; axe comes from $AXE or is
   fetched once from cdnjs into the temp dir). Spawns the stand-in worker (loop-worker.js) on :8902 for the room sheet. */
const {execSync, spawn}=require('child_process'); const fs=require('fs'); const os=require('os'); const path=require('path'); let id=0;
const send=(ws,m,p={})=>new Promise((r,j)=>{const mid=++id;const to=setTimeout(()=>j(new Error('CDP '+m+' did not answer in 45 s')),45000);const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){clearTimeout(to);ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text);return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,600)));ok?pass++:fail++;};
const PORT=+process.env.LOOP_PORT||8902, CDP='http://localhost:9333', APP='http://localhost:8899/app/';
const IPHONE="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const MAC="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const AXE_VER='4.10.2';
const ONLY=(process.env.A11Y_ONLY||'').split(',').filter(Boolean), want=k=>!ONLY.length||ONLY.includes(k);   // A11Y_ONLY=F,M runs those sections only
const KNOWN={};   // was {'meta-viewport': the pinch-zoom lock} until v71.2 turned zoom on; add an entry only for an owner's decision
function axeSource(){
  const p=process.env.AXE||path.join(os.tmpdir(),`axe-${AXE_VER}.min.js`);
  if(!fs.existsSync(p)) execSync(`curl -sfL -o "${p}" https://cdnjs.cloudflare.com/ajax/libs/axe-core/${AXE_VER}/axe.min.js`);
  const s=fs.readFileSync(p,'utf8'); if(!s.includes('axe v'+AXE_VER)) throw new Error(`${p} is not axe ${AXE_VER}`); return s;
}
const HOST='canvas.asu.edu';
const COURSES=[['105','CIS 105'],['210','MAT 210'],['1010','PSY 101'],['1011','WPC 101']];
const payload=()=>{ const items={}, now=Date.now(); let n=9000;
  for (const [cid,tag] of COURSES) for (let k=0;k<4;k++){ const aid=String(n++); const due=new Date(now+(k===0?0.2:k*4-1)*864e5).toISOString();
    items[aid]={t:(cid==='210'&&k===2)?`${tag} Midterm exam 1`:`${tag} problem set ${k+1} with a reasonably long title that wraps`,c:tag,cid,due,pts:10,grp:'g'+cid,st:'online_upload',k:'',sub:'',subAt:'',score:null,url:`https://${HOST}/courses/${cid}/assignments/${aid}`,desc:'Read chapter 3 and answer the questions.',rub:'',fb:''}; }
  return {lmk:'canvas',v:3,at:now,host:HOST,items,groups:Object.fromEntries(COURSES.map(([cid])=>[cid,[{id:'g'+cid,name:'Homework',w:100}]])),courses:COURSES.map(([id,tag])=>({id,tag,name:tag+': a class',uuid:'u'+id+'x'.repeat(30),wt:false,cur:88,fin:40}))}; };
const SEED={onboarded:1, profile:{name:"Emiel"}, cloud:{sid:'a1b2c3d4'+'e'.repeat(24), secret:'s'.repeat(40), on:true, at:1}, ext:null, roomName:'Emiel'};
const STUB=`(function(){const real=window.fetch; window.fetch=(u,o)=>real(String(u).replace('https://lmk-api.emieldieuvenson.workers.dev','http://localhost:${PORT}'),o);})()`;

let Wk=null;   // the stand-in worker; killed on every exit, a crash included, so the next run does not find it on the port
/* ---- page-side helpers, injected as source ---- */
function pageHelpers(){
  const parse=s=>{ s=String(s||'').trim(); let m=s.match(/^rgba?\(([^)]+)\)$/); if(m){const p=m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0],p[1],p[2],p.length>3?p[3]:1];}
    m=s.match(/^color\(srgb ([^)]+)\)$/); if(m){const p=m[1].split(/[ /]+/).filter(Boolean).map(Number); return [p[0]*255,p[1]*255,p[2]*255,p.length>3?p[3]:1];} return null; };
  const lin=c=>{c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4)};
  const lum=c=>0.2126*lin(c[0])+0.7152*lin(c[1])+0.0722*lin(c[2]);
  const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
  const over=(top,bot)=>{const a=top[3];return [top[0]*a+bot[0]*(1-a),top[1]*a+bot[1]*(1-a),top[2]*a+bot[2]*(1-a),1]};
  /* the solid colour behind an element: its ancestors' background-colours composited, ignoring images */
  const bgOf=el=>{ const layers=[]; for(let e=el;e;e=e.parentElement){ const c=parse(getComputedStyle(e).backgroundColor); if(c&&c[3]>0){layers.push(c); if(c[3]>=1) break;} }
    let col=parse(getComputedStyle(document.body).backgroundColor)||[255,255,255,1]; for(let i=layers.length-1;i>=0;i--) col=over(layers[i],col); return col; };
  const vis=el=>{ if(!el||!el.isConnected) return false; if(el.closest('[inert],[aria-hidden="true"]')) return false; const cs=getComputedStyle(el); if(cs.visibility==='hidden'||cs.display==='none'||+cs.opacity===0) return false; const r=el.getBoundingClientRect(); return r.width>0&&r.height>0; };
  const stops=img=>{ const out=[]; const re=/(rgba?\([^)]+\)|color\(srgb [^)]+\))/g; let m; while((m=re.exec(img))) out.push(parse(m[1])); return out.filter(Boolean); };
  const sample=st=>{ const pts=[]; for(let i=0;i<st.length-1;i++) for(let k=0;k<=10;k++){const t=k/10; pts.push([0,1,2].map(j=>st[i][j]+(st[i+1][j]-st[i][j])*t).concat(1));} return pts.length?pts:st; };
  const large=el=>{const cs=getComputedStyle(el), px=parseFloat(cs.fontSize), w=+cs.fontWeight||400; return px>=24||(px>=18.66&&w>=700)};
  const name=el=>el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(el.classList.length?'.'+[...el.classList].slice(0,3).join('.'):'')+' "'+(el.textContent||'').trim().slice(0,24)+'"';
  window.__a11y={parse,ratio,bgOf,vis,
    /* text on a gradient fill, and gradient-clipped text: every point of the gradient against the other colour */
    grad(){ const bad=[];
      for(const el of document.querySelectorAll('body *')){ if(!vis(el)) continue; const cs=getComputedStyle(el); if(!/gradient/.test(cs.backgroundImage)) continue;
        const own=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()); if(!own) continue;
        if(el.closest('[role="img"]')) continue;   // a logo has no contrast requirement (1.4.3)
        const need=large(el)?3:4.5, pts=sample(stops(cs.backgroundImage)); if(!pts.length) continue;
        const clip=/text/.test(cs.webkitBackgroundClip||'')||/text/.test(cs.backgroundClip||'');
        const other=clip?bgOf(el.parentElement):parse(cs.color);
        const worst=Math.min(...pts.map(p=>ratio(p,other)));
        if(worst<need) bad.push({el:name(el),clip,worst:+worst.toFixed(2),need});
      } return bad; },
    /* 1.4.11: the unchecked check ring and the edges of text inputs against what is around them */
    edges(){ const bad=[]; const sel='.item:not(.done) .cbx, input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), textarea, select';
      for(const el of document.querySelectorAll(sel)){ if(!vis(el)) continue; const b=parse(getComputedStyle(el).borderTopColor); if(!b||getComputedStyle(el).borderTopStyle==='none') { bad.push({el:name(el),why:'no border'}); continue; }
        const around=bgOf(el.parentElement), r=ratio(over(b,around),around); if(r<3) bad.push({el:name(el),ratio:+r.toFixed(2)}); }
      return bad; },
  };
}

(async()=>{
  const AXE=axeSource();
  let busy=false; try{ execSync(`curl -sf localhost:${PORT}/__state`,{stdio:'pipe'}); busy=true; }catch(_){}
  if(busy){ console.log(`HARNESS ERROR: something already answers on :${PORT} — a stale loop worker? kill it (or set LOOP_PORT) and rerun`); process.exit(2); }
  Wk=spawn(process.execPath,[__dirname+'/loop-worker.js'],{env:Object.assign({},process.env,{PORT:String(PORT)}),stdio:'ignore'});
  for(let i=0;i<40;i++){ try{ execSync(`curl -sf localhost:${PORT}/__state`,{stdio:'pipe'}); break; }catch(_){ await sleep(100); } }
  const errs=[]; let t=null, ws=null;
  /* A tab of our own; the pointer sections (R, W) start a new one so nothing earlier in the run can leave it stuck. */
  const openTab=async()=>{
    if(ws){ try{ ws.close(); execSync(`curl -s ${CDP}/json/close/`+t.id,{stdio:'pipe'}); }catch(_){} }
    t=JSON.parse(execSync(`curl -s ${CDP}/json/new -X PUT`).toString());
    ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
    ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.method==='Runtime.exceptionThrown') errs.push(String((m.params.exceptionDetails.exception||{}).description||m.params.exceptionDetails.text||'').slice(0,200));});
    await send(ws,'Page.enable'); await send(ws,'Runtime.enable'); await send(ws,'Network.enable'); await send(ws,'Network.setCacheDisabled',{cacheDisabled:true});
    await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:STUB}); await send(ws,'Page.bringToFront');
  };
  await openTab();
  const done=()=>{ try{Wk.kill()}catch(_){}; try{ ws.close(); execSync(`curl -s ${CDP}/json/close/`+t.id,{stdio:'pipe'}); }catch(_){} };
  const key=async(k,mod=0)=>{ const m={Tab:[9,'Tab'],Escape:[27,'Escape'],Enter:[13,'Enter']}[k]; const base={key:k,code:m[1],windowsVirtualKeyCode:m[0],nativeVirtualKeyCode:m[0],modifiers:mod};
    await send(ws,'Input.dispatchKeyEvent',Object.assign({type:'keyDown'},base,k==='Enter'?{text:'\r'}:{})); await send(ws,'Input.dispatchKeyEvent',Object.assign({type:'keyUp'},base)); };
  const helpers=async()=>{ await ev(ws,`(${pageHelpers.toString()})(); typeof axe==='undefined' ? 0 : 1`).then(async has=>{ if(!has) await send(ws,'Runtime.evaluate',{expression:AXE}); }); };
  async function fresh({seed=SEED,mobile=false,dark=false,w,h,data=true,hash=''}={}){
    /* A fresh profile's Chrome can open chrome://settings/help by itself; our tab then sits in the background, its
       animations and transitions stop advancing and pointer events never answer. Every state starts in front. */
    await send(ws,'Page.bringToFront');
    await send(ws,'Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:dark?'dark':'light'},{name:'prefers-reduced-motion',value:'no-preference'}]});
    await send(ws,'Emulation.setDeviceMetricsOverride',{width:w||(mobile?390:1100),height:h||(mobile?844:900),deviceScaleFactor:mobile?2:1,mobile});
    await send(ws,'Emulation.setUserAgentOverride',{userAgent:mobile?IPHONE:MAC});
    await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(150);
    await send(ws,'Page.navigate',{url:APP}); await sleep(500);
    for(let i=0;i<40 && !(await ev(ws,`location.href.startsWith('http')`).catch(()=>false));i++) await sleep(150);   // a cold first load can outlast 500 ms
    await ev(ws,`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('duenorth_v1', ${JSON.stringify(JSON.stringify(seed))}); navigator.serviceWorker && navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())); 1`);
    await send(ws,'Page.navigate',{url:APP+hash}); await sleep(2600);
    if(data) for(let i=0;i<4;i++){   // the extension's two messages, re-sent until the plan is in (a slow boot can miss the first)
      await ev(ws,`window.postMessage({lmk:'ext-hello',version:'0.9.1'},'*'); window.postMessage({lmk:'canvas-payload',payload:${JSON.stringify(payload())}},'*'); 1`); await sleep(1800);
      if(await ev(ws,`!!(store.ext && EVENTS.length)`)) break; }
    await helpers();
  }
  const axeRun=async label=>{
    await sleep(1300);   // past the entrance animations: a half-faded row is not a contrast failure
    const v=JSON.parse(await ev(ws,`axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}).then(r=>JSON.stringify(r.violations.map(v=>({id:v.id,impact:v.impact,n:v.nodes.length,nodes:v.nodes.slice(0,${process.env.A11Y_DUMP?60:3}).map(n=>({t:n.target.join(' '),s:(n.failureSummary||'').replace(/\\s+/g,' ').slice(0,150)}))}))))`));
    const known=v.filter(x=>KNOWN[x.id]).map(x=>x.id), real=v.filter(x=>!KNOWN[x.id]);
    if(process.env.A11Y_DUMP && real.length) fs.appendFileSync(process.env.A11Y_DUMP, JSON.stringify({label, real})+'\n');   // the full list, when 600 characters of a FAIL line are not enough
    check(`A ${label}: zero WCAG 2.1 AA violations${known.length?' (known exception: '+known.join(', ')+')':''}`, real.length===0, real);
    const g=JSON.parse(await ev(ws,`JSON.stringify(__a11y.grad())`));
    check(`G ${label}: text on the gradient fill and gradient-clipped headings pass at every stop`, g.length===0, g);
    const e=JSON.parse(await ev(ws,`JSON.stringify(__a11y.edges())`));
    check(`N ${label}: check rings and input edges reach 3:1 (1.4.11)`, e.length===0, e);
  };

  const hideToast=()=>ev(ws,`document.getElementById('toast').classList.remove('show'); 1`);

  /* ===== A: axe on every view, light and dark, desktop and phone ===== */
  if (want('A')) for (const dark of [false,true]) for (const mobile of [false,true]) {
    const tag=`${dark?'dark':'light'} ${mobile?'phone 390':'desktop 1100'}`, nav=mobile?'bottombar':'topnav';
    await fresh({seed:{onboarded:0},data:false,mobile,dark});
    await axeRun(`${tag} · first run, nothing synced`);
    const sample=await ev(ws,`(function(){ const b=document.querySelector('[data-act="try-sample"]'); if(!b) return false; b.click(); return true; })()`); await sleep(900);
    await hideToast();
    if (sample) await axeRun(`${tag} · the sample semester`); else check(`A ${tag} · the first-run card offers the sample semester`, false, 'no [data-act="try-sample"]');
    await fresh({mobile,dark});
    await ev(ws,`welcomeOverlay.classList.remove('open'); window.scrollTo(0,0); 1`);
    await axeRun(`${tag} · Today with data`);
    for (const tab of ['plan','semester']) { await ev(ws,`document.querySelector('nav.${nav} [data-tab="${tab}"]').click(); 1`); await axeRun(`${tag} · ${tab[0].toUpperCase()+tab.slice(1)}`); }
    await ev(ws,`document.querySelector('nav.${nav} [data-tab="now"]').click(); document.getElementById('gearBtn').click(); 1`);
    await axeRun(`${tag} · the settings sheet`);
    await ev(ws,`overlay.classList.remove('open'); openDetail(EVENTS.find(e=>!e.isCourse).id); 1`);
    await axeRun(`${tag} · an assignment's detail sheet`);
    await ev(ws,`detailOverlay.classList.remove('open'); openRoom('210'); 1`); await sleep(900);
    await axeRun(`${tag} · the room sheet`);
    await ev(ws,`closeRoom(); openStudy(EVENTS.find(e=>!e.isCourse).id, {fromHistory:true}); 1`);
    await axeRun(`${tag} · the Study screen`);
    await ev(ws,`closeStudy({fromHistory:true}); openWrapped('semester'); 1`);
    await axeRun(`${tag} · the recap`);
    await ev(ws,`closeWrapped(); openWelcome(); 1`);
    await axeRun(`${tag} · the welcome`);
  }

  /* ===== F: focus management, every sheet ===== */
  if (want('F')) {
  await fresh({});
  await ev(ws,`welcomeOverlay.classList.remove('open'); window.scrollTo(0,0); 1`); await sleep(400);
  const SHEETS=[
    ['settings', '#gearBtn', 'overlay', null],
    ['find', '#findBtn', 'findOverlay', null],
    ['add your own', '#addBtn', 'addOverlay', null],
    ['assignment detail (Enter on a title)', '#view-now .item .t[data-act="detail"]', 'detailOverlay', 'Enter'],
    ['room', '#view-now [data-act="room-open"]', 'roomOverlay', null],
    ['recap info', '#view-now [data-act="recap-info"]', 'recapOverlay', null],
    ['Study', '#view-now [data-act="study"]', 'studyPage', null],
    ['recap page (opened from the recap-info sheet)', '#view-now [data-act="recap-info"]', 'recapPage', 'via:#recapOverlay [data-act="recap-open"]'],
    ['welcome (opened from settings)', '#gearBtn', 'welcomeOverlay', 'via:#setupGuide'],
  ];
  const isOpen=layer=>`(function(){const L=document.getElementById('${layer}'); return L.classList.contains('overlay')?L.classList.contains('open'):!L.hidden})()`;
  for (const [label, trig, layer, how] of SHEETS) {
    await hideToast(); await ev(ws,`window.scrollTo(0,0); 1`);
    const found=await ev(ws,`(function(){ const b=document.querySelector(${JSON.stringify(trig)}); if(!b) return false; b.focus(); window.__trig=b; window.__trigKey=b.id?'#'+b.id:'[data-act="'+b.dataset.act+'"]'; return document.activeElement===b; })()`);
    if(!found){ check(`F ${label}: a real trigger exists and takes focus`, false, trig); continue; }
    if(how==='Enter') await key('Enter'); else await ev(ws,`window.__trig.click(); 1`);
    await sleep(500);
    if(how && how.startsWith('via:')){ await ev(ws,`(function(){ const b=document.querySelector(${JSON.stringify(how.slice(4))}); b.focus(); b.click(); })(); 1`); await sleep(600); }
    const st=JSON.parse(await ev(ws,`JSON.stringify((function(){ const L=document.getElementById('${layer}'); const a=document.activeElement; return {open:${isOpen(layer)}, inside:!!(a&&a!==document.body&&L.contains(a)), active:a?(a.id||a.className||a.tagName):null, inert:document.querySelector('.wrap').inert && document.querySelector('nav.bottombar').inert}; })())`));
    check(`F ${label}: opening moves focus into the sheet and makes the page behind inert`, st.open && st.inside && st.inert, st);
    let out=[];
    for(let i=0;i<20;i++){ await key('Tab', i%5===4?8:0); const r=await ev(ws,`(function(){ const L=document.getElementById('${layer}'), a=document.activeElement; return L.contains(a)&&a!==L ? '' : (a?(a.id||a.className||a.tagName):'none'); })()`); if(r) out.push(i+':'+r); }
    check(`F ${label}: 20 presses of Tab / Shift+Tab never leave the sheet`, out.length===0, out.slice(0,6));
    await key('Escape'); await sleep(700);
    const cl=JSON.parse(await ev(ws,`JSON.stringify((function(){ const a=document.activeElement; const back=a===window.__trig || (!window.__trig.isConnected && a && a.matches(window.__trigKey)); return {open:${isOpen(layer)}, back, active:a?(a.id||a.className||a.tagName):null, inert:!!document.querySelector('[inert]')}; })())`));
    check(`F ${label}: Escape closes it, focus returns to its trigger, nothing is left inert`, !cl.open && cl.back && !cl.inert, cl);
    await ev(ws,`document.querySelectorAll('.overlay.open').forEach(o=>o.classList.remove('open')); if(!studyPage.hidden) closeStudy({fromHistory:true}); if(!recapPage.hidden) closeWrapped(); 1`); await sleep(300);
  }
  // sheets opened with no trigger at all: the first sync (welcomeAfterSync -> maybeWelcome -> openWelcome), a toast's
  // button, a #study= link at boot. They must open with focus inside, close on Escape, and throw nothing.
  const before=errs.length;
  await ev(ws,`document.activeElement && document.activeElement.blur(); store.onboarded=0; store.profile=null; if (typeof welcomeAfterSync==='function') welcomeAfterSync(); else { welcomed=false; maybeWelcome(); } 1`); await sleep(400);
  const ws1=JSON.parse(await ev(ws,`JSON.stringify({open:welcomeOverlay.classList.contains('open'), inside:welcomeOverlay.contains(document.activeElement), inert:document.querySelector('.wrap').inert})`));
  await key('Escape'); await sleep(500);
  check('F the first sync opens the welcome by itself: focus inside, page inert, Escape closes it, no error', ws1.open && ws1.inside && ws1.inert && !(await ev(ws,`welcomeOverlay.classList.contains('open')`)) && errs.length===before, {ws1, errs:errs.slice(before)});
  await ev(ws,`toast('Open a sheet from here', {label:'Open', fn:()=>openRecapInfo()}); document.querySelector('#toast button').focus(); document.querySelector('#toast button').click(); 1`); await sleep(500);
  const tw=JSON.parse(await ev(ws,`JSON.stringify({open:recapOverlay.classList.contains('open'), inside:recapOverlay.contains(document.activeElement)})`));
  await key('Escape'); await sleep(500);
  check('F a toast\'s button opens a sheet: focus inside, Escape closes it, no error', tw.open && tw.inside && !(await ev(ws,`recapOverlay.classList.contains('open')`)) && errs.length===before, {tw, errs:errs.slice(before)});
  await ev(ws,`location.hash='#study=9001'; location.reload(); 1`); await sleep(3200); await helpers();
  const hs=JSON.parse(await ev(ws,`JSON.stringify({open:!studyPage.hidden, inside:studyPage.contains(document.activeElement), inert:document.querySelector('.wrap').inert})`));
  check('F a #study= link opens the Study screen at boot with focus inside and the page behind inert', hs.open && hs.inside && hs.inert, hs);
  await key('Escape'); await sleep(600);
  check('F … and Escape closes it, leaving nothing inert', JSON.parse(await ev(ws,`JSON.stringify(studyPage.hidden && !document.querySelector('[inert]'))`)), null);
  }

  /* ===== M: Mark done keeps focus on a row; the toast's buttons leave the tab order with it ===== */
  if (want('M')) {
  await fresh({});
  await ev(ws,`welcomeOverlay.classList.remove('open'); window.scrollTo(0,0); 1`); await sleep(300);
  const md=await ev(ws,`(function(){ const b=document.querySelector('#view-now .item:not(.done) .cbx'); if(!b) return null; b.focus(); return b.closest('.item').dataset.id; })()`);
  await key('Enter'); await sleep(1200);
  const mf=JSON.parse(await ev(ws,`JSON.stringify((function(){ const a=document.activeElement; return {tag:a.tagName, cls:a.className, row:a.closest&&a.closest('.item')?a.closest('.item').dataset.id:null, done:!!store.done[${JSON.stringify(md)}]}; })())`));
  check('M Enter on a check ring marks it done and focus stays on a row control, not <body>', mf.done && mf.row && mf.tag!=='BODY', {id:md, ...mf});
  /* Mark done also queues askDuration's own toast (it waits for this one to go), so the check owns the toast: it
     shows one with an action, hides it, and reads the button only while nothing has re-shown the toast. */
  let tb=null, th=null;
  for(let tries=0;tries<4;tries++){
    tb=JSON.parse(await ev(ws,`JSON.stringify((function(){ toast('Marked done.', {label:'Undo', fn(){}}); const t=document.getElementById('toast'), b=t.querySelector('button'); b.focus(); const shown=document.activeElement===b; t.classList.remove('show'); window.__tb=b; return {shown}; })())`));
    await sleep(500);
    th=JSON.parse(await ev(ws,`JSON.stringify((function(){ const t=document.getElementById('toast'), b=window.__tb; const a=document.activeElement; if(t.classList.contains('show')) return {reshown:true}; b.focus(); return {focusable:document.activeElement===b, after:a?(a.className||a.tagName):null}; })())`));
    if(!th.reshown) break; await sleep(1500);
  }
  check('T a toast\'s action button is reachable while it shows and not focusable once the toast hides', tb.shown && th.focusable===false, {tb, th});
  check('T … and focus that was on it goes back to the page, not <body>', th.after && th.after!=='BODY', th);
  await ev(ws,`askDuration(EVENTS.find(e=>!e.isCourse), 30); 1`); await sleep(200);
  await hideToast(); await sleep(500);
  const ad=JSON.parse(await ev(ws,`JSON.stringify((function(){ const bs=[...document.querySelectorAll('#toast button')]; return bs.map(b=>{ b.focus(); return document.activeElement===b; }); })())`));
  check('T askDuration\'s three buttons are not focusable once its toast hides', ad.length===3 && ad.every(x=>x===false), ad);
  }

  /* ===== D: nothing loops past five seconds (2.2.2) ===== */
  if (want('D')) {
  const anim=`JSON.stringify(document.getAnimations().filter(a=>!(a.effect&&a.effect.target&&a.effect.target.closest&&a.effect.target.closest('.gear.spinning'))).map(a=>({n:a.animationName||'?', d:a.effect.getComputedTiming().activeDuration, t:a.effect.target?(a.effect.target.className||a.effect.target.tagName)+'':'' , p:a.effect.pseudoElement||''})).filter(a=>!(a.d<=5000)))`;
  await fresh({seed:Object.assign({},SEED,{streakDays:[new Date().toISOString().slice(0,10)]})});
  await ev(ws,`welcomeOverlay.classList.remove('open'); 1`);
  const lit=await ev(ws,`document.getElementById('streakChip').classList.contains('lit')`);
  check('D Today (streak lit): no animation — blobs, drift, breathe, flicker — runs longer than 5 s', lit && JSON.parse(await ev(ws,anim)).length===0, {lit, a:JSON.parse(await ev(ws,anim))});
  await ev(ws,`document.querySelector('nav.topnav [data-tab="semester"]').click(); 1`); await sleep(300);
  check('D Semester: the heaviest week\'s pulse stops within 5 s', JSON.parse(await ev(ws,anim)).length===0, JSON.parse(await ev(ws,anim)));
  await sleep(5200);
  const still=JSON.parse(await ev(ws,`JSON.stringify(document.getAnimations().filter(a=>a.playState==='running').map(a=>a.animationName))`));
  check('D five seconds later nothing is still moving', still.length===0, still);
  await ev(ws,`render(); render(); 1`); await sleep(300);
  const again=JSON.parse(await ev(ws,`JSON.stringify(document.getAnimations().filter(a=>a.playState==='running').map(a=>a.animationName))`));
  check('D the minute-by-minute render does not start them again', again.length===0, again);
  await fresh({seed:{onboarded:0},data:false});
  check('D first run: the checklist\'s pulse stops within 5 s', JSON.parse(await ev(ws,anim)).length===0, JSON.parse(await ev(ws,anim)));
  }

  /* ===== R: radar weeks say what the colour says, and the tooltip closes on Escape ===== */
  if (want('R')) {
  await openTab(); await fresh({});
  await ev(ws,`welcomeOverlay.classList.remove('open'); document.querySelector('nav.topnav [data-tab="semester"]').click(); 1`); await sleep(900);
  const rad=JSON.parse(await ev(ws,`JSON.stringify({worst:(document.querySelector('.wk.worst .cell')||{}).getAttribute?document.querySelector('.wk.worst .cell').getAttribute('aria-label'):null, exam:[...document.querySelectorAll('.wk .cell')].map(c=>c.getAttribute('aria-label')).filter(l=>/exam/i.test(l))})`));
  check('R the heaviest week\'s cell names itself "heaviest week" and an exam week says "includes an exam"', /heaviest week/i.test(rad.worst||'') && rad.exam.some(l=>/includes an exam/i.test(l)), rad);
  const cell=JSON.parse(await ev(ws,`JSON.stringify((function(){ const c=document.querySelector('.wk .cell'); c.scrollIntoView({block:'center'}); const r=c.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; })())`));
  await send(ws,'Input.dispatchMouseEvent',{type:'mouseMoved',x:cell.x,y:cell.y}); await sleep(200);
  const tipOn=await ev(ws,`document.getElementById('tooltip').style.display`);
  await key('Escape'); await sleep(200);
  await send(ws,'Input.dispatchMouseEvent',{type:'mouseMoved',x:cell.x+1,y:cell.y}); await sleep(200);
  const tipOff=await ev(ws,`document.getElementById('tooltip').style.display`);
  check('R the week tooltip shows on hover and Escape dismisses it (1.4.13), even as the pointer keeps moving', tipOn==='block' && tipOff==='none', {tipOn, tipOff});

  /* ===== S: names, roles, the nav ===== */
  const st=JSON.parse(await ev(ws,`JSON.stringify((function(){ const nm=el=>!el?'missing':(el.getAttribute('aria-label')||(el.getAttribute('aria-labelledby')&&(document.getElementById(el.getAttribute('aria-labelledby'))||{}).textContent)||(el.labels&&el.labels[0]&&el.labels[0].textContent)||'').trim();
    const wm=document.querySelector('.wordmark');
    return {wm:wm.getAttribute('role')+'|'+wm.getAttribute('aria-label'), findQ:nm(document.getElementById('findQ')), wName:nm(document.getElementById('wName')), imp:nm(document.getElementById('impPaste')), ics:nm(document.getElementById('icsPaste')),
      tabs:document.querySelectorAll('nav.topnav [role=tab], nav.bottombar [role=tab], nav.topnav[role=tablist], nav.bottombar[role=tablist]').length, sel:document.querySelectorAll('nav.tabs [aria-selected]').length,
      cur:[...document.querySelectorAll('nav.topnav [aria-current="page"], nav.bottombar [aria-current="page"]')].map(b=>b.dataset.tab)}; })())`));
  check('S the wordmark is role="img" with its name', st.wm.startsWith('img|') && /LMK/.test(st.wm), st.wm);
  check('S the search box, the name box and both paste boxes have accessible names', [st.findQ,st.wName,st.imp,st.ics].every(x=>x && x!=='missing'), st);
  check('S the view switcher is plain buttons: no tab roles, no aria-selected, aria-current="page" on Semester in both navs', st.tabs===0 && st.sel===0 && st.cur.join()==='semester,semester', st);
  await ev(ws,`openStudy(EVENTS.find(e=>!e.isCourse).id, {fromHistory:true}); 1`); await sleep(400);
  const sn=await ev(ws,`(function(){ const t=document.getElementById('spNotes'); return t ? (t.getAttribute('aria-label')||(t.getAttribute('aria-labelledby')&&(document.getElementById(t.getAttribute('aria-labelledby'))||{}).textContent)||'').trim() : 'missing'; })()`);
  check('S the Study notes box has an accessible name', !!sn && sn!=='missing', sn);
  await ev(ws,`closeStudy({fromHistory:true}); 1`);
  }

  /* ===== P: phone: no tab stop under the bars; nothing clipped at 320px, with text spacing, or at 200% text ===== */
  if (want('P')) {
  await fresh({mobile:true});
  await ev(ws,`welcomeOverlay.classList.remove('open'); window.scrollTo(0,0); document.activeElement && document.activeElement.blur(); window.__k=0; 1`); await sleep(400);
  const hid=[]; let seen=0, firstId=null;
  for(let i=0;i<90;i++){ await key('Tab'); await sleep(60);
    const r=JSON.parse(await ev(ws,`JSON.stringify((function(){ const a=document.activeElement; if(!a||a===document.body) return {none:1}; if(!a.__k) a.__k=++window.__k; const hb=document.querySelector('header.top').getBoundingClientRect().bottom, bt=document.querySelector('nav.bottombar').getBoundingClientRect().top; const r=a.getBoundingClientRect();
      const inBars=!!a.closest('header.top, nav.bottombar'); return {k:a.__k, el:(a.dataset.act||a.id||a.tagName)+' '+(a.textContent||'').trim().slice(0,16), top:Math.round(r.top), bottom:Math.round(r.bottom), hb:Math.round(hb), bt:Math.round(bt), hidden: !inBars && (r.top < hb - 1 || r.bottom > bt + 1)}; })())`));
    if(r.none) continue; if(firstId===null) firstId=r.k; else if(r.k===firstId) break; seen++;
    if(r.hidden) hid.push(r); }
  check(`P 390px phone: none of the ${seen} tab stops on Today is hidden under the sticky header or the bottom bar`, seen>15 && hid.length===0, hid.slice(0,5));
  await fresh({mobile:true,w:320,h:640});
  await ev(ws,`welcomeOverlay.classList.remove('open'); window.scrollTo(0,0); 1`); await sleep(400);
  const clipQ=`JSON.stringify((function(){ const tl=document.getElementById('todayLine'); const due=[...document.querySelectorAll('#view-now .duelbl')].filter(d=>d.getBoundingClientRect().width>0).map(d=>{ const p=d.closest('.sub')||d.parentElement; return {w:d.scrollWidth-d.clientWidth, out:Math.round(d.getBoundingClientRect().right-p.getBoundingClientRect().right)}; }).filter(x=>x.w>1||x.out>1);
    return {today:{sw:tl.scrollWidth, cw:tl.clientWidth, ell:getComputedStyle(tl).textOverflow}, due, vw:document.documentElement.scrollWidth}; })())`;
  let c=JSON.parse(await ev(ws,clipQ));
  check('C 320px: the date line and every due label wrap instead of clipping, and the page does not scroll sideways', c.today.sw<=c.today.cw+1 && c.due.length===0 && c.vw<=320, c);
  await ev(ws,`(function(){ const s=document.createElement('style'); s.id='spacing'; s.textContent='*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important} p{margin-bottom:2em!important}'; document.head.appendChild(s); })(); 1`); await sleep(400);
  c=JSON.parse(await ev(ws,clipQ));
  check('C 320px with WCAG text spacing (1.4.12): still nothing clipped', c.today.sw<=c.today.cw+1 && c.due.length===0 && c.vw<=320, c);
  await ev(ws,`document.getElementById('spacing').remove(); openWrapped('semester'); 1`); await sleep(700);
  const titleQ=`JSON.stringify((function(){ const t=document.querySelector('#recapPage .sp-title'), b=t.querySelector('b'); return {w:Math.round(t.getBoundingClientRect().width), clipped:b.scrollWidth>b.clientWidth+1, vw:document.documentElement.scrollWidth}; })())`;
  c=JSON.parse(await ev(ws,titleQ));
  check('C 320px: the recap header keeps its title readable (not squeezed, not cut)', c.w>=150 && !c.clipped, c);
  /* 200% text the way a phone's text-size setting does it: every font size doubled, the layout width unchanged */
  const dbl=`(function(){ const els=[...document.querySelectorAll('#recapPage, #recapPage *')]; const px=els.map(e=>parseFloat(getComputedStyle(e).fontSize)); els.forEach((e,i)=>e.style.fontSize=(px[i]*2)+'px'); })(); 1`;
  for (const [w,h,mobile] of [[390,844,true],[1280,720,false]]) {
    await fresh({mobile,w,h});
    await ev(ws,`welcomeOverlay.classList.remove('open'); openWrapped('semester'); 1`); await sleep(700);
    await ev(ws,dbl); await sleep(300);
    c=JSON.parse(await ev(ws,titleQ));
    check(`C 200% text at ${w}px: the recap header keeps its title readable`, c.w>=150 && !c.clipped && c.vw<=w, c);
  }
  }

  /* ===== W: the recap scrolls on a laptop ===== */
  if (want('W')) {
  await openTab(); await fresh({w:1280,h:720});
  await ev(ws,`welcomeOverlay.classList.remove('open'); openWrapped('semester'); 1`); await sleep(900);
  await send(ws,'Input.dispatchMouseEvent',{type:'mouseMoved',x:640,y:420}); await sleep(100);
  await send(ws,'Input.dispatchMouseEvent',{type:'mouseWheel',x:640,y:420,deltaX:0,deltaY:900}); await sleep(700);
  const sc=JSON.parse(await ev(ws,`JSON.stringify((function(){ const p=document.getElementById('recapPage'); const before=p.scrollTop; p.scrollTop=p.scrollHeight; const cards=p.querySelectorAll('.wr'); const last=cards[cards.length-1]; return {wheel:before, oy:getComputedStyle(p).overflowY, h:p.scrollHeight, ch:p.clientHeight, lastBottom:last?Math.round(last.getBoundingClientRect().bottom):null, vh:innerHeight}; })())`));
  check('W 1280x720: the recap is taller than the window, a wheel scrolls it, and its last card can be reached', sc.h>sc.ch && /auto|scroll/.test(sc.oy) && sc.wheel>100 && sc.lastBottom!==null && sc.lastBottom<=sc.vh, sc);
  }

  check('E no page errors during the run', errs.length===0, errs.slice(0,5));
  done();
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.stack||e.message);try{Wk&&Wk.kill()}catch(_){};process.exit(2)});

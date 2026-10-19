/* "Invite a friend" (v74.9), both ends, in a real headless Chrome. The sender: no invite until LMK holds the student's own
   classes; one tap opens the share sheet with lmktoday.app/?from=friend&school=<their school> and a line in their LMS's name,
   or copies it where there is no share sheet; a cancelled share copies nothing; the "All clear" screen offers it; each tap is
   one invite_share. The friend: the homepage says a friend sent it, remembers the door, and hands the school to the app,
   which fills the school step. Mission control: the friend door's row and the invite taps, and no friend link in the list
   of links to hand out. Run: node tools/test-invite.js (needs :8899 serving ~/lmk-web and Chrome :9333). */
const {execSync}=require('child_process'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text);return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,260)));ok?pass++:fail++;};
const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const MAC='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const payload=(o={})=>Object.assign({lmk:'canvas',v:3,at:Date.now(),host:'canvas.asu.edu',groups:{},courses:[{id:'1',tag:'BIO 202',wt:false}],
  items:{'901':{t:'Problem set 1',c:'BIO 202',cid:'1',due:new Date(Date.now()+2*864e5).toISOString(),pts:10,st:'online_upload',grp:'g',k:'',sub:'',score:null}}},o);
const CAPTURE=`window.__hits=[]; window.pingAllowed=()=>true; const __of=window.fetch;
  window.fetch=function(u,o){ if(/[/]hit$/.test(String(u))){ try{ window.__hits.push(JSON.parse(o.body).ev); }catch(_){} return Promise.resolve(new Response('{"ok":true}',{status:200})); } return __of.apply(this,arguments); };
  window.__shared=null; window.__copied=null; 1`;
async function tab(){ const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString()); const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable'); return {ws, close:()=>{ try{ ws.close(); execSync('curl -s http://localhost:9333/json/close/'+t.id,{stdio:'pipe'}); }catch(_){} }}; }
async function app(T,{mobile=false, url='http://localhost:8899/app/', clear=true}={}){
  await send(T.ws,'Emulation.setDeviceMetricsOverride',{width:mobile?500:1100,height:900,deviceScaleFactor:1,mobile});
  await send(T.ws,'Emulation.setUserAgentOverride',{userAgent:mobile?IPHONE:MAC});
  if (clear) { await send(T.ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(300);
    await ev(T.ws,`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('duenorth_v1','{"onboarded":1}'); 1`); }
  await send(T.ws,'Page.navigate',{url:'about:blank'}); await sleep(100);
  await send(T.ws,'Page.navigate',{url}); await sleep(2200);
  await ev(T.ws,CAPTURE);
}
const footer=T=>ev(T.ws,`JSON.stringify((()=>{ const b=document.getElementById('inviteLink'); return {shown: !!b && !b.hidden && !!b.offsetParent, text: b ? b.textContent : ''}; })())`).then(JSON.parse);
(async()=>{
  // 1. the sender
  let T=await tab(); await app(T);
  check('no invite before LMK holds the student\'s own classes', !(await footer(T)).shown, await footer(T));
  await ev(T.ws,`window.postMessage({lmk:'canvas-payload', payload:${JSON.stringify(payload())}}, '*'); 1`); await sleep(900);
  await ev(T.ws,`welcomeOverlay.classList.remove('open'); 1`); await sleep(200);
  let f=await footer(T);
  check('with their classes in, the footer offers "Invite a friend"', f.shown && f.text==='Invite a friend', f);
  await ev(T.ws,`navigator.share=async d=>{ window.__shared=d; }; __hits.length=0; document.getElementById('inviteLink').click(); 1`); await sleep(400);
  let r=JSON.parse(await ev(T.ws,`JSON.stringify({s:__shared, hits:__hits})`));
  check('one tap opens the share sheet with the friend link and their school', r.s && r.s.url==='https://lmktoday.app/?from=friend&school=canvas.asu.edu' && r.s.title==='LMK', r.s);
  check('the line names their LMS, says it is free, and names nobody', r.s && /plan my Canvas work/.test(r.s.text) && /free/.test(r.s.text) && !/Emiel|@/.test(r.s.text), r.s && r.s.text);
  check('each tap is one invite_share', JSON.stringify(r.hits)===JSON.stringify(['invite_share']), r.hits);
  await ev(T.ws,`navigator.share=async d=>{ const e=new Error('cancel'); e.name='AbortError'; throw e; }; navigator.clipboard.writeText=async t=>{ window.__copied=t; }; window.__copied=null; document.getElementById('inviteLink').click(); 1`); await sleep(400);
  check('a share the student cancels copies nothing and says nothing', (await ev(T.ws,`window.__copied`))===null, await ev(T.ws,`window.__copied`));
  await ev(T.ws,`delete navigator.share; Object.defineProperty(navigator,'share',{value:undefined,configurable:true}); document.getElementById('inviteLink').click(); 1`); await sleep(500);
  r=JSON.parse(await ev(T.ws,`JSON.stringify({c:window.__copied, toast:document.getElementById('toast').textContent})`));
  check('no share sheet (most computers): the line and link are copied, and the toast says so', r.c && r.c.endsWith(' https://lmktoday.app/?from=friend&school=canvas.asu.edu') && /Invite copied/.test(r.toast), r);
  T.close();

  // 2. the "All clear" moment, and a Brightspace student's line
  T=await tab(); await app(T);
  await ev(T.ws,`window.postMessage({lmk:'canvas-payload', payload:${JSON.stringify(payload({items:{'902':{t:'Lab 1',c:'BIO 202',cid:'1',due:new Date(Date.now()-864e5).toISOString(),pts:10,st:'online_upload',grp:'g',k:'',sub:'submitted',subAt:new Date(Date.now()-2*864e5).toISOString(),score:null}}}))}}, '*'); 1`); await sleep(1000);
  await ev(T.ws,`welcomeOverlay.classList.remove('open'); render(); 1`); await sleep(300);
  r=JSON.parse(await ev(T.ws,`JSON.stringify({h1:(document.querySelector('section.view .hero h1')||{}).textContent, btn:(document.querySelector('section.view .hero [data-act="invite"]')||{}).textContent||''})`));
  check('"All clear" offers "Send LMK to a friend"', /All clear/.test(r.h1) && r.btn==='Send LMK to a friend', r);
  T.close();
  T=await tab(); await app(T);
  await ev(T.ws,`window.postMessage({lmk:'canvas-payload', payload:${JSON.stringify(payload({lmk:'canvas', lms:'d2l', host:'school.brightspace.com'}))}}, '*'); 1`); await sleep(900);
  await ev(T.ws,`welcomeOverlay.classList.remove('open'); navigator.share=async d=>{ window.__shared=d; }; document.getElementById('inviteLink').click(); 1`); await sleep(400);
  r=JSON.parse(await ev(T.ws,`JSON.stringify(__shared)`));
  check('a Brightspace student\'s invite says Brightspace and carries their school', r && /plan my Brightspace work/.test(r.text) && r.url==='https://lmktoday.app/?from=friend&school=school.brightspace.com', r);
  T.close();

  // 3. the friend: the homepage, then the app
  T=await tab();
  for (const [mobile, label] of [[false,'computer'],[true,'phone']]) {
    await send(T.ws,'Emulation.setDeviceMetricsOverride',{width:mobile?390:1100,height:900,deviceScaleFactor:1,mobile});
    await send(T.ws,'Emulation.setUserAgentOverride',{userAgent:mobile?IPHONE:MAC});
    await send(T.ws,'Page.navigate',{url:'http://localhost:8899/'}); await sleep(300); await ev(T.ws,`localStorage.clear(); 1`);
    await send(T.ws,'Page.navigate',{url:'http://localhost:8899/?from=friend&school=canvas.asu.edu'}); await sleep(900);
    r=JSON.parse(await ev(T.ws,`JSON.stringify({notes:[...document.querySelectorAll('.friendnote')].filter(x=>x.offsetParent).map(x=>x.textContent), from:localStorage.getItem('lmk_from'), link:localStorage.getItem('lmk_school_link'), wide:document.documentElement.scrollWidth})`));
    check(`the friend's homepage on a ${label} says a friend sent it, remembers the door and the school`, r.notes.length===1 && /^A friend sent you LMK/.test(r.notes[0]) && r.from==='friend' && r.link==='canvas.asu.edu' && r.wide <= (mobile?390:1100), r);
  }
  await send(T.ws,'Emulation.setDeviceMetricsOverride',{width:1100,height:900,deviceScaleFactor:1,mobile:false}); await send(T.ws,'Emulation.setUserAgentOverride',{userAgent:MAC});
  await send(T.ws,'Page.navigate',{url:'http://localhost:8899/'}); await sleep(300); await ev(T.ws,`localStorage.clear(); 1`);
  await send(T.ws,'Page.navigate',{url:'http://localhost:8899/?from=chat'}); await sleep(700);
  check('any other door shows no friend note', (await ev(T.ws,`[...document.querySelectorAll('.friendnote')].filter(x=>x.offsetParent).length`))===0);
  await send(T.ws,'Page.navigate',{url:'http://localhost:8899/'}); await sleep(300); await ev(T.ws,`localStorage.clear(); 1`);
  await send(T.ws,'Page.navigate',{url:'http://localhost:8899/?from=friend&school=canvas.asu.edu'}); await sleep(700);
  await send(T.ws,'Page.navigate',{url:'http://localhost:8899/app/'}); await sleep(2200);
  r=JSON.parse(await ev(T.ws,`JSON.stringify({from:channelSaved(), school:localStorage.getItem('lmk_school'), rows:[...document.querySelectorAll('.checks li')].map(li=>li.className+':'+li.textContent.trim())})`));
  check('in the app, the friend\'s door is remembered and their school step is already done', r.from==='friend' && r.school==='canvas.asu.edu' && r.rows.some(x=>/^done:My school is at canvas\.asu\.edu/.test(x)), r);
  T.close();

  // 4. Mission control's door table
  const today=new Date().toISOString().slice(0,10);
  const AT={install:40,firstsync:12,from_friend:5,act_friend:2,back_d7_friend:1,invite_share:9,from_chat:3,act_chat:1};
  const B={ok:true,settings:{},lmsHosts:[],rooms:null,ops:{version:25,cronAt:Date.now()},cloud:{},problems:[],errs:[],today:{},errToday:0,since:today,totals:AT,allTime:AT,firstDay:today,todayKey:today,days:{[today]:{invite_share:4}},schools:[],school:null,schoolMin:10};
  T=await tab();
  await send(T.ws,'Emulation.setDeviceMetricsOverride',{width:1200,height:1000,deviceScaleFactor:1,mobile:false}); await send(T.ws,'Emulation.setUserAgentOverride',{userAgent:MAC});
  await send(T.ws,'Page.addScriptToEvaluateOnNewDocument',{source:`try{ if(!sessionStorage.getItem('seeded')){ localStorage.clear(); localStorage.setItem('duenorth_v1',JSON.stringify({onboarded:1,adminKey:'k'})); sessionStorage.setItem('seeded','1'); } }catch(_){}
    const __B=${JSON.stringify(B)}, __of=window.fetch; window.fetch=function(u,o){ if(/[/]admin[?]/.test(String(u))) return Promise.resolve(new Response(JSON.stringify(__B),{status:200})); return __of.apply(this,arguments); };`});
  await send(T.ws,'Page.navigate',{url:'about:blank'}); await sleep(150); await send(T.ws,'Page.navigate',{url:'http://localhost:8899/app/#admin=k'}); await sleep(3000);
  await ev(T.ws,`(()=>{const b=[...document.querySelectorAll('[data-tab]')].find(x=>x.dataset.tab==='admin'); b&&b.click(); ADMIN.tab='growth'; ADMIN.school=''; render(); return 1})()`); await sleep(1500);
  r=JSON.parse(await ev(T.ws,`JSON.stringify((()=>{ const card=[...document.querySelectorAll('#view-admin .adm-card')].find(c=>/Which door they came through/.test(c.textContent)); if(!card) return {}; const row=[...card.querySelectorAll('tr')].find(tr=>/A friend's invite/.test(tr.textContent));
    return {row: row ? [...row.querySelectorAll('td')].map(td=>td.textContent.trim()) : null, note: (card.textContent.match(/Invites \\(v74\\.9\\):[^.]*\\./)||[''])[0], links: (card.textContent.match(/Links to hand out:.*/)||[''])[0]}; })())`));
  check('the Growth tab\'s door table has the friend row: 5 opened, 2 got it working', r.row && /A friend's invite/.test(r.row[0]) && r.row[1]==='5' && r.row[2]==='2', r.row);
  check('and the invite taps beside it (9 all-time, 4 this week)', /tapped "Invite a friend" 9 times \(4 in the last 7 days\)/.test(r.note), r.note);
  check('the links to hand out never include a friend link', r.links && !/from=friend/.test(r.links) && /from=chat/.test(r.links), r.links);
  T.close();
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.stack||e.message);process.exit(2)});

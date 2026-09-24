/* The invite link, on the two devices it actually lands on. A group-chat link is opened on a PHONE, and
   until v69.9 the phone welcome remembered the invite, fetched the headcount, then said only "start on a
   computer" — five people opened a link, one joined. Run: node join-test.js (needs :8899 and Chrome :9333) */
const {execSync}=require('child_process'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||'');return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,220)));ok?pass++:fail++;};
const IPHONE="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const STUB=`(function(){const J=o=>new Response(JSON.stringify(o),{status:200,headers:{"content-type":"application/json"}});window.fetch=async(u,o)=>/\\/config$/.test(String(u))?J({ok:true,rooms:{on:true,days:14},plus:{tiers:{}}}):/\\/room\\/count$/.test(String(u))?J({ok:true,count:3}):J({ok:false});})()`;
async function open(hash, ua, mobile){
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable');
  if (ua) await send(ws,'Emulation.setUserAgentOverride',{userAgent:ua});
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:mobile?500:1100,height:1000,deviceScaleFactor:1,mobile});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:STUB});
  await send(ws,'Page.addScriptToEvaluateOnNewDocument',{source:`try{localStorage.clear();}catch(_){}`});
  await send(ws,'Page.navigate',{url:'about:blank'}); await sleep(120);
  await send(ws,'Page.navigate',{url:'http://localhost:8899/app/'+hash}); await sleep(3000);
  const text = await ev(ws,`(document.getElementById('welcomeOverlay')||{innerText:''}).innerText.replace(/\\s+/g,' ')`);
  const join = JSON.parse(await ev(ws,`JSON.stringify({code:JOIN.code,cid:JOIN.cid,tag:JOIN.tag,count:JOIN.count})`));
  const hashLeft = await ev(ws,`location.hash`);
  return {ws, text, join, hashLeft};
}
(async()=>{
  const H='#join=canvas.asu.edu.269886.abc123&c=MAT%20210';   // c= is the COURSE; the friend's name is in the chat, never the URL
  const ph = await open(H, IPHONE, true);
  check('PHONE: the invite is remembered', ph.join.code==='abc123' && ph.join.cid==='269886' && ph.join.tag==='MAT 210', ph.join);
  check('PHONE: the headcount was fetched', ph.join.count===3, ph.join.count);
  check('PHONE: the welcome names the ROOM the link is for, with its headcount', /invited to the MAT 210 room — 3 classmates are already in it/.test(ph.text), ph.text.slice(0,300));
  check('PHONE: it never presents the course as a person', !/MAT 210 is (already )?on LMK/.test(ph.text), ph.text.slice(0,300));
  check('PHONE: the computer step says the computer must sign in with Google too', /sign in with Google there\. Then sign in with Google here/.test(ph.text), ph.text.slice(0,400));
  check('PHONE: and says the invite is saved for after the computer step', /invite is saved on this phone/.test(ph.text), ph.text.slice(0,300));
  check('PHONE: the hash is scrubbed from the address bar', ph.hashLeft==='', ph.hashLeft);
  ph.ws.close();
  const lp = await open(H, '', false);
  check('LAPTOP: the welcome names the room too', /invited to the MAT 210 room — 3 classmates are already in it/.test(lp.text), lp.text.slice(0,300));
  lp.ws.close();
  const bad = await open('#join=<script>alert(1)</script>.1.zz&c=<b>x</b>', '', false);
  check('a malformed invite is ignored, not rendered', !bad.join.code && !/alert|<b>/.test(bad.text), bad.join);
  bad.ws.close();
  /* the reward: nothing is for sale, so nothing may promise days of a plan */
  const src = require('fs').readFileSync(require('os').homedir()+'/lmk-web/app/index.html','utf8');
  const promise = src.match(/toast\([^;]*days of LMK Plus/);
  check('no toast promises days of LMK Plus for a referral', !promise, promise && promise[0].slice(0,120));
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.message);process.exit(2)});

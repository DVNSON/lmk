const {execSync}=require('child_process'); const fs=require('fs'); let id=0;
const send=(ws,m,p={})=>new Promise(r=>{const mid=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===mid){ws.removeEventListener('message',h);r(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:mid,method:m,params:p}))});
const ev=(ws,e)=>send(ws,'Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}).then(r=>{if(r&&r.exceptionDetails)throw new Error((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text);return r&&r.result?r.result.value:undefined});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  -> '+String(JSON.stringify(d)).slice(0,220)));ok?pass++:fail++;};
const lum=c=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2])};
const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
const rgb=s=>{const m=String(s).match(/(\d+)[, ]+(\d+)[, ]+(\d+)/);return m?[+m[1],+m[2],+m[3]]:null};
(async()=>{
  const t=JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r));
  await send(ws,'Page.enable'); await send(ws,'Runtime.enable');
  const errs=[]; ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.method==='Runtime.exceptionThrown') errs.push(String((m.params.exceptionDetails.exception||{}).description||'').slice(0,160));});
  await send(ws,'Emulation.setDeviceMetricsOverride',{width:1100,height:900,deviceScaleFactor:2,mobile:false});
  await send(ws,'Page.navigate',{url:'http://localhost:8901/canvas-replica.html'}); await sleep(700);
  await ev(ws, fs.readFileSync('theme-harness.js','utf8'));
  await ev(ws, `window.__apply()`); await sleep(400);
  const get=(sel,prop)=>ev(ws,`(()=>{const e=document.querySelector(${JSON.stringify(sel)});return e?getComputedStyle(e)[${JSON.stringify(prop)}]:null})()`);

  check('no filter is applied to the page at all', (await get('html','filter'))==='none' && (await get('body','filter'))==='none', [await get('html','filter'), await get('body','filter')]);
  const bodyBg=rgb(await get('body','backgroundColor'));
  check('the page is LMK\'s dark background, not an inverted grey', lum(bodyBg)<0.02, bodyBg);
  const cardBg=rgb(await get('.ig-row','backgroundColor'));
  check('a white panel becomes LMK\'s surface #1a1c21', Math.abs(cardBg[0]-26)<6&&Math.abs(cardBg[1]-28)<6&&Math.abs(cardBg[2]-33)<6, cardBg);
  const hdrBg=rgb(await get('.ig-header','backgroundColor'));
  check('a subtle grey becomes LMK\'s second surface #22242a', Math.abs(hdrBg[0]-34)<8&&Math.abs(hdrBg[2]-42)<8, hdrBg);
  const nav=rgb(await get('#header','backgroundColor'));
  check('the global nav sits deeper than the page', lum(nav)<lum(rgb(await get('.ig-row','backgroundColor'))), nav);
  // ASU's brand must survive as maroon, not flip to green
  const link=rgb(await get('#content p a','color'));
  check('ASU maroon stays maroon (red channel leads)', link[0]>link[1]&&link[0]>link[2], link);
  check('and it is legible on the surface behind it', ratio(link,cardBg)>=4.5, {link,cardBg,r:+ratio(link,cardBg).toFixed(2)});
  // the long tail: a plugin the CSS never names
  const lti=rgb(await get('.some-lti-plugin','backgroundColor'));
  check('an unnamed plugin panel still lands on a dark surface', lum(lti)<0.06, lti);
  const ltiFg=rgb(await get('.some-lti-plugin','color'));
  check('and its text is readable there', ratio(ltiFg,lti)>=4.5, {ltiFg,lti,r:+ratio(ltiFg,lti).toFixed(2)});
  // every text/background pair on the page
  const bad = await ev(ws,`(()=>{
    const L=c=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2])};
    const R=(a,b)=>{const x=L(a),y=L(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
    const P=s=>{const m=String(s).match(/(\\d+)[, ]+(\\d+)[, ]+(\\d+)(?:[, ]+([\\d.]+))?/);return m?[+m[1],+m[2],+m[3],m[4]===undefined?1:+m[4]]:null};
    const out=[];
    for(const el of document.querySelectorAll('#content *, #left-side *, #header *')){
      if(![...el.childNodes].some(n=>n.nodeType===3&&n.nodeValue.trim()))continue;
      const cs=getComputedStyle(el); const fg=P(cs.color); if(!fg)continue;
      let bg=null; for(let p=el;p;p=p.parentElement){const c=P(getComputedStyle(p).backgroundColor); if(c&&c[3]>0.55){bg=c;break}}
      if(!bg)continue;
      const r=R(fg,bg); if(r<4.0) out.push({sel:el.tagName.toLowerCase()+'.'+(el.className||''),r:+r.toFixed(2),fg:fg.slice(0,3),bg:bg.slice(0,3)});
    } return out;})()`);
  check(`every text pair on the page is readable (${bad.length} below 4.0)`, bad.length===0, bad.slice(0,4));
  /* the two that slipped through the first pass: a :is() specificity trap greyed the primary button,
     and borders were never mapped, so an unnamed panel kept a hard #ddd outline on a dark page */
  const pbg=rgb(await get('.btn-primary','backgroundColor'));
  check('the primary button keeps ASU maroon, not the secondary grey', pbg[0]>pbg[1]+40&&pbg[0]>pbg[2]+40, pbg);
  check('its label is readable on it', ratio(rgb(await get('.btn-primary','color')),pbg)>=4.5, {r:+ratio(rgb(await get('.btn-primary','color')),pbg).toFixed(2)});
  const pb=rgb(await get('.some-lti-plugin','borderTopColor'));
  check('an unnamed panel\'s light border is brought down to LMK\'s line', lum(pb)<0.05, pb);
  const brights = await ev(ws,`(()=>{const L=c=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2])};
    const P=s=>{const m=String(s).match(/([0-9]+)[, ]+([0-9]+)[, ]+([0-9]+)(?:[, ]+([0-9.]+))?/);return m?[+m[1],+m[2],+m[3],m[4]===undefined?1:+m[4]]:null};
    const out=[];for(const el of document.querySelectorAll('#content *,#left-side *')){const cs=getComputedStyle(el);
      if(cs.borderTopStyle==='none')continue;const c=P(cs.borderTopColor);if(!c||c[3]<0.1)continue;
      const sat=Math.max(c[0],c[1],c[2])-Math.min(c[0],c[1],c[2]);
      if(sat<=40&&L(c)>0.25)out.push(el.tagName.toLowerCase()+'.'+el.className+' '+cs.borderTopColor);}return out})()`);
  check(`no bright grey borders left on the dark page (${brights.length})`, brights.length===0, brights.slice(0,3));
  /* the active nav tab: ASU gives it a near-white pill, and #header is a SIBLING of #wrapper so the
     mapper never walked it — the tab you are standing on had grey text on white. */
  const aBg=rgb(await get('.ic-app-header__menu-list-item--active a','backgroundColor'));
  const aFg=rgb(await get('.ic-app-header__menu-list-item--active .menu-item__text','color'));
  check('the active tab\'s white pill is gone', lum(aBg)<0.12, aBg);
  check('and the tab you are on is readable', ratio(aFg,aBg)>=4.5, {aFg,aBg,r:+ratio(aFg,aBg).toFixed(2)});
  const iFg=rgb(await get('.ic-app-header__menu-list-item:not(.ic-app-header__menu-list-item--active) .menu-item__text','color'));
  const navBg=rgb(await get('#header','backgroundColor'));
  check('an inactive tab is still readable on the nav', ratio(iFg,navBg)>=4.5, {iFg,navBg,r:+ratio(iFg,navBg).toFixed(2)});
  const logo=rgb(await get('.ic-app-header__logomark-container','backgroundColor'));
  check('the logo strip is not a white block', lum(logo)<0.12, logo);
  const navBright = await ev(ws,`(()=>{const L=c=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2])};
    const P=s=>{const m=String(s).match(/([0-9]+)[, ]+([0-9]+)[, ]+([0-9]+)(?:[, ]+([0-9.]+))?/);return m?[+m[1],+m[2],+m[3],m[4]===undefined?1:+m[4]]:null};
    const out=[];for(const el of document.querySelectorAll('#header, #header *')){const c=P(getComputedStyle(el).backgroundColor);
      if(c&&c[3]>0.5&&L(c)>0.3)out.push(el.tagName.toLowerCase()+'.'+el.className+' '+getComputedStyle(el).backgroundColor);}return out})()`);
  check(`nothing in the nav is still a light block (${navBright.length})`, navBright.length===0, navBright.slice(0,3));
  /* the dashboard: nine cards, each a coloured hero over a white body. The hero is the COURSE's colour —
     identity, not chrome — and flattening it would make every card look the same. */
  const hero1=rgb(await get('.ic-DashboardCard .ic-DashboardCard__header_hero','backgroundColor'));
  const hero2=rgb(await get('.ic-DashboardCard:nth-of-type(2) .ic-DashboardCard__header_hero','backgroundColor'));
  check('a course card keeps its own hero colour', hero1.join()==='37,66,132', hero1);
  check('and two courses still look different', hero1.join()!==hero2.join(), [hero1,hero2]);
  const cardBody=rgb(await get('.ic-DashboardCard__header_content','backgroundColor'));
  check('the card body becomes LMK\'s surface', Math.abs(cardBody[0]-26)<6&&Math.abs(cardBody[2]-33)<6, cardBody);
  const cardTitle=rgb(await get('.ic-DashboardCard__header-title','color'));
  check('the course code on the card is readable', ratio(cardTitle,cardBody)>=4.5, {r:+ratio(cardTitle,cardBody).toFixed(2)});
  const sub=rgb(await get('.ic-DashboardCard__header-subtitle','color'));
  check('and so is the subtitle', ratio(sub,cardBody)>=4.5, {sub,cardBody,r:+ratio(sub,cardBody).toFixed(2)});
  /* the assignments list: the chrome AROUND the rows was all still #ffffff */
  const crumbBg=rgb(await get('#breadcrumbs','backgroundColor'));
  check('the breadcrumb bar is not a white strip', lum(crumbBg)<0.06, crumbBg);
  const crumbFg=rgb(await get('#breadcrumbs span','color'));
  check('and its text is readable', ratio(crumbFg,crumbBg)>=4.5, {r:+ratio(crumbFg,crumbBg).toFixed(2)});
  const agBg=rgb(await get('#ag-list','backgroundColor'));
  check('the list container is not a white slab behind the rows', lum(agBg)<0.06, agBg);
  const fac=rgb(await get('[class*=textInput__facade]','backgroundColor'));
  const facFg=rgb(await get('[class*=textInput__facade]','color'));
  check('an InstUI input facade is dark, not a white box', lum(fac)<0.06, fac);
  check('and its text is readable in it', ratio(facFg,fac)>=4.5, {facFg,fac,r:+ratio(facFg,fac).toFixed(2)});
  check('no JS errors', errs.length===0, errs.slice(0,2));
  const shot=await send(ws,'Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:1100,height:760,scale:2}});
  fs.writeFileSync('theme-dark.png', Buffer.from(shot.data,'base64'));
  console.log(`\n${fail?fail+' FAILED':'ALL OK'}  (${pass} passed)`);
  process.exit(fail?1:0);
})().catch(e=>{console.log('HARNESS ERROR',e.message);process.exit(2)});

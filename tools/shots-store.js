// Chrome Web Store screenshots and the homepage image, made from the built-in sample semester (no real student data).
// Usage: node tools/shots-store.js   (needs `python3 -m http.server 8899` in ~/lmk-web and Chrome on CDP port 9333,
//   same as tools/shots.js). Writes ~/lmk-docs/store-shots/{1-today-light,2-plan-dark,3-semester-light}.jpg at
//   1280×800 and ~/lmk-web/assets/screenshot-app.jpg at 1400×880. JPEG, so there is no alpha channel (the store refuses one).
const {execSync} = require("child_process"), fs = require("fs"), path = require("path");
const STORE = path.join(process.env.HOME, "lmk-docs", "store-shots"); fs.mkdirSync(STORE, {recursive: true});
const SITE = path.join(__dirname, "..", "assets", "screenshot-app.jpg");
let id = 0;
const send = (ws, m, p = {}) => new Promise(r => { const mid = ++id; const h = e => { const x = JSON.parse(e.data); if (x.id === mid) { ws.removeEventListener("message", h); r(x.result); } }; ws.addEventListener("message", h); ws.send(JSON.stringify({id: mid, method: m, params: p})); });
const ev = (ws, e) => send(ws, "Runtime.evaluate", {expression: e, returnByValue: true, awaitPromise: true}).then(r => r && r.result ? r.result.value : undefined);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0 Safari/537.36";
// The study budget is answered so the one-time question card stays out of the picture; the sample banner is hidden.
const SEED = {onboarded: 1, capacity: {weekday: 3, weekend: 4}, profile: {name: "Sam"}};
const SHOTS = [  // file, [w, h], tab, light?
  [path.join(STORE, "1-today-light.jpg"),    [1280, 800], "now",      true],
  [path.join(STORE, "2-plan-dark.jpg"),      [1280, 800], "plan",     false],
  [path.join(STORE, "3-semester-light.jpg"), [1280, 800], "semester", true],
  [SITE,                                     [1400, 880], "now",      false],
];
(async () => {
  const t = JSON.parse(execSync("curl -s http://localhost:9333/json/new -X PUT").toString());
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener("open", r));
  await send(ws, "Page.enable"); await send(ws, "Runtime.enable"); await send(ws, "Network.enable"); await send(ws, "Network.setCacheDisabled", {cacheDisabled: true});
  await send(ws, "Emulation.setUserAgentOverride", {userAgent: UA});
  await send(ws, "Emulation.setEmulatedMedia", {features: [{name: "prefers-reduced-motion", value: "reduce"}]});
  for (const [file, [w, h], tab, light] of SHOTS) {
    await send(ws, "Emulation.setDeviceMetricsOverride", {width: w, height: h, deviceScaleFactor: 1, mobile: false});
    await send(ws, "Emulation.setEmulatedMedia", {features: [{name: "prefers-color-scheme", value: light ? "light" : "dark"}, {name: "prefers-reduced-motion", value: "reduce"}]});
    await send(ws, "Page.navigate", {url: "http://localhost:8899/app/"}); await sleep(400);
    await ev(ws, `localStorage.clear(); sessionStorage.clear(); localStorage.setItem('duenorth_v1', ${JSON.stringify(JSON.stringify(SEED))}); localStorage.setItem('lmk_sample', '1')`);
    await ev(ws, `navigator.serviceWorker && navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))`);
    await send(ws, "Page.navigate", {url: "http://localhost:8899/app/"}); await sleep(2600);
    const st = await ev(ws, `(() => { const b = document.querySelector('nav [data-tab="${tab}"], [data-tab="${tab}"]'); if (b) b.click();
      const s = document.createElement('style'); s.textContent = '.samplebar{display:none!important}'; document.head.appendChild(s);
      return {sample: typeof sampleShown === 'function' && sampleShown(), welcome: !!document.querySelector('#welcomeOverlay.open')}; })()`);
    if (!st || !st.sample || st.welcome) throw new Error("not in the sample semester: " + JSON.stringify(st));
    await sleep(1500);
    await ev(ws, `window.scrollTo(0, 0)`); await sleep(300);
    const shot = await send(ws, "Page.captureScreenshot", {format: "jpeg", quality: 90});
    fs.writeFileSync(file, Buffer.from(shot.data, "base64")); console.log("wrote", file);
  }
  ws.close(); process.exit(0);
})().catch(e => { console.error("SHOTS ERROR", e.message); process.exit(1); });

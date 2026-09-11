// Headless screenshots of the public build for the shipping checklist: desktop, a 500px phone (iPhone UA), light mode.
// Usage: node tools/shots.js [outDir]   (needs `python3 -m http.server 8899` in ~/lmk-web and Chrome on CDP port 9333:
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 --user-data-dir=/tmp/lmk-cdp about:blank)
const {execSync} = require("child_process"), fs = require("fs"), path = require("path");
const out = process.argv[2] || path.join(process.env.HOME, "lmk-docs", "shots"); fs.mkdirSync(out, {recursive: true});
let id = 0;
const send = (ws, m, p = {}) => new Promise(r => { const mid = ++id; const h = e => { const x = JSON.parse(e.data); if (x.id === mid) { ws.removeEventListener("message", h); r(x.result); } }; ws.addEventListener("message", h); ws.send(JSON.stringify({id: mid, method: m, params: p})); });
const ev = (ws, e) => send(ws, "Runtime.evaluate", {expression: e, returnByValue: true, awaitPromise: true}).then(r => r && r.result ? r.result.value : undefined);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = {desktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0 Safari/537.36",
            phone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"};
const SHOTS = [  // name, viewport, user agent, seed, light?
  ["welcome-desktop", [1100, 900], "desktop", {onboarded: 0}, false],
  ["welcome-phone",   [500, 900],  "phone",   {onboarded: 0}, false],
  ["welcome-light",   [1100, 900], "desktop", {onboarded: 0}, true],
  ["waiting-desktop", [1100, 900], "desktop", {onboarded: 1, profile: {name: "Sam"}}, false, "window.postMessage({lmk:'ext-hello', version:'0.6.0'}, '*')"],
];
(async () => {
  const t = JSON.parse(execSync("curl -s http://localhost:9333/json/new -X PUT").toString());
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener("open", r));
  await send(ws, "Page.enable"); await send(ws, "Runtime.enable"); await send(ws, "Network.enable"); await send(ws, "Network.setCacheDisabled", {cacheDisabled: true});
  for (const [name, [w, h], ua, seed, light, after] of SHOTS) {
    await send(ws, "Emulation.setDeviceMetricsOverride", {width: w, height: h, deviceScaleFactor: 1, mobile: ua === "phone"});
    await send(ws, "Emulation.setUserAgentOverride", {userAgent: UA[ua]});
    await send(ws, "Emulation.setEmulatedMedia", {features: [{name: "prefers-color-scheme", value: light ? "light" : "dark"}]});
    await send(ws, "Page.navigate", {url: "http://localhost:8899/app/"}); await sleep(400);
    await ev(ws, `localStorage.clear(); sessionStorage.clear(); localStorage.setItem('duenorth_v1', ${JSON.stringify(JSON.stringify(seed))})`);
    await ev(ws, `navigator.serviceWorker && navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))`);
    await send(ws, "Page.navigate", {url: "http://localhost:8899/app/"}); await sleep(2600);
    if (after) { await ev(ws, after); await sleep(700); }
    const shot = await send(ws, "Page.captureScreenshot", {format: "png"});
    fs.writeFileSync(path.join(out, name + ".png"), Buffer.from(shot.data, "base64")); console.log("wrote", path.join(out, name + ".png"));
  }
  ws.close(); process.exit(0);
})().catch(e => { console.error("SHOTS ERROR", e.message); process.exit(1); });

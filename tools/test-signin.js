/* Fewer Google windows (v76.4). Emiel, 2026-10-23: "why am I having to sign in to google 4 or 5 times when just being on LMK?"
   A web page's Google key lasts an hour and is renewed in Google's own window; with a personal and a school account signed in,
   that window was the account chooser every hour. LMK now remembers, on this device only, which account it syncs with and
   names it (login_hint) every time it asks, so Google picks it and the window closes by itself.
   Google's library and Drive are stand-ins here: they record what LMK asks for.
   Run: node tools/test-signin.js   (needs :8899 serving ~/lmk-web and one headless Chrome on :9333) */
const {execSync} = require('child_process');
let pass = 0, fail = 0; const check = (n, ok, d) => { console.log((ok ? 'ok   ' : 'FAIL ') + n + (ok ? '' : '  -> ' + (d === undefined ? '' : JSON.stringify(d)).slice(0, 400))); ok ? pass++ : fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let id = 0;
const send = (ws, m, p = {}) => new Promise(r => { const mid = ++id; const h = e => { const x = JSON.parse(e.data); if (x.id === mid) { ws.removeEventListener('message', h); r(x.result); } }; ws.addEventListener('message', h); ws.send(JSON.stringify({id: mid, method: m, params: p})); });
const ev = (ws, e) => send(ws, 'Runtime.evaluate', {expression: e, returnByValue: true, awaitPromise: true}).then(r => r && r.result ? r.result.value : (r && r.exceptionDetails ? 'EXC ' + JSON.stringify(r.exceptionDetails).slice(0, 400) : undefined));
/* Google's library: every requestAccessToken is recorded with its overrides and answered with a fresh token. Drive answers
   "about" with the account, an empty file list, and an upload. Nothing leaves the page. */
const STUB = `(function(){ if (location.port !== '8899') return;
  window.__g = {asks: [], configs: [], about: 0};
  window.google = {accounts: {oauth2: {initTokenClient: cfg => { window.__g.configs.push({scope: cfg.scope, login_hint: cfg.login_hint || ''}); const tc = {callback: cfg.callback,
    requestAccessToken(o){ window.__g.asks.push(Object.assign({scope: cfg.scope}, o || {})); setTimeout(() => tc.callback({access_token: 'tok' + window.__g.asks.length, expires_in: 3600}), 10); }}; return tc; }}}};
  const real = window.fetch;
  window.fetch = async (u, o) => { const s = String(u), J = (x, st) => new Response(JSON.stringify(x), {status: st || 200, headers: {'content-type': 'application/json'}});
    if (/googleapis\\.com\\/drive\\/v3\\/about/.test(s)) { window.__g.about++; return J({user: {emailAddress: window.__acct || 'Sam.Student@example.edu'}}); }
    if (/googleapis\\.com\\/drive\\/v3\\/files\\?q=/.test(s)) return J({files: []});
    if (/googleapis\\.com\\/(upload\\/)?drive/.test(s)) return J({id: 'f1'});
    if (/googleapis\\.com\\/calendar/.test(s)) return J({items: [], calendars: {}});
    if (/workers\\.dev/.test(s)) return J({ok: true});
    return real(u, o); }; })();`;

(async () => {
  const t = JSON.parse(execSync('curl -s http://localhost:9333/json/new -X PUT').toString());
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
  await send(ws, 'Page.enable'); await send(ws, 'Runtime.enable'); await send(ws, 'Network.setCacheDisabled', {cacheDisabled: true});
  const errs = []; ws.addEventListener('message', e => { const x = JSON.parse(e.data); if (x.method === 'Runtime.exceptionThrown') errs.push(x.params.exceptionDetails.exception ? x.params.exceptionDetails.exception.description : x.params.exceptionDetails.text); });
  const seed = JSON.stringify(JSON.stringify({onboarded: 1, profile: {name: 'Sam'}, ext: null}));
  await send(ws, 'Page.addScriptToEvaluateOnNewDocument', {source: `try{ if (location.port === '8899' && !sessionStorage.getItem('__s')) { localStorage.clear(); localStorage.setItem('duenorth_v1', ${seed}); sessionStorage.setItem('__s', '1'); } }catch(_){}`});
  await send(ws, 'Page.addScriptToEvaluateOnNewDocument', {source: STUB});
  await send(ws, 'Page.navigate', {url: 'http://localhost:8899/app/'}); await sleep(2800);
  const G = () => ev(ws, `JSON.stringify(window.__g)`).then(JSON.parse);

  // S1 the first sign-in: no account known yet, so none is named; the account is learned from Drive and kept on this device
  check('S1 before any sign-in no account is remembered', (await ev(ws, `gHint()`)) === '');
  await ev(ws, `webSignIn(); 1`); await sleep(1500);
  let g = await G();
  check('S1 the first sign-in names no account (none is known), and asks silently first', g.asks.length >= 1 && !g.asks[0].login_hint && g.asks[0].prompt === '', g.asks);
  check('S1 after it, LMK reads the account from Drive and keeps it on this device, in lower case', g.about >= 1 && (await ev(ws, `localStorage.getItem('lmk_ghint')`)) === 'sam.student@example.edu', {about: g.about});
  check('S1 the account is never put in the store (so never in LMK-data.json or anywhere it syncs)', !(await ev(ws, `JSON.stringify(store).includes('sam.student')`)));

  // S2 the hour runs out: the next ask names the account, so Google picks it and its window closes by itself
  await ev(ws, `gdCacheClear(); gd.gesture = Date.now(); gdToken(false).then(() => window.__t2 = 1, () => window.__t2 = 0); 1`); await sleep(400);
  g = await G(); const last = g.asks[g.asks.length - 1];
  check('S2 renewing the Drive key names the account (login_hint) and asks silently (prompt "")', last.login_hint === 'sam.student@example.edu' && last.prompt === '' && /drive\.file/.test(last.scope), last);
  // S3 the calendar's key names the same account
  await ev(ws, `CAL.tok = null; CAL.exp = 0; calToken(true).then(() => 1, () => 0); 1`); await sleep(400);
  g = await G(); const cal = g.asks[g.asks.length - 1];
  check('S3 the calendar\'s key names the same account', /calendar/.test(cal.scope) && cal.login_hint === 'sam.student@example.edu', cal);
  // S4 a student who picks another account in Google's window: LMK follows it with the next key
  await ev(ws, `window.__acct = 'sam.personal@gmail.com'; gdCacheClear(); gd.gesture = Date.now(); gdToken(false).then(() => 1, () => 0); 1`); await sleep(700);
  check('S4 the remembered account follows the one Google last gave a key for', (await ev(ws, `localStorage.getItem('lmk_ghint')`)) === 'sam.personal@gmail.com');
  // S5 a remembered value that is not an email address is never sent to Google
  await ev(ws, `localStorage.setItem('lmk_ghint', '<script>x'); 1`);
  check('S5 a malformed remembered value is ignored, not sent', (await ev(ws, `gHint()`)) === '' && !('login_hint' in (await ev(ws, `JSON.stringify(gHinted({prompt: ''}))`).then(JSON.parse))));

  check('JS errors during run: none', errs.length === 0, errs.slice(0, 3));
  console.log(fail ? `\n${fail} FAILED  (${pass} passed)` : `\nALL OK  (${pass} passed)`);
  ws.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });

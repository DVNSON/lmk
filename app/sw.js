/* LMK service worker. Network first, cache as the fallback: the app opens with no signal,
   and never serves a stale build when there is one. Cross-origin requests (fonts, Google
   sign-in, Drive) are left alone. */
const CACHE = "lmk-v1";
const CORE = ["./", "./index.html", "./manifest.webmanifest"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url; try { url = new URL(req.url); } catch(_) { return; }
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || (req.mode === "navigate" ? caches.match("./") : undefined)))
  );
});

/* ---- the morning note ----
   CACHE is deliberately NOT bumped and CORE is deliberately NOT extended. Adding listeners is not a change
   of fetch strategy, and activate deletes every cache whose key differs, so a gratuitous bump would wipe the
   offline fallback mid-session; cache.addAll rejects atomically on one 404, so a mistyped icon path here
   would leave the old push-less worker installed and the failure would be invisible.

   The push carries a count and a duration only. The naming line comes from ./plan.json, which the page
   writes into this same cache whenever the plan changes — so no assignment title ever crosses the network. */
async function morning(e){
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch(_){}
  const title = typeof d.t === "string" && d.t ? d.t : "LMK";
  let body = "Open LMK for today's plan.";
  try {
    const c = await caches.open(CACHE);
    const r = await c.match("./plan.json");
    if (r) {
      const p = await r.json();
      // the page stamps `at`; anything older than three days is a plan we should not read aloud
      if (p && p.first && Date.now() - (+p.at || 0) < 3 * 864e5) body = p.first;
      else if (p && Date.now() - (+p.at || 0) >= 3 * 864e5) body = "Open LMK to refresh today's plan.";
    }
  } catch(_){}
  return self.registration.showNotification(title, {
    body, tag: "lmk-morning", renotify: false,
    icon: "../assets/icon-192.png", badge: "../assets/icon-192.png",
    data: {url: (d && typeof d.u === "string" && d.u) || "./"},
  });
}
self.addEventListener("push", e => e.waitUntil(morning(e)));

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({type: "window", includeUncontrolled: true});
    for (const c of all) { if (c.url.indexOf("/app/") >= 0 && "focus" in c) return c.focus(); }
    // openWindow must be given the /app/ URL: the site root is outside this worker's scope
    return self.clients.openWindow(url);
  })());
});

/* A test hatch, so the display half is checkable without a real push service. */
self.addEventListener("message", e => {
  if (e.data && e.data.lmk === "test-morning") e.waitUntil(morning({data: {json: () => e.data.payload || {}}}));
});

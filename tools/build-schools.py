#!/usr/bin/env python3
"""One static page per school LMK is known to work with, plus an index: lmktoday.app/canvas/<slug>/.
Not programmatic SEO — ten pages, each saying something true about that school's Canvas address and the
exact steps. Adding a school is one row in SCHOOLS. Run:  python3 tools/build-schools.py   (from ~/lmk-web)
The nine "add" hosts were checked live on 2026-09-09 (see ~/lmk-docs/extension.md); do not add a host you
have not seen answer."""
import io, os, html
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORE = "https://chromewebstore.google.com/detail/lmk-for-canvas/efjeldekjgbggjedpboafbblcegmmdam"
# slug, school, short name, Canvas host, native (read out of the box) or add (needs adopting), the LMS's local name
SCHOOLS = [
    ("asu",      "Arizona State University",          "ASU",          "canvas.asu.edu",         True,  "Canvas"),
    ("uw",       "University of Washington",          "UW",           "canvas.uw.edu",          False, "Canvas"),
    ("ucla",     "UCLA",                              "UCLA",         "bruinlearn.ucla.edu",    False, "Bruin Learn"),
    ("harvard",  "Harvard University",                "Harvard",      "canvas.harvard.edu",     False, "Canvas"),
    ("wisc",     "University of Wisconsin–Madison",   "UW–Madison",   "canvas.wisc.edu",        False, "Canvas"),
    ("ucdavis",  "UC Davis",                          "UC Davis",     "canvas.ucdavis.edu",     False, "Canvas"),
    ("upenn",    "University of Pennsylvania",        "Penn",         "canvas.upenn.edu",       False, "Canvas"),
    ("rutgers",  "Rutgers University",                "Rutgers",      "canvas.rutgers.edu",     False, "Canvas"),
    ("utdallas", "UT Dallas",                         "UT Dallas",    "elearning.utdallas.edu", False, "eLearning"),
]
CSS = """
  :root{--bg:#f2f3f6;--surface:#fff;--surface-2:#f7f8fa;--ink:#14161a;--ink-2:#565b64;--muted:#8a8f98;--line:#e3e5ea;--line-strong:#c9ccd3;--accent:#e0489a;
    --splash:linear-gradient(115deg,#ff5d52,#e0489a 48%,#f7a521);--shadow:0 1px 2px rgba(20,22,26,.06),0 10px 34px -12px rgba(20,22,26,.16);color-scheme:light}
  @media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0f1013;--surface:#1a1c21;--surface-2:#22242a;--ink:#f4f5f7;--ink-2:#b6bac2;--muted:#83878f;--line:#2a2d34;--line-strong:#3a3e47;--accent:#e85fa2;
    --splash:linear-gradient(115deg,#ff6b5e,#e85fa2 48%,#ffb02e);--shadow:0 1px 2px rgba(0,0,0,.4),0 12px 40px -14px rgba(0,0,0,.65);color-scheme:dark}}
  :root[data-theme="dark"]{--bg:#0f1013;--surface:#1a1c21;--surface-2:#22242a;--ink:#f4f5f7;--ink-2:#b6bac2;--muted:#83878f;--line:#2a2d34;--line-strong:#3a3e47;--accent:#e85fa2;
    --splash:linear-gradient(115deg,#ff6b5e,#e85fa2 48%,#ffb02e);--shadow:0 1px 2px rgba(0,0,0,.4),0 12px 40px -14px rgba(0,0,0,.65);color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:400 16px/1.6 "Public Sans",system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
  .wrap{max-width:720px;margin:0 auto;padding-block:36px 80px;padding-inline:20px}
  .mark{display:inline-flex;align-items:center;justify-content:center;background:var(--splash);color:#fff;font:800 15px/1 "Bricolage Grotesque",sans-serif;letter-spacing:.03em;padding:7px 10px 8px;border-radius:9px;text-decoration:none}
  .eyebrow{font:600 11.5px/1 "Spline Sans Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-top:22px}
  h1{margin:12px 0 10px;font:800 clamp(30px,6vw,44px)/1.05 "Bricolage Grotesque",sans-serif;letter-spacing:-.02em;text-wrap:balance}
  .lede{font-size:17.5px;color:var(--ink-2);max-width:58ch;margin:0 0 22px}
  h2{margin:34px 0 10px;font:800 22px/1.2 "Bricolage Grotesque",sans-serif;letter-spacing:-.01em}
  p{margin:0 0 12px;max-width:64ch}
  code{font:500 14px/1.4 "Spline Sans Mono",monospace;background:var(--surface-2);border:1px solid var(--line);border-radius:5px;padding:1px 6px;overflow-wrap:anywhere}
  ol.steps{list-style:none;margin:0 0 18px;padding:0;display:flex;flex-direction:column;gap:10px;counter-reset:s}
  ol.steps li{display:flex;gap:13px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 16px;box-shadow:var(--shadow)}
  ol.steps li::before{counter-increment:s;content:counter(s);flex:none;width:28px;height:28px;border-radius:50%;background:var(--splash);color:#fff;font:700 14px/28px "Bricolage Grotesque",sans-serif;text-align:center}
  ol.steps li b{display:block;margin-bottom:2px}
  ol.steps li span{color:var(--ink-2);font-size:14.5px}
  .btn{display:inline-flex;align-items:center;gap:8px;border-radius:11px;padding:11px 18px;font-weight:700;font-size:15px;text-decoration:none;border:1px solid var(--line);color:var(--ink);background:var(--surface)}
  .btn.grad{background:var(--splash);color:#fff;border-color:transparent}
  .row{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 10px}
  .note{background:var(--surface-2);border:1px dashed var(--line-strong);border-radius:12px;padding:12px 16px;font-size:14.5px;color:var(--ink-2);margin:14px 0 0}
  .schools{list-style:none;padding:0;margin:0 0 20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
  .schools a{display:block;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px;text-decoration:none;color:var(--ink);box-shadow:var(--shadow)}
  .schools a b{display:block} .schools a span{font:500 12.5px/1.5 "Spline Sans Mono",monospace;color:var(--muted);overflow-wrap:anywhere}
  footer{margin-top:44px;padding-top:16px;border-top:1px solid var(--line);font-size:13.5px;color:var(--muted);display:flex;gap:16px;flex-wrap:wrap}
  footer a{color:var(--ink-2)}
"""
HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:type" content="website">
<link rel="canonical" href="https://lmktoday.app/canvas/{path}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='22' fill='%23e0489a'/><text x='50' y='64' font-size='44' font-family='sans-serif' font-weight='800' fill='white' text-anchor='middle'>L</text></svg>">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Public+Sans:wght@400;600;700&family=Spline+Sans+Mono:wght@500&display=swap">
<style>{css}</style>
</head>
<body>
<div class="wrap">
<a class="mark" href="/">LMK</a>
"""
FOOT = """
<footer><a href="/">What LMK is</a><a href="/app/">Open the app</a><a href="/canvas/">Other schools</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></footer>
</div>
</body>
</html>
"""
def e(s): return html.escape(s, quote=True)

def school_page(slug, school, short, host, native, lmsname):
    title = f"{short} Canvas in LMK — one daily plan"
    desc = f"Turn your {short} {lmsname} ({host}) into a calm daily plan. LMK reads what's due, sizes it to the hours you have, and learns how long your work really takes. Free."
    body = [HEAD.format(title=e(title), desc=e(desc), path=f"{slug}/", css=CSS)]
    body.append(f'<div class="eyebrow">{e(school)}</div>')
    body.append(f'<h1>Your {e(short)} {e(lmsname)}, as one daily plan.</h1>')
    body.append(f'<p class="lede">{e(short)} runs Canvas at <code>{e(host)}</code>. LMK reads it with a Chrome extension, sizes every assignment to the hours you actually have, and tells you what to do today. It never changes anything in Canvas, and it never sees your password.</p>')
    body.append('<ol class="steps">')
    body.append(f'<li><div><b>Add LMK Today to Chrome.</b><span>On a laptop or desktop — a phone can\'t install an extension. It\'s free.</span></div></li>')
    if native:
        body.append(f'<li><div><b>Open <code>{e(host)}</code> once, like you normally would.</b><span>LMK reads {e(short)}\'s Canvas out of the box. Your classes land in LMK by themselves a few seconds after Canvas loads.</span></div></li>')
    else:
        body.append(f'<li><div><b>Tell LMK where {e(short)}\'s Canvas lives.</b><span>Out of the box the extension reads <code>canvas.asu.edu</code> and any <code>instructure.com</code> address; <code>{e(host)}</code> is {e(short)}\'s own. In LMK, under the gear, choose <b>Add my school\'s Canvas</b> and approve <code>{e(host)}</code> — Chrome asks once. If the gear doesn\'t offer it yet, your extension is still on an older version; the Canvas access-token route under the same gear works on any school, and on a phone.</span></div></li>')
        body.append(f'<li><div><b>Open <code>{e(host)}</code> once.</b><span>Your classes land in LMK by themselves a few seconds after Canvas loads.</span></div></li>')
    body.append('<li><div><b>Come back to LMK.</b><span>The first thing on screen is the one thing to start with today. Everything else waits its turn.</span></div></li>')
    body.append('</ol>')
    body.append(f'<div class="row"><a class="btn grad" href="{STORE}" target="_blank" rel="noopener">Add to Chrome →</a><a class="btn" href="/app/">Open LMK</a></div>')
    body.append('<div class="note"><b>Got an invite link from a classmate?</b> Open it on your laptop before you install — it remembers the class, and once your Canvas is in, that class\'s room is waiting for you.</div>')
    body.append('<h2>What LMK keeps, and where</h2>')
    body.append('<p>Your plan lives in your own browser and, if you sign in with Google, in one file in your own Drive. If you keep <b>Sync from anywhere</b> on, LMK\'s server holds an encrypted Canvas key and your assignment list so your phone stays fresh — no name, no email, no Canvas user id. The <a href="/privacy.html">privacy page</a> lists every item.</p>')
    body.append(FOOT)
    return "".join(body)

def brightspace_page():
    title = "Brightspace in LMK — one daily plan"
    desc = "Turn your school's D2L Brightspace into a calm daily plan. LMK reads what's due, sizes it to the hours you have, and learns how long your work really takes. Free."
    body = [HEAD.format(title=e(title), desc=e(desc), path="../brightspace/", css=CSS)]
    body.append('<div class="eyebrow">D2L Brightspace</div><h1>Your Brightspace, as one daily plan.</h1>')
    body.append('<p class="lede">If your school runs D2L Brightspace, LMK reads it the same way it reads Canvas: a Chrome extension, your own login, nothing to configure. It never changes anything in Brightspace and never sees your password.</p>')
    body.append('<ol class="steps">')
    body.append('<li><div><b>Add LMK Today to Chrome.</b><span>On a laptop or desktop — a phone can\'t install an extension. It\'s free.</span></div></li>')
    body.append('<li><div><b>Open your school\'s Brightspace once, like you normally would.</b><span>An address ending in <code>brightspace.com</code> is read out of the box. If your school runs Brightspace on its own address, open LMK, choose <b>Add my school\'s site</b> under the gear and approve it — Chrome asks once.</span></div></li>')
    body.append('<li><div><b>Come back to LMK.</b><span>Your classes land here by themselves a few seconds after Brightspace loads. The first thing on screen is the one thing to start with today.</span></div></li>')
    body.append('</ol>')
    body.append(f'<div class="row"><a class="btn grad" href="{STORE}" target="_blank" rel="noopener">Add to Chrome →</a><a class="btn" href="/app/">Open LMK</a></div>')
    body.append('<div class="note"><b>Two honest differences from Canvas.</b> Brightspace has no student access keys, so <i>Sync from anywhere</i> (LMK\'s server keeping your phone fresh while the laptop is closed) isn\'t available — your phone stays current through your own Google Drive whenever the laptop has LMK open. And each school allows the extension different Brightspace routes; the first sync at a new school tells LMK which ones, and the collector gets fixed for that school from there.</div>')
    body.append('<h2>What LMK keeps, and where</h2>')
    body.append('<p>Your plan lives in your own browser and, if you sign in with Google, in one file in your own Drive. The <a href="/privacy.html">privacy page</a> lists every item.</p>')
    body.append(FOOT)
    return "".join(body)

def index_page():
    title = "Schools LMK works with"
    desc = "Which Canvas addresses LMK reads out of the box, which ones you add under the gear, and the steps for each school."
    body = [HEAD.format(title=e(title), desc=e(desc), path="", css=CSS)]
    body.append('<div class="eyebrow">Schools</div><h1>Canvas is Canvas — the address is what differs.</h1>')
    body.append('<p class="lede">The extension reads <code>canvas.asu.edu</code> and any <code>instructure.com</code> address out of the box. Most universities run Canvas on their own address, and LMK reads those too once you add the address under the gear. These are the schools whose Canvas we have checked.</p>')
    body.append('<ul class="schools">')
    for slug, school, short, host, native, lmsname in SCHOOLS:
        body.append(f'<li><a href="/canvas/{slug}/"><b>{e(short)}</b><span>{e(host)} · {"out of the box" if native else "add under the gear"}</span></a></li>')
    body.append('</ul>')
    body.append('<h2>On D2L Brightspace?</h2><p>Same steps, one Chrome extension: <a href="/brightspace/">LMK for Brightspace</a>.</p>')
    body.append('<h2>Your school isn\'t here?</h2>')
    body.append('<p>If your Canvas address ends in <code>instructure.com</code>, nothing to add — install and open Canvas once. Otherwise install, open LMK, and choose <b>Add my school\'s Canvas</b> under the gear; or use the Canvas access-token route there, which works on any school and on a phone. Brightspace schools work the same way through <code>brightspace.com</code>.</p>')
    body.append(f'<div class="row"><a class="btn grad" href="{STORE}" target="_blank" rel="noopener">Add to Chrome →</a><a class="btn" href="/app/">Open LMK</a></div>')
    body.append(FOOT)
    return "".join(body)

if __name__ == "__main__":
    out = os.path.join(ROOT, "canvas")
    os.makedirs(out, exist_ok=True)
    io.open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(index_page())
    bs = os.path.join(ROOT, "brightspace"); os.makedirs(bs, exist_ok=True)
    io.open(os.path.join(bs, "index.html"), "w", encoding="utf-8").write(brightspace_page())
    for row in SCHOOLS:
        d = os.path.join(out, row[0]); os.makedirs(d, exist_ok=True)
        io.open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(school_page(*row))
    print("wrote", len(SCHOOLS) + 1, "pages under", out, "+ /brightspace/")

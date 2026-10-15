#!/usr/bin/env python3
"""Repo code + live artifact seed -> a seeded file ready to publish to Emiel's artifact.
Usage: python3 tools/artifact-splice.py <live-artifact.html> <out.html> [<code.html>]
<live-artifact.html> must come from a FRESH `Artifact action:"read"` (the routine republishes the seed each morning and on a Canvas change; a
stale base is refused at publish). <code.html> defaults to ~/lmk-web/app/index.html."""
import io, os, re, sys
HOME = os.path.expanduser("~")
if len(sys.argv) not in (3, 4): sys.exit(__doc__)
live = io.open(sys.argv[1], encoding="utf-8").read()
code = io.open(sys.argv[3] if len(sys.argv) == 4 else os.path.join(HOME, "lmk-web", "app", "index.html"), encoding="utf-8").read()
# The artifact holds the APP, not the site's page around it. app/index.html wraps the app in a real document (doctype, a
# head that registers sw.js and links the manifest); the app itself starts at <title>LMK</title> inside <body>. From
# 2026-10-11 to 10-15 this tool published the whole page, the artifact nested a second document inside the viewer's, and the
# hourly routine — whose prompt requires the artifact to begin with <title>LMK</title> — only kept publishing by working
# around its own check. Publish the body, as the artifact always held before.
m = re.search(r"<body>\n(.*?)\n*</body>\s*</html>\s*$", code, re.S)
if code.lstrip()[:15].lower().startswith("<!doctype") and m: code = m.group(1) + "\n"
if not code.startswith("<title>LMK</title>"): sys.exit("the app must start with <title>LMK</title> (the routine checks for it)")
# The site serves its fonts itself (/assets/fonts, 2026-10-15: no page asks Google for them). The artifact runs on claude.ai's
# sandbox origin, which cannot reach lmktoday.app's files, so its copy keeps loading the same families from Google Fonts.
LOCAL_FONTS = '<link rel="stylesheet" href="/assets/fonts/fonts.css">'
GOOGLE_FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Public+Sans:wght@400..700&family=Spline+Sans+Mono:wght@500..600&display=swap">'
if code.count(LOCAL_FONTS) != 1: sys.exit("expected the app's one local fonts link")
code = code.replace(LOCAL_FONTS, GOOGLE_FONTS)
out = code
for n in ("SEED_ROWS", "SEED_LABEL", "SYNCED_AT"):
    m = re.search(r"^const %s = .*;$" % n, live, re.M)
    if not m: sys.exit("live artifact has no single-line %s" % n)
    out, k = re.subn(r"^const %s = .*;$" % n, lambda _: m.group(0), out, count=1, flags=re.M)
    if k != 1: sys.exit("code has no single-line %s" % n)
io.open(sys.argv[2], "w", encoding="utf-8").write(out)
rows = re.search(r"^const SEED_ROWS = .*;$", out, re.M).group(0).count('["')
v = re.search(r'APP_BUILD = "([^"]+)"', out)
print("spliced", v.group(1) if v else "?", "|", rows, "seed rows |", re.search(r'^const SYNCED_AT = .*;$', out, re.M).group(0), "->", sys.argv[2])

#!/usr/bin/env python3
"""Repo code + live artifact seed -> a seeded file ready to publish to Emiel's artifact.
Usage: python3 tools/artifact-splice.py <live-artifact.html> <out.html> [<code.html>]
<live-artifact.html> must come from a FRESH `Artifact action:"read"` (the routine republishes the seed hourly; a
stale base is refused at publish). <code.html> defaults to ~/lmk-web/app/index.html."""
import io, os, re, sys
HOME = os.path.expanduser("~")
if len(sys.argv) not in (3, 4): sys.exit(__doc__)
live = io.open(sys.argv[1], encoding="utf-8").read()
code = io.open(sys.argv[3] if len(sys.argv) == 4 else os.path.join(HOME, "lmk-web", "app", "index.html"), encoding="utf-8").read()
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

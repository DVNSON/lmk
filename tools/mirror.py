#!/usr/bin/env python3
"""Seeded app HTML -> ~/lmk-web/app/index.html with Emiel's coursework removed (shipping.md, "the public build must
never carry Emiel's coursework"). Usage: python3 tools/mirror.py <seeded.html>. Refuses to write if any seed line is
not a single-line const (invariant 1)."""
import io, os, re, sys
HOME = os.path.expanduser("~"); OUT = os.path.join(HOME, "lmk-web", "app", "index.html")
if len(sys.argv) != 2: sys.exit("usage: mirror.py <seeded.html>")
src = io.open(sys.argv[1], encoding="utf-8").read()
for n in ("SEED_ROWS", "SEED_LABEL", "SYNCED_AT"):
    if len(re.findall(r"^const %s = .*;$" % n, src, re.M)) != 1: sys.exit("%s is not exactly one single-line const" % n)
pub = re.sub(r'^const SEED_ROWS = .*;$',  'const SEED_ROWS = [];',            src, count=1, flags=re.M)
pub = re.sub(r'^const SEED_LABEL = .*;$', 'const SEED_LABEL = "Your Canvas";', pub, count=1, flags=re.M)
pub = re.sub(r'^const SYNCED_AT = .*;$',  'const SYNCED_AT = "";',            pub, count=1, flags=re.M)
if "const SEED_ROWS = [];" not in pub: sys.exit("seed not blanked")
io.open(OUT, "w", encoding="utf-8").write(pub)
v = re.search(r'APP_BUILD = "([^"]+)"', pub); print("mirrored", v.group(1) if v else "?", len(pub), "bytes ->", OUT.replace(HOME, "~"))

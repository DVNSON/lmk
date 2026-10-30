#!/usr/bin/env python3
"""Embed tools/size-hints.js in app/index.html between its markers (the app is one file; the artifact copy cannot load a second
script). `--check` only compares, for the ship routine: exit 1 when the embedded block differs from the file.
   python3 tools/sync-hints.py          # write
   python3 tools/sync-hints.py --check  # verify"""
import pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = (ROOT / 'tools' / 'size-hints.js').read_text(encoding='utf8').rstrip('\n')
A = ROOT / 'app' / 'index.html'; s = A.read_text(encoding='utf8')
START = '/* ---- size-hints (T0): generated from tools/size-hints.js by tools/sync-hints.py — edit the file, never this block ---- */\n'
END = '\n/* ---- end size-hints ---- */'
i = s.find(START); j = s.find(END)
if i < 0 or j < 0: print('markers not found in app/index.html'); sys.exit(2)
cur = s[i + len(START):j]
if '--check' in sys.argv:
    print('size-hints: embedded block matches tools/size-hints.js' if cur == SRC else 'size-hints: embedded block DIFFERS from tools/size-hints.js — run python3 tools/sync-hints.py'); sys.exit(0 if cur == SRC else 1)
A.write_text(s[:i + len(START)] + SRC + s[j:], encoding='utf8'); print('size-hints embedded' if cur != SRC else 'size-hints already current')

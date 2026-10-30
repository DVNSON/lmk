/* T0 against real measured assignments (2026-10-29, fourth directive Phase 4). Reads a student's own LMK store (a local copy of LMK-data.json,
   never committed: pass its path) and scores, for every assignment with a measurement, the shipped title rule and T0 against the median
   measured minutes. Measurements: 'quiz' = the time Canvas recorded for a quiz attempt, 'tracked' = sprint/tab minutes, 'ask' = the
   student's answer. Prints nothing personal: no titles, no course names — ids, kinds, minutes and verdicts only.
   Run: node tools/t0-vs-measured.js <path-to-LMK-data.json> [--verbose] */
const fs = require('fs'), path = require('path');
const {sizeHints} = require('./size-hints');
const P = process.argv[2]; if (!P) { console.log('usage: node tools/t0-vs-measured.js <LMK-data.json>'); process.exit(2); }
const VERBOSE = process.argv.includes('--verbose');
const S = JSON.parse(fs.readFileSync(P, 'utf8')), items = ((S.ext || {}).items) || {};
const app = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
const lift = re => { const m = app.match(re); if (!m) throw new Error('baseline code not found: ' + re); return m[0]; };
const EFFORT = eval('(' + lift(/const EFFORT = \{[\s\S]*?\n\};/).replace(/^const EFFORT = /, '').replace(/;$/, '') + ')');
const isExam = eval('(' + lift(/const isExam = [\s\S]*?;\n/).replace(/^const isExam = /, '').replace(/;\n$/, '') + ')');
const guessEffort = eval('(' + lift(/function guessEffort\(title, k\)\{[\s\S]*?\n\}/) + ')');
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const rows = [];
for (const id in S.dur || {}) {
  const x = items[id.slice(1)]; if (!x) continue;
  const ms = (S.dur[id] || []).filter(d => d.m > 0).map(d => d.m), srcs = [...new Set((S.dur[id] || []).map(d => d.src))];
  if (!ms.length) continue;
  const kind = x.k === 'inclass' || x.k === 'fyi' ? x.k : /online_quiz/.test(x.st || '') ? 'quiz' : /discussion_topic/.test(x.st || '') ? 'discussion' : '';
  const appMins = kind === 'inclass' || kind === 'fyi' || isExam(x.t) ? 0 : EFFORT[guessEffort(x.t, kind)].mins;
  const h = sizeHints({t: x.t, st: x.st || '', pts: x.pts, k: x.k, desc: strip(x.desc)});
  rows.push({id, kind: kind || 'work', desc: !!strip(x.desc), n: ms.length, srcs, m: median(ms), app: appMins, t0: h.mins, lo: h.lo, hi: h.hi, src: h.src});
}
const ratio = (est, m) => est / Math.max(1, m);
const verdict = (est, m) => est < m / 3 ? 'SEVERE' : est < m * 0.75 ? 'under' : est > m * 1.5 ? 'over' : 'hit';
const tally = (list, f) => { const o = {hit: 0, under: 0, SEVERE: 0, over: 0, n: list.length}; for (const r of list) o[f(r)]++; return o; };
const fmt = o => `${o.n}: hit ${o.hit} (${o.n ? Math.round(o.hit / o.n * 100) : 0}%)  under ${o.under}  SEVERE ${o.SEVERE}  over ${o.over}`;
const absLog = (list, f) => { const v = list.map(r => Math.abs(Math.log(ratio(f(r), r.m)))); return v.length ? Math.round(Math.exp(median(v)) * 100) / 100 : null; };
console.log(`t0-vs-measured: ${rows.length} assignments with a measurement (${rows.reduce((t, r) => t + r.n, 0)} timings; sources ${[...new Set(rows.flatMap(r => r.srcs))].join(', ')}); ${rows.filter(r => r.desc).length} have a description`);
for (const [name, f] of [['app today (title + type)', r => r.app], ['T0 size-hints', r => r.t0]]) {
  console.log(`\n  ${name}\n    all            ${fmt(tally(rows, r => verdict(f(r), r.m)))}   typical miss x${absLog(rows, f)}`);
  for (const k of [...new Set(rows.map(r => r.kind))]) { const l = rows.filter(r => r.kind === k); console.log(`    ${k.padEnd(14)} ${fmt(tally(l, r => verdict(f(r), r.m)))}   typical miss x${absLog(l, f)}`); }
  for (const d of [true, false]) { const l = rows.filter(r => r.desc === d); if (l.length) console.log(`    ${(d ? 'described' : 'bare title').padEnd(14)} ${fmt(tally(l, r => verdict(f(r), r.m)))}   typical miss x${absLog(l, f)}`); }
}
const cov = rows.filter(r => r.m >= r.lo && r.m <= r.hi).length;
console.log(`\n  T0's own range covers the measurement in ${cov}/${rows.length}; by tier: ` + [...new Set(rows.map(r => r.src))].map(s => { const l = rows.filter(r => r.src === s); return `${s} ${fmt(tally(l, r => verdict(r.t0, r.m)))}`; }).join(' · '));
if (VERBOSE) for (const r of rows.sort((a, b) => a.kind.localeCompare(b.kind) || a.m - b.m)) console.log(`    ${r.id.padEnd(10)} ${r.kind.padEnd(10)} ${r.desc ? 'desc' : 'bare'} n=${String(r.n).padStart(2)} measured ${String(r.m).padStart(4)}  app ${String(r.app).padStart(4)} ${verdict(r.app, r.m).padEnd(6)}  T0 ${String(r.t0).padStart(4)} [${r.lo}-${r.hi}] ${verdict(r.t0, r.m).padEnd(6)} ${r.src}`);

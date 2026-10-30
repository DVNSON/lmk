/* How good is the estimate? (2026-10-29, directive §3 "evaluate estimates independently".) tools/estimate-cases.js holds 72 made-up
   assignments with a labelled RANGE of minutes each, from the Rice workload rates, from a stated timer, or (where no published rate
   exists) from a stated convention — none derived from LMK's own sizes. This scores two estimators on them:
     app   — what the app does today: guessEffort(title, kind) → quick 15 / medium 45 / big 120 (the functions are lifted from
             app/index.html so the baseline is the shipped code, not a copy of it)
     T0    — tools/size-hints.js (title, type, points, description; with and without the quiz fields the extension could add)
   Scores: hit (inside the range), under (below it), SEVERE under (below a third of the low end — the failure the directive singles out:
   a four-hour thing called 45 minutes), over (above it); by set (design — looked at while writing T0 — and heldout — never), by the
   label's basis (rice / explicit / judgment), by type, by T0's own evidence tier (src). Calibration: how often T0's own [lo, hi] overlaps
   the label's, and how wide it is. The planner's consequence is measured separately, by tools/bench-plan.js with the size-hints candidate.
   Run: node tools/test-estimate.js [--verbose] [--set design|heldout] */
const fs = require('fs'), path = require('path');
const CASES = require('./estimate-cases'), {sizeHints} = require('./size-hints');
const ARG = process.argv.slice(2), VERBOSE = ARG.includes('--verbose'), ONLY = (i => i >= 0 ? ARG[i + 1] : null)(ARG.indexOf('--set')), T1 = (i => i >= 0 ? ARG[i + 1] : null)(ARG.indexOf('--t1'));
/* --t1 <json>: a run of tools/estimate-bench.html (the built-in model on a real Chrome) scored on the same cases beside T0 */
/* the shipped baseline, lifted from the app */
const app = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
const lift = (re) => { const m = app.match(re); if (!m) throw new Error('baseline code not found: ' + re); return m[0]; };
const EFFORT = eval('(' + lift(/const EFFORT = \{[\s\S]*?\n\};/).replace(/^const EFFORT = /, '').replace(/;$/, '') + ')');
const isExam = eval('(' + lift(/const isExam = [\s\S]*?;\n/).replace(/^const isExam = /, '').replace(/;\n$/, '') + ')');
const guessEffort = eval('(' + lift(/function guessEffort\(title, k\)\{[\s\S]*?\n\}/) + ')');
const kindOf = c => c.k === 'inclass' || c.k === 'fyi' ? c.k : /online_quiz/.test(c.st || '') ? 'quiz' : /discussion_topic/.test(c.st || '') ? 'discussion' : '';
const appEst = c => { const k = kindOf(c); if (k === 'inclass' || k === 'fyi') return 0; if (isExam(c.t)) return 0; return EFFORT[guessEffort(c.t, k)].mins; };   // not planned: in class, info, an exam (its study is separate)
/* scoring */
const score = (est, c) => est >= c.lo && est <= c.hi ? 'hit' : est < c.lo ? (est < c.lo / 3 && c.lo >= 15 ? 'severe' : 'under') : 'over';
const cases = CASES.map(c => Object.assign({t: c.title}, c)).filter(c => !ONLY || c.set === ONLY);
const rows = cases.map(c => {
  const a = appEst(c), t0 = sizeHints(Object.assign({}, c, {qn: undefined, tl: undefined})), t0q = sizeHints(c);
  return {c, a, t0, t0q, sa: score(a, c), s0: score(t0.mins, c), s0q: score(t0q.mins, c), overlap: !(t0q.hi < c.lo || t0q.lo > c.hi), width: t0q.hi - t0q.lo};
});
const tally = (list, f) => { const o = {hit: 0, under: 0, severe: 0, over: 0, n: 0}; for (const r of list) { o[f(r)]++; o.n++; } return o; };
const fmt = o => `${o.n} cases: hit ${o.hit} (${Math.round(o.hit / o.n * 100)}%)  under ${o.under}  SEVERE ${o.severe}  over ${o.over}`;
const by = (key, f) => { const g = {}; for (const r of rows) (g[key(r)] = g[key(r)] || []).push(r); return Object.entries(g).map(([k, l]) => `    ${k.padEnd(12)} ${fmt(tally(l, f))}`).join('\n'); };
console.log(`test-estimate: ${rows.length} cases (${rows.filter(r => r.c.set === 'design').length} design, ${rows.filter(r => r.c.set === 'heldout').length} held-out)\n`);
for (const [name, f] of [['app today (title + type → 15/45/120)', r => r.sa], ['T0 size-hints (fields the extension ships today)', r => r.s0], ['T0 size-hints + quiz question count / time limit', r => r.s0q]]) {
  console.log(`  ${name}\n    all          ${fmt(tally(rows, f))}\n${by(r => r.c.set, f)}\n   by basis\n${by(r => r.c.basis.split(':')[0].replace(/-ish|the title.*|unknown.*|in class.*|an exam.*/, m => m.startsWith('rice') ? 'rice' : 'other').trim() || 'other', f)}\n`);
}
console.log('  T0 (with quiz fields) by its own evidence tier:\n' + by(r => r.t0q.src, r => r.s0q));
console.log('  T0 by assignment type:\n' + by(r => r.c.type, r => r.s0q));
const ov = rows.filter(r => r.overlap).length, w = rows.map(r => r.width / Math.max(1, r.t0q.mins)).sort((a, b) => a - b);
console.log(`\n  calibration: T0's own range overlaps the label's in ${ov}/${rows.length} cases; its range is ${Math.round(w[Math.floor(w.length / 2)] * 100)}% of the estimate wide (median)`);
const sev = rows.filter(r => r.s0q === 'severe' || r.sa === 'severe');
console.log(`\n  severe under-estimates (below a third of the label's low end): app ${rows.filter(r => r.sa === 'severe').length}, T0 ${rows.filter(r => r.s0q === 'severe').length}`);
for (const r of sev) console.log(`    #${r.c.id} ${r.c.set.padEnd(7)} ${r.c.title.slice(0, 40).padEnd(42)} label ${r.c.lo}-${r.c.hi}  app ${r.a} (${r.sa})  T0 ${r.t0q.mins} (${r.s0q}) — ${r.t0q.why}`);
if (VERBOSE) { console.log('\n  every case:'); for (const r of rows) console.log(`    #${String(r.c.id).padStart(2)} ${r.c.set.padEnd(7)} ${r.c.type.padEnd(12)} ${r.c.title.slice(0, 38).padEnd(40)} label ${String(r.c.lo + '-' + r.c.hi).padEnd(10)} app ${String(r.a).padStart(4)} ${r.sa.padEnd(6)} T0 ${String(r.t0q.mins).padStart(4)} [${r.t0q.lo}-${r.t0q.hi}] ${r.s0q.padEnd(6)} ${r.t0q.src.padEnd(8)} ${r.t0q.why}`); }
if (T1) {
  const t1 = JSON.parse(fs.readFileSync(T1, 'utf8')), byId = new Map(t1.rows.map(r => [r.id, r]));
  const sc = rows.map(r => { const x = byId.get(r.c.id); return x && x.t1 ? (x.t1.ok ? score(x.t1.mins, r.c) : 'rejected') : 'missing'; });
  const o = {}; for (const s of sc) o[s] = (o[s] || 0) + 1;
  const ms = t1.rows.filter(r => r.t1 && r.t1.ms).map(r => r.t1.ms).sort((a, b) => a - b);
  console.log(`\n  T1 (${T1}; model ${JSON.stringify(t1.model)}): ` + Object.entries(o).map(([k, v]) => k + ' ' + v).join(', ') + (ms.length ? `; median ${ms[Math.floor(ms.length / 2)]} ms per case` : ''));
  const hs = rows.filter(r => r.c.set === 'heldout'); const oh = {}; for (const r of hs) { const x = byId.get(r.c.id); const s = x && x.t1 ? (x.t1.ok ? score(x.t1.mins, r.c) : 'rejected') : 'missing'; oh[s] = (oh[s] || 0) + 1; }
  console.log('    held-out: ' + Object.entries(oh).map(([k, v]) => k + ' ' + v).join(', '));
}
/* the bar this run holds: on the held-out set T0 must not be worse than the app on severe under-estimates, and must hit more */
const H = rows.filter(r => r.c.set === 'heldout'), hApp = tally(H, r => r.sa), hT0 = tally(H, r => r.s0q);
const ok = hT0.severe <= hApp.severe && hT0.hit > hApp.hit;
console.log(`\n  held-out bar: T0 severe ${hT0.severe} ≤ app ${hApp.severe} and hits ${hT0.hit} > ${hApp.hit} → ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);

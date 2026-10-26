/* The term's week 1, for ANY student (v76.8). It used to be ASU's Fall C 2026 as a constant, so another school's "now" week, the
   week labels in Class briefings and the recap's fallback date were wrong, and so was everyone's next semester. termStart() now
   comes from the student's own running courses. Pure node against the shipped source; the whole bank runs in two time zones.
   Run: node tools/test-term.js */
const fs = require('fs'), path = require('path'), {execFileSync} = require('child_process');
if (!process.env.LMK_TZ_CHILD) {
  let bad = 0;
  for (const tz of ['America/Phoenix', 'America/New_York', 'Europe/London']) { try { console.log(execFileSync('node', [__filename], {env: Object.assign({}, process.env, {LMK_TZ_CHILD: '1', TZ: tz}), encoding: 'utf8'}).replace(/^/gm, '[' + tz.split('/')[1] + '] ').trimEnd()); } catch (e) { bad++; console.log(String(e.stdout || e.message).replace(/^/gm, '[' + tz.split('/')[1] + '] ').trimEnd()); } }
  console.log(bad ? '\n' + bad + ' ZONE(S) FAILED' : '\nALL OK (3 time zones)'); process.exit(bad ? 1 : 0);
}
const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
const grab = n => { const i = src.indexOf('function ' + n + '('); if (i < 0) return ''; let d = 0, st = false; for (let j = i; j < src.length; j++) { const c = src[j]; if (c === '{') { d++; st = true; } else if (c === '}') { d--; if (st && !d) return src.slice(i, j + 1); } } };
let pass = 0, fail = 0; const check = (n, ok, d) => { console.log((ok ? 'ok   ' : 'FAIL ') + n + (ok ? '' : '  -> ' + JSON.stringify(d).slice(0, 240))); ok ? pass++ : fail++; };
const build = (events, nowD) => new Function('EVENTS', 'NOW', 'const FMT_DAY = new Intl.DateTimeFormat("en-US",{weekday:"short", month:"short", day:"numeric"}); const now = () => new Date(NOW); const startOfDay = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; }; const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };\n'
  + ['termStart', 'currentWeekNum', 'weekLabel', 'recapEnd'].map(grab).join('\n') + '\nreturn {termStart: typeof termStart === "function" ? termStart : null, currentWeekNum, weekLabel, recapEnd};')(events, nowD.getTime());
const D = (y, m, d, h = 23, mi = 59) => new Date(y, m - 1, d, h, mi);
const ev = (course, due) => ({course, due});
const ymd = d => d && `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function student(name, events, now, want, wantWeek, extra) {
  let L; try { L = build(events, now); } catch (e) { check(name + ': loads', false, String(e)); return; }
  if (!L.termStart) { check(name + ': termStart exists', false, 'no termStart'); return; }
  check(name + `: week 1 starts ${want}`, ymd(L.termStart()) === want, ymd(L.termStart()));
  check(name + `: it is week ${wantWeek}`, L.currentWeekNum() === wantWeek, L.currentWeekNum());
  if (extra) extra(L);
}
// 1 a fall semester that starts Aug 17 (the ASU-like case: first due Sunday of week 1, a late-start course in December)
student('fall semester', [ev('FMS', D(2026, 8, 23)), ev('MAT', D(2026, 8, 26)), ev('MAT', D(2026, 12, 7)), ev('DEV', D(2026, 12, 4)), ev('CIS', D(2026, 8, 27))], D(2026, 10, 26, 14), '2026-08-17', 11,
  L => check('fall semester: the label is the week\'s dates, never a bare number', L.weekLabel(10) === 'Mon, Oct 19 – Sun, Oct 25' && !/week/i.test(L.weekLabel(10)), L.weekLabel(10)));
// 2 a spring semester: a student at another school, another year
student('spring semester', [ev('BIO', D(2027, 1, 16)), ev('BIO', D(2027, 4, 30)), ev('ENG', D(2027, 1, 21)), ev('ENG', D(2027, 5, 7))], D(2027, 2, 10, 9), '2027-01-11', 5);
// 3 a quarter system: ten weeks, starting late September
student('quarter system', [ev('MATH', D(2026, 10, 2)), ev('MATH', D(2026, 12, 4)), ev('CHEM', D(2026, 10, 6)), ev('CHEM', D(2026, 12, 8))], D(2026, 11, 9, 20), '2026-09-28', 7);
// 4 fall courses finished (nothing due any more) and a spring course just begun: the finished term cannot pull week 1 back
student('new term, old courses finished', [ev('OLD', D(2026, 9, 1)), ev('OLD', D(2026, 12, 11)), ev('NEW', D(2027, 1, 22)), ev('NEW', D(2027, 5, 1))], D(2027, 1, 20, 10), '2027-01-18', 1);
// 5 no dated work at all
student('no dated work', [], D(2026, 10, 28, 12), '2026-10-26', 1, L => check('no dated work: no recap date either', L.recapEnd() === null, L.recapEnd()));
// 6 a summer session starting in June, checked on the Sunday of its week 2 (a Monday-start week boundary)
student('summer session, on a Sunday', [ev('HIST', D(2026, 6, 5)), ev('HIST', D(2026, 7, 24))], D(2026, 6, 14, 23), '2026-06-01', 2);
// 7 the recap: the last due date plus three days; a bad far-future date is ignored; no ASU date appears anywhere
{ const L = build([ev('A', D(2027, 5, 1)), ev('A', D(2028, 9, 1))], D(2027, 3, 1, 9));
  check('recap end: the last sane due date + 3 days, and a date years away is ignored', ymd(L.recapEnd()) === '2027-05-04', ymd(L.recapEnd()));
  const L2 = build([ev('A', D(2028, 9, 1))], D(2027, 3, 1, 9));
  check('recap end: only a far-future date, so the term\'s own length from its start stands in (not a school constant)', ymd(L2.recapEnd()) === ymd(new Date(L2.termStart().getTime() + 0) && (d => { d.setDate(d.getDate() + 16 * 7 + 7); return d; })(new Date(L2.termStart()))), ymd(L2.recapEnd())); }
check('the source has no fixed term start left', !/SEMESTER_WEEK1_MON/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'SEMESTER_WEEK1_MON still in the code');
console.log(fail ? `${fail} FAILED  (${pass} passed)` : `ALL OK  (${pass} passed)`); process.exit(fail ? 1 : 0);

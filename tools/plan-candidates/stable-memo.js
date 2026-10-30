/* RESULT: WORSE — late 19 vs 16 (three big things 3→4, missed days 6→8), moves 193 vs 220, planner-only moves 6 vs 6. A remembered later day keeps a piece off room that opened earlier; in an infeasible week every hour counts.
   Measured 2026-10-29 on the 11 tuning worlds (tools/bench-plan.js, student follows), kept as a record so nobody re-tries it blind.
Candidate stable-memo (2026-10-29, directive §2 "planning stability"): a per-device memory of where each piece was last shown, honoured while the day is still inside the piece's window and can take it within the hours; nothing else changes.
   The bench's attribution found v78.0's 220 overnight moves were 157 after a day the student fell short of the plan, 51 after work that ran
   past its estimate, 6 the planner's own; this candidate limits how far one slip cascades. localStorage 'lmk_planmemo' (this device only;
   a cleared browser forgets it). Measured by tools/bench-plan.js before anything reaches app/index.html. */
const STABLE_BAND = 0, STABLE_HYST = 0;
computePlan = function(){
  PLAN = {}; PLAN_DAY = {}; PLAN_OVER = [];
  const v1 = plannerV1();
  let memo = {}; try { memo = JSON.parse(localStorage.getItem('lmk_planmemo') || '{}') || {}; } catch (_) { memo = {}; }   // stable: where this device last showed each piece
  const n = now(), today = startOfDay(n), end = addDays(today, HORIZON);
  const chunks = [];
  /* A part must fit the smallest study day in view: with a 1h/day budget a 90-minute part never fitted anywhere
     and was forced onto its due day, over budget — the opposite of what the planner is for. Days set to 0h are
     days off and do not shrink the part. */
  let chunk = CHUNK;
  for (let i = 0; i <= HORIZON; i++) { const c = Math.round(capHours(addDays(today, i)) * 60); if (c > 0) chunk = Math.min(chunk, c); }
  chunk = Math.max(30, chunk);
  EVENTS.filter(open).filter(e => e.kind !== "inclass" && e.kind !== "fyi" && !e.exam).forEach(e => {   // an exam is not work; its study is (prepChunks)
    const late = e.due < n;
    if (late && !store.triaged[e.id]) return;              // overdue work joins the plan once you've chosen to keep it
    const dueDay = late ? end : lastWorkDay(e, today);       // late = as soon as there's room, never "must today"; a morning deadline's work is the day before (v76.7)
    let release;
    if (late) release = today;
    else if (v1 || (store.leadOv || {})[e.id] != null) release = planRelease(e, chunk);
    else { const own = planRelease(e, chunk), weekOut = addDays(dueDay, -WEEK_LEAD); release = weekOut < own ? weekOut : own; const op = opensAt(e); if (op && startOfDay(op) > release) release = startOfDay(op); }
    if (release > dueDay) release = dueDay;
    if (release < today) release = today;
    if (release > end) return;
    const piece = late && !v1 ? 30 : chunk;                  // overdue work in 30-minute pieces, as many as fit a day, merged into one row below
    let left = remainingMins(e), parts = Math.ceil(left / piece), i = 0;
    while (left > 0) { const m = Math.min(piece, left); chunks.push({e, mins:m, part:++i, parts, release, dueDay, late, day:null, memo: e.id + '#' + i}); left -= m; }
  });
  chunks.push(...prepChunks(today, end));
  /* What is needed first comes first. A study session ranks by its EXAM's day, not its own: ranked by its own day it
     always looked the most urgent thing on the list, and "Study for MAT 210 Exam 2" sat above homework due Sunday and
     Monday (Emiel, 2026-10-10: "it should be showing the assignment first, as it is stuff I need before the exam"). */
  const need = c => c.prep ? startOfDay(c.prep.x.due) : c.dueDay;
  chunks.sort((a, b) => (a.late ? 0 : 1) - (b.late ? 0 : 1) || need(a) - need(b) || (a.prep ? 1 : 0) - (b.prep ? 1 : 0) || a.release - b.release || b.mins - a.mins);
  const days = [], byKey = {};
  for (let i = 0; i <= HORIZON; i++){
    const d = addDays(today, i), k = dayKey(d), full = Math.round(capHours(d) * 60);
    let cap = i === 0 ? Math.min(full, Math.max(0, Math.round((addDays(today, 1) - n) / 6e4))) : full;
    if (calOn() && CAL.busy) cap = Math.min(cap, calFreeMins(d));
    const day = {key:k, date:d, cap, capFull: full, mins:0, items:[], over:0}; PLAN[k] = day; days.push(day); byKey[k] = day;
  }
  /* pass 1 (stable): each piece, in the order of need, takes the day this device last showed it on when that day is still inside its
     window and can still take it (no other part of the same thing there; within the hours, plus STABLE_BAND minutes of tolerance for a
     remembered piece); otherwise the earliest day with room, as before; a due piece that fits nowhere lands on its due day over the
     hours, as before. Same result as the day-by-day fill when nothing is remembered. */
  for (const c of chunks){
    const lo = c.release > today ? c.release : today, hi = c.dueDay < end ? c.dueDay : end, key = c.grp || c.e.id;
    const take = (day, band) => (c.late || !day.items.some(x => (x.grp || x.e.id) === key)) && day.mins + c.mins <= day.cap + band;
    let placed = null;
    const mk = !c.prep && !c.late ? memo[c.memo] : null;
    if (mk && byKey[mk]) { const md = byKey[mk]; if (md.date >= lo && md.date <= hi && take(md, STABLE_BAND)) placed = md; }
    if (!placed) for (const day of days) { if (day.date < lo) continue; if (day.date > hi) break; if (take(day, 0)) { placed = day; break; } }
    if (!placed && !c.late && !c.prep && c.dueDay <= end) placed = byKey[dayKey(c.dueDay)];   // must: its due day, over the hours
    if (placed) { c.day = placed.key; placed.items.push(c); placed.mins += c.mins; }
  }
  // pass 2a — relief: an overflowing day hands work to the latest earlier day with room, even before the lead time opens.
  // This is the "one a day beats one night" move.
  for (let i = days.length - 1; i > 0; i--){
    const day = days[i];
    if (day.mins <= day.cap) continue;
    const movable = day.items.filter(c => !c.late).sort((a, b) => b.mins - a.mins);
    for (const c of movable){
      if (day.mins <= day.cap) break;
      for (let j = i - 1; j >= 0; j--){
        const t = days[j];
        if (t.mins + c.mins > t.cap || t.items.some(x => (x.grp || x.e.id) === (c.grp || c.e.id)) || (c.prep && t.date < addDays(c.release, -2))) continue;
        { const op = !c.prep && opensAt(c.e); if (op && t.date < startOfDay(op)) continue; }   // the pull never lands before the LMS opens it
        day.items.splice(day.items.indexOf(c), 1); day.mins -= c.mins;
        t.items.push(c); t.mins += c.mins; c.day = t.key; c.pulled = "over"; c.fromDate = day.date;
        break;
      }
    }
  }
  // pass 2b — levelling (v78.0): a later day hands a piece to the latest earlier day that can take it while the earlier day ends no
  // heavier in minutes. The hours are not a wall here; what is left of today and a day with no hours at all are.
  if (!v1) {
    const leftToday = Math.max(0, Math.round((addDays(today, 1) - n) / 6e4));
    const canTake = (t, c, j) => { if (t.cap <= 0 || (j === 0 && t.mins + c.mins > leftToday) || t.items.some(x => (x.grp || x.e.id) === (c.grp || c.e.id)) || (c.prep && t.date < addDays(c.release, -2))) return false;
      const op = !c.prep && opensAt(c.e); return !(op && t.date < startOfDay(op)); };
    for (let sweep = 0, moved = true; moved && sweep < 80; sweep++){
      moved = false;
      for (let i = days.length - 1; i > 0; i--){
        const day = days[i];
        const movable = day.items.filter(c => !c.late).sort((a, b) => b.mins - a.mins || need(a) - need(b));
        for (const c of movable){
          for (let j = i - 1; j >= 0; j--){
            const t = days[j];
            if (!canTake(t, c, j) || t.mins + c.mins > day.mins - c.mins - STABLE_HYST) continue;   // stable: a move needs a margin
            day.items.splice(day.items.indexOf(c), 1); day.mins -= c.mins;
            t.items.push(c); t.mins += c.mins; c.day = t.key; c.pulled = c.pulled || "level"; c.fromDate = day.date; moved = true;
            break;
          }
        }
      }
    }
    for (const day of days) { const one = new Map(); day.items = day.items.filter(c => { if (!c.late) return true; const k = c.e.id, f = one.get(k); if (f) { f.mins += c.mins; return false; } one.set(k, c); c.part = 1; c.parts = 1; return true; }); }   // one row per overdue thing per day
  }
  days.forEach(day => {
    day.over = Math.max(0, day.mins - day.cap);
    day.items.sort((a, b) => (a.late ? 0 : 1) - (b.late ? 0 : 1) || need(a) - need(b) || (a.prep ? 1 : 0) - (b.prep ? 1 : 0) || b.mins - a.mins);
    day.items.forEach(c => { if (!PLAN_DAY[c.e.id]) PLAN_DAY[c.e.id] = day.key; });
  });
  /* Parts are numbered in date order (v76.2). A 30-minute part that fitted the end of today used to read "part 2 of 2" above
     tomorrow's "part 1 of 2" (test-planner's dense week). The numbers are labels only; a study session keeps its own. */
  { const byE = new Map();
    for (const day of days) for (const c of day.items) if (!c.prep && c.parts > 1) { if (!byE.has(c.e.id)) byE.set(c.e.id, []); byE.get(c.e.id).push([day.date, c]); }
    for (const list of byE.values()) list.sort((a, b) => a[0] - b[0] || b[1].mins - a[1].mins).forEach(([, c], i) => { c.part = i + 1; }); }
  PLAN_OVER = days.filter(d => d.mins > d.cap).map(d => d.key);
  { const m2 = {}; for (const day of days) for (const c of day.items) if (!c.prep && !c.late && c.memo) m2[c.memo] = day.key; try { localStorage.setItem('lmk_planmemo', JSON.stringify(m2)); } catch (_) {} }
  try { calAssignTimes(); } catch(_) { PLAN_TIME = new Map(); }
}

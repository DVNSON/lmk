/* Candidate: a study session never forces a day over budget (2026-10-28). Found by bench-plan.js in the heavy-exam week: prepChunks
   gives each session a dueDay of the NEXT day so it may slip once, and computePlan then treats that slip day as a deadline (must) —
   the session forces itself in over budget (H4) and past the one-session-per-exam-per-day check (H6). This is the shipped
   computePlan (v77.0) with one token changed on the `must` line; a session that cannot fit by its slip day is left for prepPlan to
   re-spread tomorrow, which is what its own spec says ("skipping one leaves no debt"). Bench only; nothing here is in app/index.html. */
computePlan = function(){
  PLAN = {}; PLAN_DAY = {}; PLAN_OVER = [];
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
    let release = late ? today : planRelease(e, chunk);
    if (release > dueDay) release = dueDay;
    if (release < today) release = today;
    if (release > end) return;
    let left = remainingMins(e), parts = Math.ceil(left / chunk), i = 0;
    while (left > 0) { const m = Math.min(chunk, left); chunks.push({e, mins:m, part:++i, parts, release, dueDay, late, day:null}); left -= m; }
  });
  chunks.push(...prepChunks(today, end));
  /* What is needed first comes first. A study session ranks by its EXAM's day, not its own: ranked by its own day it
     always looked the most urgent thing on the list, and "Study for MAT 210 Exam 2" sat above homework due Sunday and
     Monday (Emiel, 2026-10-10: "it should be showing the assignment first, as it is stuff I need before the exam"). */
  const need = c => c.prep ? startOfDay(c.prep.x.due) : c.dueDay;
  chunks.sort((a, b) => (a.late ? 0 : 1) - (b.late ? 0 : 1) || need(a) - need(b) || (a.prep ? 1 : 0) - (b.prep ? 1 : 0) || a.release - b.release || b.mins - a.mins);
  const days = [];
  // pass 1 — forward fill: earliest-due first, only once the lead time opens, up to the day's budget
  for (let i = 0; i <= HORIZON; i++){
    const d = addDays(today, i), k = dayKey(d), full = Math.round(capHours(d) * 60);
    /* Today only has what is left of it (v72.1): at 10:30 PM a 3-hour budget is 90 minutes, not 3 hours of plan. */
    let cap = i === 0 ? Math.min(full, Math.max(0, Math.round((addDays(today, 1) - n) / 6e4))) : full;
    if (calOn() && CAL.busy) cap = Math.min(cap, calFreeMins(d));   // a connected calendar: never more than the day's free study time (v73.0)
    const day = {key:k, date:d, cap, capFull: full, mins:0, items:[], over:0};
    const seen = new Set();
    for (const c of chunks){
      if (c.day || c.release > d || c.dueDay < d) continue;
      const must = !c.late && !c.prep && c.dueDay.getTime() === d.getTime();   // CANDIDATE: a study session is never due; its slip day must not force a day over budget or skip the one-per-exam check
      const fits = day.mins + c.mins <= cap;   // never plan past the budget; only same-day deadlines can force it over
      if (!must && (seen.has(c.grp || c.e.id) || !fits)) continue;   // one part a day, and one study session a day per exam
      c.day = k; day.items.push(c); day.mins += c.mins; seen.add(c.grp || c.e.id);
    }
    PLAN[k] = day; days.push(day);
  }
  // pass 2 — backward relaxation: an overflowing day hands work to the latest earlier day with room,
  // even before the lead time opens. This is the "one a day beats one night" move.
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
        t.items.push(c); t.mins += c.mins; c.day = t.key; c.pulled = true;
        break;
      }
    }
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
  try { calAssignTimes(); } catch(_) { PLAN_TIME = new Map(); }
};

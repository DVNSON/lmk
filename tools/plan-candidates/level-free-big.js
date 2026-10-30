/* RESULT: WORSE in 'conflicting priorities' (4 late vs 3, 980 vs 874 min) — balancing can only move a piece when the earlier day ends no heavier, so a light day took small things and never the big one, and the head start that used to give the 10-hour paper its early minutes was crowded out. Pulling the largest piece first changed nothing. Led to week-fill.
   Candidate level-free-big (2026-10-28): level-free, pulling the largest piece first. Emiel, same day, after seeing level-week stop at
   the budget: "Don't worry about the budgets for students, make the plans based on the assignments, due dates, and whatever else
   you think." This copy of computePlan differs from the app's only in pass 2. Measured by tools/bench-plan.js before anything
   reaches app/index.html. */
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
      /* A study session is never due (v77.1). prepChunks gives it the next day as its dueDay so it may slip once; treating that slip
         day as a deadline forced it onto a full day over budget and past the one-session-a-day check (bench-plan, heavy exam week:
         Thursday 145/120 while Friday sat at 50). A session that cannot fit by its slip day is left out of this plan; prepPlan
         re-spreads the sessions left tomorrow ("skipping one leaves no debt"). */
      const must = !c.late && !c.prep && c.dueDay.getTime() === d.getTime();
      const fits = day.mins + c.mins <= cap;   // never plan past the budget; only same-day deadlines can force it over
      if (!must && (seen.has(c.grp || c.e.id) || !fits)) continue;   // one part a day, and one study session a day per exam
      c.day = k; day.items.push(c); day.mins += c.mins; seen.add(c.grp || c.e.id);
    }
    PLAN[k] = day; days.push(day);
  }
  /* pass 2 — relief, then levelling without the budget (candidate level-free). Emiel, 2026-10-28: "don't worry about the budgets
     for students, make the plans based on the assignments, due dates, and whatever else you think". Relief first, as shipped: an
     over-budget day hands work to the latest earlier day with room, even before the lead time opens. Then levelling: a later day
     hands a part to the latest earlier day that can take it while, after the move, the earlier day is no heavier IN MINUTES than
     the day it leaves. The hours a student typed (or the 2 h default nobody typed, since v74.5) no longer keep a free Wednesday
     from taking Friday's load, and a week that cannot fit its hours is spread over its days instead of dumped on the due day.
     What still binds: what is left of today, a day with no hours at all (0 h, or a calendar with no free time), one part of a
     thing a day, a study session at most two days before its release, never before the LMS opens it. Parts are offered largest
     first (then soonest due), so a free day takes a first pass on the big thing before a handful of small ones. Every move goes earlier, so the sweeps end; the guard is belt and braces. */
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
        t.items.push(c); t.mins += c.mins; c.day = t.key; c.pulled = "over"; c.from = day.key;
        break;
      }
    }
  }
  const leftToday = Math.max(0, Math.round((addDays(today, 1) - n) / 6e4));
  const canTake = (t, c, j) => { if (t.cap <= 0 || (j === 0 && t.mins + c.mins > leftToday) || t.items.some(x => (x.grp || x.e.id) === (c.grp || c.e.id)) || (c.prep && t.date < addDays(c.release, -2))) return false;
    const op = !c.prep && opensAt(c.e); return !(op && t.date < startOfDay(op)); };
  for (let sweep = 0, moved = true; moved && sweep < 80; sweep++){
    moved = false;
    for (let i = days.length - 1; i > 0; i--){
      const day = days[i];
      const movable = day.items.filter(c => !c.late).sort((a, b) => b.mins - a.mins || need(a) - need(b));   // the biggest piece first: a first pass on the big thing beats one more small thing (the head start's own rule; need-first pulled the small things and the 10-hour paper lost its early minutes, bench 2026-10-28)
      for (const c of movable){
        for (let j = i - 1; j >= 0; j--){
          const t = days[j];
          if (!canTake(t, c, j) || t.mins + c.mins > day.mins - c.mins) continue;   // the earlier day ends no heavier than the day the part leaves
          day.items.splice(day.items.indexOf(c), 1); day.mins -= c.mins;
          t.items.push(c); t.mins += c.mins; c.day = t.key; c.pulled = c.pulled || "level"; c.from = day.key; moved = true;
          break;
        }
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

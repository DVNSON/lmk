/* RESULT (bench 2026-10-28, improved student): a wash — identical to v77.1 in 10 worlds, one late-day more in 'conflicting priorities'. Fixed Emiel's week within the budget; superseded by his directive to stop treating the hours as a wall.
   Candidate level-week (2026-10-28): level the week — the week the student sees, any load. Emiel: "it's putting almost all the assignments that are due Friday,
   to do them on Friday, when I have like 1 assignment to do today and tomorrow." The shipped pass 2 moves work earlier only when
   a day is OVER budget; a Friday at 100 % of budget beside a Wednesday at 10 % was a fine week to it. This copy of computePlan
   differs from the app's only in pass 2. Measured by tools/bench-plan.js before anything reaches app/index.html. */
const LEVEL_DAYS = 7, LEVEL_FLOOR = 0;
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
  /* pass 2 — relief, then levelling (candidate level-week). Relief is the shipped move: an over-budget day hands work to the
     latest earlier day with room, even before the lead time opens. Levelling is new: a later day within LEVEL_DAYS hands a part
     to the latest earlier day that can take it while, after the move, the earlier day is no heavier (planned minutes over
     budget) than the day it leaves — so Friday's six things do not stay Friday's problem while Wednesday sits empty. A day
     under LEVEL_FLOOR of its budget is left alone. Every move goes earlier, so the sweeps end; the guard is belt and braces.
     The same guards as relief: it must fit, one part of a thing a day, a study session at most two days before its release,
     never before the LMS opens the item. */
  const ratio = d => d.cap > 0 ? d.mins / d.cap : (d.mins > 0 ? Infinity : 0);
  const canTake = (t, c) => { if (t.mins + c.mins > t.cap || t.items.some(x => (x.grp || x.e.id) === (c.grp || c.e.id)) || (c.prep && t.date < addDays(c.release, -2))) return false;
    const op = !c.prep && opensAt(c.e); return !(op && t.date < startOfDay(op)); };
  for (let sweep = 0, moved = true; moved && sweep < 60; sweep++){
    moved = false;
    for (let i = days.length - 1; i > 0; i--){
      const day = days[i];
      if (day.mins <= day.cap && (i > LEVEL_DAYS || ratio(day) < LEVEL_FLOOR)) continue;
      const movable = day.items.filter(c => !c.late).sort((a, b) => b.mins - a.mins);
      for (const c of movable){
        const over = day.mins > day.cap;
        for (let j = i - 1; j >= 0; j--){
          const t = days[j];
          if (!canTake(t, c)) continue;
          if (!over && (t.mins + c.mins) / t.cap > (day.mins - c.mins) / day.cap) continue;   // levelling: the earlier day ends no heavier
          day.items.splice(day.items.indexOf(c), 1); day.mins -= c.mins;
          t.items.push(c); t.mins += c.mins; c.day = t.key; c.pulled = over ? "over" : "level"; c.from = day.key; moved = true;
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

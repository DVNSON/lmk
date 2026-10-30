/* Baseline deadline-sort (2026-10-28): what a student gets from Canvas's own list — everything on its due day, in due order, whole,
   no study sessions, no hours, no head starts. Never a candidate to ship: the floor the planners are measured against (the follow-up
   directive's "simple Canvas deadline sorting"). A morning deadline's work lands the day before, as the app's lastWorkDay reads it. */
computePlan = function(){
  PLAN = {}; PLAN_DAY = {}; PLAN_OVER = [];
  const n = now(), today = startOfDay(n), end = addDays(today, HORIZON), days = [];
  for (let i = 0; i <= HORIZON; i++) { const d = addDays(today, i), k = dayKey(d), full = Math.round(capHours(d) * 60); const cap = i === 0 ? Math.min(full, Math.max(0, Math.round((addDays(today, 1) - n) / 6e4))) : full; const day = {key: k, date: d, cap, capFull: full, mins: 0, items: [], over: 0}; PLAN[k] = day; days.push(day); }
  EVENTS.filter(open).filter(e => e.kind !== "inclass" && e.kind !== "fyi" && !e.exam).forEach(e => {
    const late = e.due < n; if (late && !store.triaged[e.id]) return;
    const d = late ? today : lastWorkDay(e, today); if (d > end) return;
    const day = PLAN[dayKey(d)]; if (!day) return;
    const c = {e, mins: remainingMins(e), part: 1, parts: 1, release: d, dueDay: late ? end : d, late, day: day.key};
    day.items.push(c); day.mins += c.mins; if (!PLAN_DAY[e.id]) PLAN_DAY[e.id] = day.key;
  });
  days.forEach(day => { day.over = Math.max(0, day.mins - day.cap); day.items.sort((a, b) => (a.late ? 0 : 1) - (b.late ? 0 : 1) || a.e.due - b.e.due); });
  PLAN_OVER = days.filter(d => d.mins > d.cap).map(d => d.key);
  try { calAssignTimes(); } catch(_) { PLAN_TIME = new Map(); }
};
computeAhead = function(){ AHEAD = {}; AHEAD_WEEK = ""; };   // Canvas offers no head starts

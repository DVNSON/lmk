/* Candidate: the plan sees partial progress (2026-10-28). In the shipped app remainingMins is learnedMins x (1 - Canvas score);
   the sprint and tab minutes a student has already put into an item (store.spent, store.tab) are never subtracted, so a paper
   worked on for two days with no score yet is re-planned in full each morning. This subtracts them, and keeps the Canvas score
   rule when there is one. Evaluated by tools/bench-plan.js only; nothing here is in app/index.html.
   RESULT (2026-10-28 baseline run): WORSE — 27 late vs 19, rescued 1005 min vs 165: a low estimate minus spent minutes leaves a
   10-minute sliver and the rest lands on the due day. Kept as the record of why "just subtract the sprint minutes" is wrong. */
remainingMins = function(e){
  const pr = extProgress(e), base = learnedMins(e).mins;
  if (pr != null) return Math.max(10, Math.round(base * (1 - pr / 100)));
  const spent = ((store.spent || {})[e.id] || 0) + ((store.tab || {})[e.id] || 0);
  return Math.max(10, Math.round(base - spent));
};

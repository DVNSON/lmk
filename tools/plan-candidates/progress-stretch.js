/* Candidate: progress-aware, and the estimate stretches when it was low (2026-10-28). plan-candidates/progress.js alone made
   things worse in the bench: subtracting spent minutes from a low estimate leaves a 10-minute sliver, the student is not done,
   and the rest lands on the due day. Here, once a student has put in three quarters of the guess with no finish, the guess is
   taken as 60% of the truth (the item is bigger than thought), and what is planned is the rest of THAT. Hypothesis, measured
   by tools/bench-plan.js only; nothing here is in app/index.html.
   RESULT (2026-10-28 baseline run): a lead, not a change — wins the 8-hour-paper world (0 late vs 1) but loses limited time, missed
   days and conflicting priorities (23 late vs 19 overall, over-budget minutes 517 vs 165). */
remainingMins = function(e){
  const pr = extProgress(e), base = learnedMins(e).mins;
  if (pr != null) return Math.max(10, Math.round(base * (1 - pr / 100)));
  const spent = ((store.spent || {})[e.id] || 0) + ((store.tab || {})[e.id] || 0);
  if (!spent) return base;
  const est = spent >= base * 0.75 ? Math.max(base, spent / 0.6) : base;
  return Math.max(15, Math.round(est - spent));
};

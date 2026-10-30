/* RESULT: WORSE — late 17 vs 16, idle 4603, prep 12/18, moves 252. The lower quartile under-plans harder than the median.
   Measured 2026-10-29 on the 11 tuning worlds (tools/bench-plan.js, student follows), kept as a record so nobody re-tries it blind.
Candidate learned-hours-p25 (2026-10-29, directive §2): plan to the hours the student has actually been completing, not the hours they typed.
   The bench's attribution: 157 of v78.0's 220 overnight moves follow a day the student left part of the plan undone — the student truly
   has fewer hours than the setting (which almost nobody typed since v74.5). A plan log on this device (localStorage 'lmk_planlog': each
   morning's first plan — minutes per piece) is compared with the done marks the next morning; the lower quartile of the last 14 such days' done
   share (days with at least an hour planned, at least 5 of them) scales every day's hours, never below half. Nothing is timed: a finish
   counts its planned minutes, nothing else. Measured by tools/bench-plan.js before anything reaches app/index.html. */
(function(){
  const LOG = 'lmk_planlog', Q = 0.25;
  const read = () => { try { return JSON.parse(localStorage.getItem(LOG) || '{}') || {}; } catch (_) { return {}; } };
  const __ch = capHours;
  let ratio = 1, ratioDay = '';
  function learnRatio(){
    const today = dayKey(startOfDay(now())); if (ratioDay === today) return ratio; ratioDay = today;
    const log = read(), days = Object.keys(log).filter(k => k < today).sort().slice(-14), shares = [];
    for (const k of days) { const d = log[k]; if (!d || d.p < 60) continue; let done = 0;
      for (const id in d.items) { if (id.startsWith('prep:')) { const pd = (store.prepDone || {})[id.slice(5)]; if (pd && dayKey(new Date(pd.at)) === k) done += d.items[id]; }
        else { const t = store.done[id]; if (t && dayKey(new Date(t)) === k) done += d.items[id]; } }
      shares.push(Math.min(1, done / d.p)); }
    if (shares.length < 5) return ratio = 1;
    shares.sort((a, b) => a - b); const i = Math.min(shares.length - 1, Math.floor(Q * shares.length));
    return ratio = Math.max(0.5, shares[i]);
  }
  capHours = function(d){ return __ch(d) * learnRatio(); };
  const __cp = computePlan;
  computePlan = function(){
    __cp();
    const today = dayKey(startOfDay(now())), log = read();
    if (!log[today]) { const day = PLAN[today]; if (day) { const items = {}; let p = 0; for (const c of day.items) { const id = c.prep ? 'prep:' + c.prep.x.key + '#' + c.prep.s.n : c.e.id; items[id] = (items[id] || 0) + c.mins; p += c.mins; }
      log[today] = {p, items}; for (const k of Object.keys(log)) if (k < today && Object.keys(log).length > 30) delete log[k]; try { localStorage.setItem(LOG, JSON.stringify(log)); } catch (_) {} } }
  };
})();

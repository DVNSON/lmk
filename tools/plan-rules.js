/* The planner's rule checker and metrics, shared by tools/test-planner.js (the suite) and tools/bench-plan.js (the semester
   simulator). One copy on purpose: a rule that lives in two files drifts. It is a string, evaluated inside the app's page by
   CDP, so it can read PLAN, EVENTS and store directly. Returns JSON: v (violations of H1-H11; H4 is the levelling rule since v78.0; overDays/overMins compare with d.cap, the physical room, since v79.0), cum (minutes per item per day),
   ms, chunks, prep, overDays, overMins, night, map (item#part -> day). */
const CHECK = `(function(){
  const t0 = performance.now(); computePlan(); const ms = performance.now() - t0;
  const days = Object.values(PLAN).sort((a, b) => a.date - b.date), v = [], today = startOfDay(now()), end = addDays(today, HORIZON);
  const all = []; days.forEach(d => d.items.forEach(c => all.push([d, c])));
  for (const [d, c] of all) {
    const e = c.e, id = e.id;
    if (c.prep) { if (d.date > startOfDay(c.prep.x.due)) v.push('H1 study after its exam: ' + id + ' on ' + d.key); continue; }
    if (store.done[id]) v.push('H3 done work planned: ' + id);
    if (store.dropped[id]) v.push('H3 dropped work planned: ' + id);
    if (e.exam || e.kind === 'inclass' || e.kind === 'fyi') v.push('H3 not work, planned: ' + id + ' (' + (e.exam ? 'exam' : e.kind) + ')');
    if (!c.late && d.date > startOfDay(e.due)) v.push('H1 after its due day: ' + id + ' on ' + d.key);
    if (!c.late && !e.allDay && e.due.getHours() < 12 && startOfDay(e.due) > today && d.date.getTime() === startOfDay(e.due).getTime()) v.push('H11 work due before noon planned on its due day: ' + id + ' on ' + d.key + ' (due ' + e.due.toTimeString().slice(0, 5) + ')');
    const op = opensAt(e); if (op && d.date < startOfDay(op)) v.push('H2 before it opens: ' + id + ' on ' + d.key);
    if (c.late && !store.triaged[id]) v.push('H5 overdue work planned without being kept: ' + id);
  }
  for (const d of days) {
    const must = d.items.filter(c => !c.late && !c.prep && (typeof lastWorkDay === 'function' ? lastWorkDay(c.e, today) : startOfDay(c.e.due)).getTime() === d.date.getTime());
    /* H4 since v78.0: work never waits on a heavier day while an earlier day could take it and end no heavier — with the planner's own
       guards (the earlier day has room, today only what is left of it, no part of the same thing there, a study session at most two
       days before its slot, not before the LMS opens it; overdue work is not moved). Until v78.0 it was "never over budget with work not
       due that day"; since v79.0 there are no hours at all (d.cap is what is physically left of a day, Infinity for most days). */
    for (const c of d.items) { if (c.late) continue; const key = c.grp || c.e.id, op = c.prep ? null : opensAt(c.e); let hit = null;
      for (const t of days) { if (t.date >= d.date) break; if (t.cap <= 0 || t.items.some(x => (x.grp || x.e.id) === key) || (c.prep && t.date < addDays(c.release, -2)) || (op && t.date < startOfDay(op))) continue;
        const leftT = t.date.getTime() === today.getTime() ? Math.max(0, Math.round((addDays(today, 1) - now()) / 6e4)) : Infinity;
        if (t.mins + c.mins <= leftT && t.mins + c.mins <= d.mins - c.mins) { hit = t; break; } }
      if (hit) { v.push('H4 work waits on a heavier day: ' + (c.prep ? 'study' : c.e.id) + ' ' + c.mins + 'm on ' + d.key + ' (' + d.mins + 'm) while ' + hit.key + ' holds ' + hit.mins + 'm'); break; } }
    const ids = d.items.filter(c => !must.includes(c)).map(c => c.grp || c.e.id);
    if (new Set(ids).size !== ids.length) v.push('H6 two parts of one thing on one day: ' + d.key);
  }
  const lost = [];
  EVENTS.filter(open).filter(e => e.kind !== 'inclass' && e.kind !== 'fyi' && !e.exam && e.due >= now() && startOfDay(e.due) <= end && !store.done[e.id] && !store.dropped[e.id]).forEach(e => {
    const placed = all.filter(([d, c]) => !c.prep && c.e.id === e.id).reduce((s, [d, c]) => s + c.mins, 0);
    if (placed < remainingMins(e)) lost.push(e.id + ' ' + placed + '/' + remainingMins(e));
  });
  if (lost.length) v.push('H7 due in the window but not fully planned: ' + lost.join(', '));
  const td = PLAN[dayKey(today)]; if (td && td.cap > Math.ceil((addDays(today, 1) - now()) / 6e4) + 1) v.push('H8 today holds ' + td.cap + ' min, more than is left of it');
  const overDays = days.filter(d => d.mins > d.cap);
  const night = new Set(all.filter(([d, c]) => !c.late && !c.prep && c.parts > 1 && startOfDay(c.e.due).getTime() === d.date.getTime() && days.some(x => x.date < d.date && x.date >= startOfDay(c.release) && x.mins + c.mins <= x.cap)).map(([d, c]) => c.e.id)).size;
  const order = {}; for (const [d, c] of all) if (!c.prep && c.parts > 1) (order[c.e.id] = order[c.e.id] || []).push([d.key, c.part]);
  for (const id in order) { const p = order[id].sort((a, b) => a[0].localeCompare(b[0])).map(x => x[1]); if (p.some((x, i) => i && x < p[i - 1])) v.push('H10 parts out of order by date: ' + id + ' ' + JSON.stringify(order[id])); }
  const cum = {}; for (const [d, c] of all) if (!c.prep) (cum[c.e.id] = cum[c.e.id] || {})[d.key] = ((cum[c.e.id] || {})[d.key] || 0) + c.mins;
  return JSON.stringify({v, cum, ms: Math.round(ms * 10) / 10, chunks: all.length, prep: all.filter(([d, c]) => c.prep).length, overDays: overDays.length, overMins: overDays.reduce((s, d) => s + d.mins - d.cap, 0), night,
    map: Object.fromEntries(all.filter(([d, c]) => !c.prep).map(([d, c]) => [c.e.id + '#' + c.part, d.key]))});
})()`;
module.exports = {CHECK};

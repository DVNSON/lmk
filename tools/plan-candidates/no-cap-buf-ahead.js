/* RESULT: CLOSE — 2 h late 14 / 2230 min / 26 days; 1 h 60 / 6162; 3 h 7 / 1470. — variant: buffer day plus the daily head start
   Measured 2026-10-29/30 (tools/bench-plan.js: 11 tuning worlds, --hours 1/2/3, --set heldout, --student x5; logs ~/lmk-docs/bench/2026-10-29-no-cap-*.txt). */
window.__NOCAP = {buffer: 1, ahead: 'always'};
/* Candidate no-cap (2026-10-29, fourth directive, Phases 1-2): the planner with no assumed daily hours at all. Nothing reads store.capacity,
   store.capOv or CAP_DEFAULT. The only limits on a day are physical: what is left of today, and a connected calendar's free minutes (real
   events, not an assumption). Three rules replace "fill each day to its hours":
     1. A thing is cut into parts by the days it has, not by a fixed 90 minutes alone: as many parts as the work days between its release
        and its last work day can hold one a day, never more than ceil(minutes / 90). A deadline that leaves two days makes two bigger parts,
        instead of one part a day and the rest piled on the due day. (slotParts: false = fixed 90-minute parts, for the comparison.)
     2. Each day takes its SHARE of the released work: for every later day f, the released, unplaced work due by f divided by the days from
        here to f that can hold work; the largest such ratio is the day's share, and the day fills soonest-due first until it reaches it.
        That is the smallest even load that still meets every deadline in view (the water level); it rises with the workload and never with
        a setting. Work due that day is placed whatever the share.
     3. Relief and levelling as v78.0 (a day over its physical room hands work back; a later day hands a piece to the latest earlier day that
        ends no heavier), overdue work in 30-minute pieces merged into one row per day.
   A head start (computeAhead) is offered when today is lighter than the week's own average day, by the gap up to it (at most one part):
   the yardstick is the student's week, not a number of hours. */
const __O = Object.assign({lead: 7, slotParts: true, margin: 1, buffer: 0, ahead: 'gap'}, window.__NOCAP || {});
/* margin: the share is computed on each piece's minutes times this (or times the T0 hint's hi/mins when the estimate has a range) — the plan
   starts early enough for work that runs past its estimate, which the bench says it does (truth ~1.2x, wide). buffer: the share treats a thing
   as due that many days before its last work day when its window allows — the margin in days instead of minutes. Neither is a number of hours. */
const __sharePiece = c => c.prep || c.late ? c.mins : Math.round(c.mins * (__O.margin > 1 && c.hintHi ? Math.max(1, Math.min(__O.margin, c.hintHi)) : __O.margin));
const __shareDue = c => (c.prep || c.late || __O.buffer <= 0) ? c.dueDay : (() => { const b = addDays(c.dueDay, -__O.buffer); return b < c.release ? c.dueDay : b; })();
capHours = function(){ return 24; };   // never read here; kept so nothing that still calls it throws
computePlan = function(){
  PLAN = {}; PLAN_DAY = {}; PLAN_OVER = [];
  const n = now(), today = startOfDay(n), end = addDays(today, HORIZON);
  const leftToday = Math.max(0, Math.round((addDays(today, 1) - n) / 6e4));
  const days = [];
  for (let i = 0; i <= HORIZON; i++) { const d = addDays(today, i); let room = i === 0 ? leftToday : Infinity; if (calOn() && CAL.busy) room = Math.min(room, calFreeMins(d)); days.push({key: dayKey(d), date: d, cap: room, capFull: room, mins: 0, items: [], over: 0}); }
  const slotsBetween = (a, b) => days.filter(x => x.date >= a && x.date <= b && x.cap > 0).length;
  const chunks = [];
  EVENTS.filter(open).filter(e => e.kind !== "inclass" && e.kind !== "fyi" && !e.exam).forEach(e => {
    const late = e.due < n;
    if (late && !store.triaged[e.id]) return;
    const dueDay = late ? end : lastWorkDay(e, today);
    let release;
    if (late) release = today;
    else if ((store.leadOv || {})[e.id] != null) release = planRelease(e, CHUNK);
    else { const own = planRelease(e, CHUNK), weekOut = addDays(dueDay, -__O.lead); release = weekOut < own ? weekOut : own; const op = opensAt(e); if (op && startOfDay(op) > release) release = startOfDay(op); }
    if (release > dueDay) release = dueDay;
    if (release < today) release = today;
    if (release > end) return;
    let left = remainingMins(e), i = 0;
    const parts = late ? Math.ceil(left / 30) : Math.max(1, Math.min(Math.ceil(left / CHUNK), __O.slotParts ? Math.max(1, slotsBetween(release, dueDay)) : Infinity));
    const piece = late ? 30 : Math.max(5, Math.ceil(left / parts / 5) * 5);
    const lm = learnedMins(e), hintHi = lm.hint && lm.hint.mins > 0 ? lm.hint.hi / lm.hint.mins : 0;
    while (left > 0) { const m = Math.min(piece, left); chunks.push({e, mins: m, part: ++i, parts, release, dueDay, late, day: null, hintHi}); left -= m; }
  });
  chunks.push(...prepChunks(today, end));
  const need = c => c.prep ? startOfDay(c.prep.x.due) : c.dueDay;
  chunks.sort((a, b) => (a.late ? 0 : 1) - (b.late ? 0 : 1) || need(a) - need(b) || (a.prep ? 1 : 0) - (b.prep ? 1 : 0) || a.release - b.release || b.mins - a.mins);
  // pass 1 — each day takes its share of the released work, soonest-due first
  for (let i = 0; i <= HORIZON; i++) {
    const day = days[i], d = day.date, seen = new Set();
    let share = 0;
    if (day.cap > 0) {
      const pend = chunks.filter(c => !c.day && c.release <= d && c.dueDay >= d).map(c => ({m: __sharePiece(c), by: __shareDue(c)})).sort((a, b) => a.by - b.by);
      let acc = 0, slots = 0, pi = 0;
      for (let f = i; f <= HORIZON + __O.lead; f++) { if (f > HORIZON || days[f].cap > 0) slots++; const fd = addDays(today, f); while (pi < pend.length && pend[pi].by <= fd) acc += pend[pi++].m; if (slots) share = Math.max(share, acc / slots); }
    }
    for (const c of chunks) {
      if (c.day || c.release > d || c.dueDay < d) continue;
      const must = !c.late && !c.prep && c.dueDay.getTime() === d.getTime(), key = c.grp || c.e.id;
      if (!must && ((!c.late && seen.has(key)) || day.mins >= share || day.mins + c.mins > day.cap)) continue;
      c.day = day.key; day.items.push(c); day.mins += c.mins; seen.add(key);
    }
    PLAN[day.key] = day;
  }
  // pass 2a — relief: a day past its physical room (what is left of today, a calendar's free time) hands work to the latest earlier day with room
  for (let i = days.length - 1; i > 0; i--) {
    const day = days[i];
    if (day.mins <= day.cap) continue;
    const movable = day.items.filter(c => !c.late).sort((a, b) => b.mins - a.mins);
    for (const c of movable) {
      if (day.mins <= day.cap) break;
      for (let j = i - 1; j >= 0; j--) {
        const t = days[j];
        if (t.mins + c.mins > t.cap || t.items.some(x => (x.grp || x.e.id) === (c.grp || c.e.id)) || (c.prep && t.date < addDays(c.release, -2))) continue;
        { const op = !c.prep && opensAt(c.e); if (op && t.date < startOfDay(op)) continue; }
        day.items.splice(day.items.indexOf(c), 1); day.mins -= c.mins;
        t.items.push(c); t.mins += c.mins; c.day = t.key; c.pulled = "over"; c.fromDate = day.date;
        break;
      }
    }
  }
  // pass 2b — levelling (v78.0): a later day hands a piece to the latest earlier day that can take it while ending no heavier in minutes
  { const canTake = (t, c, j) => { if (t.cap <= 0 || (j === 0 && t.mins + c.mins > leftToday) || t.items.some(x => (x.grp || x.e.id) === (c.grp || c.e.id)) || (c.prep && t.date < addDays(c.release, -2))) return false;
      const op = !c.prep && opensAt(c.e); return !(op && t.date < startOfDay(op)); };
    for (let sweep = 0, moved = true; moved && sweep < 80; sweep++) {
      moved = false;
      for (let i = days.length - 1; i > 0; i--) {
        const day = days[i];
        const movable = day.items.filter(c => !c.late).sort((a, b) => b.mins - a.mins || need(a) - need(b));
        for (const c of movable) {
          for (let j = i - 1; j >= 0; j--) {
            const t = days[j];
            if (!canTake(t, c, j) || t.mins + c.mins > day.mins - c.mins) continue;
            day.items.splice(day.items.indexOf(c), 1); day.mins -= c.mins;
            t.items.push(c); t.mins += c.mins; c.day = t.key; c.pulled = c.pulled || "level"; c.fromDate = day.date; moved = true;
            break;
          }
        }
      }
    }
    for (const day of days) { const one = new Map(); day.items = day.items.filter(c => { if (!c.late) return true; const k = c.e.id, f = one.get(k); if (f) { f.mins += c.mins; return false; } one.set(k, c); c.part = 1; c.parts = 1; return true; }); }
  }
  days.forEach(day => {
    day.over = Math.max(0, day.mins - day.cap);
    day.items.sort((a, b) => (a.late ? 0 : 1) - (b.late ? 0 : 1) || need(a) - need(b) || (a.prep ? 1 : 0) - (b.prep ? 1 : 0) || b.mins - a.mins);
    day.items.forEach(c => { if (!PLAN_DAY[c.e.id]) PLAN_DAY[c.e.id] = day.key; });
  });
  { const byE = new Map();
    for (const day of days) for (const c of day.items) if (!c.prep && c.parts > 1) { if (!byE.has(c.e.id)) byE.set(c.e.id, []); byE.get(c.e.id).push([day.date, c]); }
    for (const list of byE.values()) list.sort((a, b) => a[0] - b[0] || b[1].mins - a[1].mins).forEach(([, c], i) => { c.part = i + 1; }); }
  PLAN_OVER = days.filter(d => d.mins > d.cap).map(d => d.key);
  try { calAssignTimes(); } catch(_) { PLAN_TIME = new Map(); }
};
computeAhead = function(){
  AHEAD = {}; AHEAD_WEEK = "";
  const n = now(), today = startOfDay(n), k = dayKey(today), day = PLAN[k];
  if (!day || day.cap <= 0) return;
  // the week's own average day (the next seven days that hold work); a head start is the gap up to it, at most one part; a week with nothing: one part
  const wk = []; for (let i = 0; i < 7; i++) { const d = PLAN[dayKey(addDays(today, i))]; if (d && d.items.length) wk.push(d.mins); }
  const avg = wk.length ? wk.reduce((a, b) => a + b, 0) / wk.length : 0;
  /* ahead 'gap': only the gap up to the week's average day. ahead 'always': one part's worth every day with room — the plan is what is needed,
     the head starts are what the student could do next, soonest due first; a student with time left is never left idle beside pending work. */
  const room = __O.ahead === 'always' ? Math.min(CHUNK, day.cap - day.mins) : !wk.length ? CHUNK : Math.min(CHUNK, Math.max(0, Math.round(avg - day.mins)), day.cap - day.mins);
  if (room < 15) return;
  const skip = store.aheadSkip || {};
  const onDay = new Set(day.items.map(c => c.e.id));
  const placed = {};
  for (const key in PLAN) {
    if (key <= k) continue;
    const d = PLAN[key]; if (!d.cap) continue;
    d.items.forEach(c => { if (c.late) return; const r = avg ? d.mins / avg : 0, p = placed[c.e.id]; if (!p || r > p.ratio) placed[c.e.id] = {date: d.date, mins: d.mins, ratio: r, heavy: r >= 1.5 && d.mins > day.mins}; });
  }
  const cands = EVENTS.filter(open).filter(e => e.kind !== "inclass" && e.kind !== "fyi" && !e.exam && !opensAt(e) && e.due > n && dayKey(e.due) !== k && !onDay.has(e.id) && skip[e.id] !== k && !skipped.has(e.id));
  const scored = cands.map(e => {
    const left = remainingMins(e), days = Math.round((startOfDay(e.due) - today) / 864e5), p = placed[e.id];
    const relief = !!(p && p.heavy);
    const reliefSoon = relief && Math.round((startOfDay(p.date) - today) / 864e5) <= 7;
    const tier = reliefSoon ? 0 : days <= 7 ? 1 : (relief || left >= 90) && days <= 14 ? 2 : days <= 21 ? 3 : 9;
    return {e, left, days, p, relief, tier};
  }).filter(x => x.tier < 9).sort((a, b) => a.tier - b.tier || (b.e.exam ? 1 : 0) - (a.e.exam ? 1 : 0) || a.days - b.days || b.left - a.left);
  const list = []; let left = room;
  for (const x of scored) {
    if (list.length >= 3 || left < 15) break;
    const mins = Math.min(left, x.left, CHUNK);
    if (mins < 15 || (mins < x.left && mins < 30)) continue;
    const whole = mins >= x.left, dueW = FMT_DAY.format(x.e.due);
    const why = x.relief ? `${FMT_DAY.format(x.p.date)} is the week's heaviest day (~${fmtMins(x.p.mins)}) — ${fmtMins(mins)} now lightens it`
      : whole ? `due ${dueW} — small enough to knock out now`
      : x.e.exam ? `exam ${dueW} — a first pass now beats one cram`
      : `due ${dueW} — a first pass now`;
    list.push({e: x.e, mins, why, whole, relief: x.relief}); left -= mins;
  }
  if (list.length) AHEAD[k] = list;
  let free = 0, load = 0, busy = 0, firstBusy = null;
  for (let i = 0; i < 7; i++) { const d = PLAN[dayKey(addDays(today, i))]; if (!d) continue; if (d.items.length) { load += d.mins; busy++; if (!firstBusy) firstBusy = d; } else free++; }
  if (!day.items.length && free >= 2 && firstBusy && load >= 60) AHEAD_WEEK = `Nothing needed until ${FMT_DAY.format(firstBusy.date)}, then ~${fmtMins(load)} across ${busy} day${busy === 1 ? "" : "s"}. An hour ahead now makes that a normal week.`;
};

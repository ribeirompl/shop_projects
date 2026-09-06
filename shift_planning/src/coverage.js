/* ==========================================================================
   coverage.js — the numbers behind the planning aids: who is on the floor
   at each moment of each day (per department or all together), how much
   each person works once breaks come off, and what looks wrong. Pure
   functions of state, tested without a browser.
   ========================================================================== */

import { parseShift, coversAt, hoursLabel } from './shifts.js';
import { getCell, deptOf, unavailable, unavailLabel, DAY_SHORT } from './model.js';

export const HOUR = 60;
export const ALL  = 'ALL';

/* The instants coverage is sampled at: open, open+step, … < close. */
export function marks(state, step = 30){
  const out = [];
  for (let m = state.open; m < state.close; m += step) out.push(m);
  return out;
}

/* Every cell of the day, parsed once. */
export function dayShifts(state, day){
  return state.staff.map(s => {
    const cell = getCell(state, s.id, day);
    return { staff: s, cell, parsed: parseShift(cell.t), dept: deptOf(state, cell) };
  });
}

/* { marks, counts, who } — who[i] is the list of staff ids on at marks[i].
   `dept` narrows to one department; ALL counts everyone. */
export function dayCoverage(state, day, step = 30, dept = ALL){
  const ms = marks(state, step);
  const shifts = dayShifts(state, day).filter(x => x.parsed.kind === 'work' && (dept === ALL || x.dept === dept));
  const who = ms.map(m => shifts.filter(x => coversAt(x.parsed, m)).map(x => x.staff.id));
  return { day, marks: ms, counts: who.map(w => w.length), who };
}

export const weekCoverage = (state, step = 30, dept = ALL) => DAY_SHORT.map((_, d) => dayCoverage(state, d, step, dept));

/* Headcount working at all that day (not at once). */
export function dayHeadcount(state, day, dept = ALL){
  return dayShifts(state, day).filter(x => x.parsed.kind === 'work' && (dept === ALL || x.dept === dept)).length;
}

/* Peak simultaneous headcount over the week — what the heatmap scales to. */
export function peakCoverage(state, step = 30, dept = ALL){
  return Math.max(1, ...weekCoverage(state, step, dept).flatMap(c => c.counts));
}

/* ---- breaks ---------------------------------------------------------------- */

/* Unpaid minutes that come off a shift of `worked` minutes: the largest
   tier the shift exceeds. Tiers are "over N hours: M minutes". */
export function breakFor(state, worked){
  let best = 0;
  for (const b of state.breaks || []){
    if (worked > b.over * HOUR && b.minutes > best) best = b.minutes;
  }
  return Math.min(best, worked);
}

export const paidMinutes = (state, parsed) => parsed.kind === 'work' ? parsed.minutes - breakFor(state, parsed.minutes) : 0;

/* ---- per person ---------------------------------------------------------- */

export function staffSummary(state, id){
  const perDay = DAY_SHORT.map((_, d) => parseShift(getCell(state, id, d).t));
  const worked     = perDay.reduce((n, p) => n + p.minutes, 0);
  const minutes    = perDay.reduce((n, p) => n + paidMinutes(state, p), 0);
  const daysWorked = perDay.filter(p => p.kind === 'work').length;
  const offDays    = perDay.filter(p => p.kind === 'off').length;
  const leaveDays  = perDay.filter(p => p.kind === 'leave').length;
  const notes      = perDay.filter(p => p.kind === 'note').length;
  const blanks     = perDay.filter(p => p.kind === 'blank').length;
  const longest    = Math.max(0, ...perDay.map(p => p.minutes));
  return { id, perDay, worked, minutes, hours: hoursLabel(minutes), daysWorked, offDays, leaveDays, notes, blanks, longest };
}

export const weekSummary = state => state.staff.map(s => staffSummary(state, s.id));

/* ---- warnings -------------------------------------------------------------- */

/* The shop decides what counts as too much; 45h is the BCEA default. */
export const weekLimit  = state => ((state.limits && state.limits.weekHours)  || 45) * HOUR;
export const shiftLimit = state => ((state.limits && state.limits.shiftHours) || 12) * HOUR;

/* [{ level:'bad'|'warn', id, day?, msg }] */
export function warnings(state){
  const out = [];
  for (const s of state.staff){
    const sum = staffSummary(state, s.id);
    if (sum.minutes > weekLimit(state))
      out.push({ level: 'bad', id: s.id, msg: `${s.name} is on ${sum.hours} — over ${hoursLabel(weekLimit(state))}` });
    if (sum.daysWorked === 7)
      out.push({ level: 'bad', id: s.id, msg: `${s.name} works all seven days` });
    sum.perDay.forEach((p, d) => {
      if (p.kind === 'work' && unavailable(state, s.id, d))
        out.push({ level: 'bad', id: s.id, day: d, msg: `${s.name} ${DAY_SHORT[d]}: rostered on a day marked ${unavailLabel(state, s.id, d)}` });
      if (p.kind === 'work' && p.minutes > shiftLimit(state))
        out.push({ level: 'warn', id: s.id, day: d, msg: `${s.name} ${DAY_SHORT[d]}: ${hoursLabel(p.minutes)} shift` });
      if (p.kind === 'note')
        out.push({ level: 'warn', id: s.id, day: d, msg: `${s.name} ${DAY_SHORT[d]}: "${p.text}" is not a shift` });
    });
  }
  return out;
}

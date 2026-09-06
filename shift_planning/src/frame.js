/* ==========================================================================
   frame.js — the week frame: N fixed weekly patterns (week 1, week 2,
   week 3 …) that repeat. Which pattern a given week uses follows from its
   distance to the anchor Monday. Meant for the permanents; casuals are
   then filled in by hand each week.

   Applying writes into the ordinary cells, so once generated a week is
   edited like any other. Pure; tested without a browser.
   ========================================================================== */

import { getCell, setCell, daysBetween } from './model.js';

const mod = (n, m) => ((n % m) + m) % m;

export const frameWeeks = state => Math.min(6, Math.max(1, (state.frame.weeks | 0) || 1));

/* Which frame week (0-based) a Monday falls in. */
export function frameWeekOf(state, weekStart = state.weekStart){
  return mod(Math.floor(daysBetween(state.frame.anchor, weekStart) / 7), frameWeeks(state));
}

/* Members, in roster order; ids of people who have left are dropped. */
export const frameMembers = state => state.staff.filter(s => state.frame.members.includes(s.id)).map(s => s.id);

/* One pattern cell, read and written like a roster cell. */
export function getPattern(state, id, week, day){
  const row = (state.frame.patterns[id] || [])[week];
  return (row && row[day]) || { t: '', tag: null };
}

export function setPattern(state, id, week, day, patch){
  const rows = state.frame.patterns[id] || (state.frame.patterns[id] = []);
  const row  = rows[week] || (rows[week] = Array.from({ length: 7 }, () => ({ t: '', tag: null })));
  const cur  = row[day] || { t: '', tag: null };
  row[day] = { t:   patch.t   !== undefined ? String(patch.t) : cur.t,
               tag: patch.tag !== undefined ? (patch.tag || null) : cur.tag };
}

export const patternHasContent = (state, id, week) =>
  Array.from({ length: 7 }, (_, d) => getPattern(state, id, week, d)).some(c => c.t || c.tag);

/* Copy the current week's cells for `ids` into pattern `week`. */
export function saveWeekToFrame(state, week, ids){
  for (const id of ids){
    const rows = state.frame.patterns[id] || (state.frame.patterns[id] = []);
    rows[week] = Array.from({ length: 7 }, (_, d) => ({ ...getCell(state, id, d) }));
  }
}

/* Write pattern `week` into the current week for `ids`. People with no
   pattern are left alone, so a partial frame does not wipe a week. */
export function applyFrame(state, week, ids){
  let touched = 0;
  for (const id of ids){
    const row = (state.frame.patterns[id] || [])[week];
    if (!row) continue;
    row.forEach((c, d) => { setCell(state, id, d, { t: c.t, tag: c.tag }); touched++; });
  }
  return touched;
}

export function clearFrameWeek(state, week, ids){
  for (const id of ids){
    const rows = state.frame.patterns[id];
    if (rows) rows[week] = undefined;
  }
}

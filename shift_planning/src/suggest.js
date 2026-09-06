/* ==========================================================================
   suggest.js — which shifts to offer when a cell is being edited.

   The ranking is a tally, not a model: every shift ever typed for this
   person counts ten; what anyone has on this weekday, and what is used
   anywhere, count a little and are capped — so the forty OFFs in a week
   do not bury a person's own habit — and a handful of stock shifts sit
   at the bottom so a blank roster still offers something. Past weeks
   and the frame patterns count too. Someone marked unavailable gets OFF
   first.

   Typing narrows the list by prefix on the compacted text — "7" keeps
   7-4, 7-5 and 7:30-4; "12" keeps 12-8; "o" keeps OFF — and whatever is
   typed, if it reads as a shift, is offered first so a one-off "7-3" is
   never blocked by the suggestions. Pure; tested without a browser.
   ========================================================================== */

import { parseShift, formatShift } from './shifts.js';
import { unavailable } from './model.js';

export const DEFAULTS = ['OFF', '7-4', '9-8', '12-8', '7-5', '9-6', '2-8', '8-12'];

/* One spelling per shift so "07:00-16:00" and "7-4" are the same entry. */
export function canon(text){
  const p = parseShift(text);
  if (p.kind === 'blank') return '';
  if (p.kind === 'work')  return formatShift(p.spans);
  if (p.kind === 'off')   return 'OFF';
  if (p.kind === 'leave') return p.text.toUpperCase();
  return p.text;
}

export const compact = s => String(s).toLowerCase().replace(/\s+/g, '').replace(/[–—]/g, '-');

const startOf = text => { const p = parseShift(text); return p.spans.length ? p.spans[0].start : (p.kind === 'off' ? -1 : 9e9); };

const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);

/* { person, weekday, all } — Map(text → count) from every week and pattern. */
export function tallies(state, id, day){
  const person = new Map(), weekday = new Map(), all = new Map();
  const see = (pid, d, text) => {
    const t = canon(text);
    if (!t || parseShift(t).kind === 'note') return;
    bump(all, t);
    if (pid === id) bump(person, t);
    if (d === day)  bump(weekday, t);
  };
  const visit = cells => { for (const [k, c] of Object.entries(cells)){ const [pid, d] = k.split('|'); see(pid, +d, c.t); } };
  visit(state.cells);
  for (const w of Object.values(state.weeks || {})) visit(w);
  for (const [pid, rows] of Object.entries((state.frame && state.frame.patterns) || {}))
    (rows || []).forEach(row => row && row.forEach((c, d) => c && see(pid, d, c.t)));
  return { person, weekday, all };
}

/* Ranked [{ text, score, custom? }] for editing cell (id, day) with `query` typed. */
export function suggestions(state, id, day, query = '', limit = 8){
  const t = tallies(state, id, day);
  const texts = new Set([...t.all.keys(), ...DEFAULTS]);
  let list = [...texts].map(text => ({
    text,
    score: 10 * (t.person.get(text) || 0) + Math.min(3, t.weekday.get(text) || 0) + 0.5 * Math.min(6, t.all.get(text) || 0) +
           (DEFAULTS.includes(text) ? 0.25 : 0)
  }));
  if (unavailable(state, id, day)){
    const off = list.find(x => x.text === 'OFF');
    if (off) off.score += 1000;
  }
  const q = compact(query);
  if (q) list = list.filter(x => compact(x.text).startsWith(q));
  list.sort((a, b) => b.score - a.score || startOf(a.text) - startOf(b.text) || a.text.localeCompare(b.text));
  list = list.slice(0, limit);

  const typed = query.trim();
  if (typed){
    const p = parseShift(typed);
    if (p.kind === 'work' || p.kind === 'off' || p.kind === 'leave'){
      const c = canon(typed);
      const i = list.findIndex(x => x.text === c);
      if (i >= 0) list.unshift(...list.splice(i, 1));
      else list.unshift({ text: c, score: Infinity, custom: true });
    }
  }
  return list;
}

/* The shifts used most across the whole roster — the paint palette. */
export function popular(state, limit = 8){
  const { all } = tallies(state, null, -1);
  return [...all.entries()].sort((a, b) => b[1] - a[1] || startOf(a[0]) - startOf(b[0])).slice(0, limit).map(([text]) => text);
}

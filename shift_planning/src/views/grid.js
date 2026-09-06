/* ==========================================================================
   views/grid.js — the spreadsheet. People down the side, days across; the
   text in each cell is exactly what prints. This is the closest thing to
   the old Excel sheet and the mode everything else writes into.

   The table, its selection and the cell editor live in weektable.js and
   are shared with the Rotation view; this file only says what the rows
   are, where cells come from, and what goes in the header (a headcount
   sparkline for everyone) and at the row end (paid hours and days).
   ========================================================================== */

import { h, svg } from '../dom.js';
import { getCell, setCell, unavailable, weekDates } from '../model.js';
import { parseShift } from '../shifts.js';
import { dayCoverage, dayHeadcount, peakCoverage, staffSummary, weekLimit } from '../coverage.js';
import { mountWeekTable } from '../weektable.js';

export const css = `
.grid-head svg{ display:block; margin:4px auto 0; }
.grid-head .on{ display:block; font-size:11px; color:var(--ink-2); font-weight:400; }
.grid-foot{ margin-top:8px; }
`;

function sparkline(state, day){
  const cov = dayCoverage(state, day, 60);
  const peak = peakCoverage(state, 60);
  const w = 6, gap = 1, hgt = 22;
  const el = svg('svg', { width: cov.marks.length * (w + gap), height: hgt, 'aria-hidden': 'true' });
  cov.marks.forEach((m, i) => {
    const v = cov.counts[i];
    const bh = Math.max(1, Math.round(v / peak * (hgt - 2)));
    el.append(svg('rect', { x: i * (w + gap), y: hgt - bh, width: w, height: bh, rx: 1, fill: v ? 'var(--seq-4)' : 'var(--line)' },
      svg('title', {}, `${String(Math.floor(m / 60)).padStart(2, '0')}:00 — ${v} on`)));
  });
  return el;
}

export default {
  id: 'grid', label: 'Grid', hint: 'Type shifts into a week grid, like the spreadsheet',

  mount(root, ctx){
    const { store } = ctx;
    const table = mountWeekTable(root, {
      store, label: 'cell',
      rows: state => state.staff,
      get: getCell,
      set: setCell,
      dates: weekDates,
      head: (state, d) => h('span.grid-head', {}, sparkline(state, d), h('span.on', `${dayHeadcount(state, d)} on`)),
      endHeads: ['Hours', 'Days'],
      rowEnd(state, r){
        const sum = staffSummary(state, r.id);
        return [{ text: sum.minutes ? sum.hours : '–', over: sum.minutes > weekLimit(state) },
                { text: sum.daysWorked || '–', over: sum.daysWorked === 7 }];
      },
      unavailable,
      groups: true,
      palette: true
    });
    root.append(h('p.hint.grid-foot', {},
      'Click a cell or start typing — ', h('kbd', 'Enter'), ' accepts and moves down, ', h('kbd', 'Tab'), ' across. ',
      'Write "7-4", "12-8", "8-12, 5-8" or "OFF". Hours are after breaks. A red corner means the person said they cannot work that day.'));

    return { render: state => table.render(state), unmount(){ table.destroy(); } };
  }
};

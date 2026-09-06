/* ==========================================================================
   side.js — the panel that is always there, whatever mode is open:

     · a coverage heatmap for everyone, days down, opening hours across —
       how many people are on the floor at once
     · the same heatmap again for each department, each scaled to its own
       peak, so a quiet one still reads
     · flags: over the limit, seven days straight, rostered on a day the
       person said they cannot work, text that is not a shift

   Hours and days per person are in the Grid already, so they are not
   repeated here. This panel only reads state; it never writes.
   ========================================================================== */

import { h, fill } from './dom.js';
import { DAY_SHORT, depts, weekDates, fmtDay } from './model.js';
import { hoursLabel } from './shifts.js';
import { dayCoverage, dayHeadcount, weekSummary, warnings, HOUR, ALL } from './coverage.js';

export const css = `
#side h2{ display:flex; align-items:baseline; gap:8px; }
#side h2 .muted{ font-weight:400; font-size:12px; }
/* fixed layout: the first row's widths rule, so the day and total columns
   are pinned there and the hours share what is left */
.heat{ width:100%; border-collapse:collapse; table-layout:fixed; }
.heat th{ font-weight:400; font-size:10px; color:var(--ink-2); padding:0 0 2px; overflow:hidden; }
.heat th.hr{ text-align:left; }
.heat th.day, .heat td.day{ width:34px; }
.heat th.tot, .heat td.tot{ width:38px; }
.heat td{ padding:1px 1px 1px 0; overflow:hidden; }
.heat td.day{ font-size:11px; padding-right:4px; white-space:nowrap; }
.heat .c{ display:block; height:18px; border-radius:2px; text-align:center; line-height:18px; font-size:10px; font-variant-numeric:tabular-nums; }
.heat td.tot{ font-size:10px; color:var(--ink-2); text-align:right; padding-left:4px; white-space:nowrap; }
.heat-none{ margin:0; font-size:12px; }
`;

const RAMP = ['var(--seq-0)', 'var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)', 'var(--seq-6)', 'var(--seq-7)'];

/* Days down, hours across, scaled to this department's own busiest moment. */
function heatmap(state, dept){
  const covs = DAY_SHORT.map((_, d) => dayCoverage(state, d, 30, dept));
  const hours = [];
  for (let m = state.open; m < state.close; m += HOUR) hours.push(m);
  /* an hour's value is its busiest half, so a 30-minute dip is not hidden */
  const at = (cov, m) => Math.max(...cov.marks.map((mk, i) => (mk >= m && mk < m + HOUR) ? cov.counts[i] : 0));
  const peak = Math.max(1, ...covs.flatMap(c => c.counts));
  const dates = weekDates(state);

  const table = h('table.heat');
  table.append(h('tr', h('th.day'), hours.map(m => h('th.hr', String(Math.floor(m / 60)))), h('th.tot')));
  covs.forEach((cov, d) => {
    const tr = h('tr', {}, h('td.day', { title: fmtDay(dates[d]) }, DAY_SHORT[d]));
    hours.forEach(m => {
      const v = at(cov, m);
      const step = v === 0 ? 0 : Math.max(1, Math.round(v / peak * 7));
      tr.append(h('td', h('span.c', {
        style: { background: RAMP[step], color: step >= 4 ? '#fff' : 'var(--ink)' },
        title: `${DAY_SHORT[d]} ${String(Math.floor(m / 60)).padStart(2, '0')}:00 — ${v} on`
      }, v || '')));
    });
    tr.append(h('td.tot', { title: 'people working at some point that day' }, dayHeadcount(state, d, dept) + ' on'));
    table.append(tr);
  });
  return table;
}

function warnList(state){
  const ws = warnings(state);
  if (!ws.length) return h('ul.warnlist', h('li.good', 'Nothing flagged.'));
  return h('ul.warnlist', ws.map(w => h('li.' + w.level, w.msg)));
}

export function mountSide(root, ctx){
  document.head.append(h('style', css));
  const allBox = h('div'), deptBox = h('div'), warnBox = h('div');
  const heatTitle = h('span.muted');
  root.append(
    h('h2', 'On the floor · everyone', heatTitle),
    allBox,
    deptBox,
    h('h3', 'Flagged'),
    warnBox);

  function render(state){
    const covs = DAY_SHORT.map((_, d) => dayCoverage(state, d, 30, ALL));
    const peak = Math.max(0, ...covs.flatMap(c => c.counts));
    const weekMinutes = weekSummary(state).reduce((n, s) => n + s.minutes, 0);
    heatTitle.textContent = `peak ${peak} · ${hoursLabel(weekMinutes)} paid`;
    fill(allBox, heatmap(state, ALL));
    /* Tills first, then every place-tag. A department nobody worked all
       week gets a line, not an empty grid. */
    fill(deptBox, depts(state).map(dp => {
      const worked = DAY_SHORT.some((_, d) => dayHeadcount(state, d, dp.id) > 0);
      return [h('h3', dp.label), worked ? heatmap(state, dp.id) : h('p.muted.heat-none', 'nobody rostered')];
    }));
    fill(warnBox, warnList(state));
  }
  return { render };
}

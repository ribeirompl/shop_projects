/* ==========================================================================
   views/availability.js — who cannot work when.

   Casuals write exams and have classes; permanents book leave. Marking a
   day here puts a red corner on that cell in the Grid, puts OFF at the top
   of its suggestions and raises a flag if a shift is typed into it anyway.
   The roster itself is not changed — availability is information about
   the week, not a decision about it.

   One click cycles the day: available → unavailable (this date) → every
   <weekday>, for a standing class → available again. A dated mark wins
   over the weekly rule, so one exception does not need the rule removed.
   ========================================================================== */

import { h, fill } from '../dom.js';
import { DAY_SHORT, weekDates, fmtDay, getCell, unavailable, unavailLabel, cycleUnavailable } from '../model.js';
import { parseShift } from '../shifts.js';

export const css = `
.av-wrap{ background:var(--paper); border:1px solid var(--line); border-radius:6px; overflow:auto; }
table.av{ border-collapse:separate; border-spacing:0; width:100%; min-width:720px; }
table.av th, table.av td{ border-bottom:1px solid var(--line-2); border-right:1px solid var(--line-2); padding:0; }
table.av th{ background:#fafafa; font-weight:600; text-align:center; padding:6px 8px; position:sticky; top:0; }
table.av th.name{ text-align:left; }
table.av th .date{ display:block; font-weight:400; color:var(--ink-2); font-size:11px; }
table.av td.name{ padding:0 8px; white-space:nowrap; }
table.av tr.group td{ background:#f0f0ee; color:var(--ink-2); font-size:11px; text-transform:uppercase; letter-spacing:.05em; padding:3px 8px; }
table.av td.day{ text-align:center; cursor:pointer; padding:4px 6px; min-height:34px; user-select:none; }
table.av td.day:hover{ background:#f6f6f6; }
table.av td.day .shift{ display:block; font-size:11px; color:var(--ink-3); }
table.av td.day.no{ background:#fde8e8; color:var(--bad); font-weight:600; }
table.av td.day.no:hover{ background:#fadada; }
table.av td.day.no .shift{ color:var(--bad); font-weight:400; }
table.av td.day.no.weekly::after{ content:' ↻'; font-weight:400; }
table.av td.day.no.clash .shift{ text-decoration:underline wavy var(--bad); }
`;

export default {
  id: 'avail', label: 'Availability', hint: 'Days people have said they cannot work',

  mount(root, ctx){
    const { store } = ctx;
    const wrap = h('div.av-wrap');
    root.append(
      h('p.hint', 'Click a day to cycle: available → unavailable → every <weekday> → available. Marks show in the Grid as a red corner.'),
      wrap);

    const cycle = (id, d) => store.update(s => cycleUnavailable(s, id, d), { label: 'avail' });

    function render(state){
      const dates = weekDates(state);
      const table = h('table.av');
      table.append(h('thead', h('tr', {}, h('th.name', 'Name'), DAY_SHORT.map((d, i) => h('th', {}, d, h('span.date', fmtDay(dates[i])))))));
      const body = h('tbody');
      let lastType = null;
      for (const s of state.staff){
        if (s.type !== lastType){ lastType = s.type; body.append(h('tr.group', h('td', { colSpan: 8 }, s.type === 'casual' ? 'Casuals' : 'Permanents'))); }
        const tr = h('tr', {}, h('td.name', s.name));
        for (let d = 0; d < 7; d++){
          const u     = unavailable(state, s.id, d);
          const label = unavailLabel(state, s.id, d);
          const shift = getCell(state, s.id, d).t;
          /* a clash is a real shift on a day marked off — OFF and notes are not */
          const working = parseShift(shift).kind === 'work';
          tr.append(h('td.day' + (u ? '.no' : '') + (u === 'weekly' ? '.weekly' : '') + (u && working ? '.clash' : ''), {
            title: u ? label + (working ? ' — but rostered ' + shift : '') : 'click to mark unavailable',
            onclick: () => cycle(s.id, d)
          }, label || '', h('span.shift', shift ? 'rostered ' + shift : '')));
        }
        body.append(tr);
      }
      table.append(body);
      const top = wrap.scrollTop;
      fill(wrap, table);
      wrap.scrollTop = top;
    }

    return { render, unmount(){} };
  }
};

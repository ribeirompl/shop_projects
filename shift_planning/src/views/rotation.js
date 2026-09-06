/* ==========================================================================
   views/rotation.js — the week frame for the permanents.

   The permanents sit on a fixed rotation of N weekly patterns — Week 1,
   Week 2, Week 3, then Week 1 again — anchored on a Monday, so which
   pattern a week uses follows from the calendar. The patterns are edited
   here in the same table-and-editor as the Grid. The weekly routine is:
   open the tool, press "Apply Week N to this week", then fill in the
   casuals in the Grid.

   Applying overwrites the members' cells for the current week — text and
   colour — and leaves everyone else alone. Every destructive button asks
   first, and undo brings the week back.
   ========================================================================== */

import { h, clear, fill } from '../dom.js';
import { weekLabel } from '../model.js';
import { parseShift, hoursLabel } from '../shifts.js';
import { paidMinutes, weekLimit } from '../coverage.js';
import { frameWeeks, frameWeekOf, frameMembers, getPattern, setPattern, applyFrame, clearFrameWeek } from '../frame.js';
import { mountWeekTable } from '../weektable.js';

export const css = `
.rot-panel{ background:var(--paper); border:1px solid var(--line); border-radius:6px; padding:10px 12px; margin-bottom:12px; }
.rot-panel h2{ margin:0; }
.rot-now{ margin:8px 0 0; color:var(--ink-2); }
.rot-n{ font-size:17px; font-weight:700; color:var(--accent); }
.rot-members{ display:flex; flex-wrap:wrap; gap:2px 12px; margin-top:6px; }
.rot-members label{ display:flex; align-items:center; gap:5px; width:150px; white-space:nowrap; }
.rot-week{ margin-bottom:14px; }
.rot-week.now .rot-title{ color:var(--accent); }
.rot-week.now .wt-wrap{ border-color:var(--accent); box-shadow:0 0 0 1px var(--accent); }
.rot-badge{ font-size:11px; padding:1px 7px; border-radius:9px; background:var(--accent); color:var(--accent-ink); }
.rot-week .row{ margin-bottom:6px; }
`;

let membersOpen = false;

export default {
  id: 'rotation', label: 'Rotation', hint: 'Fixed week patterns for the permanents that repeat every N weeks',

  mount(root, ctx){
    const { store } = ctx;
    const top = h('div.rot-panel');
    const weeksBox = h('div');
    root.append(top, weeksBox);
    let tables = [];   /* one weektable per frame week */

    function apply(w){
      const state = store.state;
      if (!confirm(`Apply Week ${w + 1} to ${weekLabel(state)}? It overwrites the shifts of everyone in the frame for that week. Undo can bring them back.`)) return;
      store.update(s => applyFrame(s, w, frameMembers(s)), { label: 'frame-apply' });
    }

    function renderTop(state){
      const n = frameWeeks(state), now = frameWeekOf(state);
      const members = new Set(state.frame.members);
      fill(top, 
        h('div.row', {},
          h('h2', 'Week frame'),
          h('span.spacer'),
          h('button.primary', { onclick: () => apply(now) }, `Apply Week ${now + 1} to this week`)),
        h('p.hint', 'The permanents repeat a fixed set of weekly patterns. Press the button, then fill in the casuals in the Grid.'),
        h('div.row', {},
          h('label', {}, 'Weeks in the frame ',
            h('input', { type: 'number', min: 1, max: 6, value: n, style: { width: '52px' },
              onchange: e => store.update(s => { s.frame.weeks = Math.min(6, Math.max(1, +e.currentTarget.value || 1)); }, { label: 'frame' }) })),
          h('button.small', { onclick: () => { membersOpen = !membersOpen; renderTop(store.state); } }, (membersOpen ? 'Hide' : 'Choose') + ' who is in the frame')),
        h('p.rot-now', {}, 'The week of ', h('b', weekLabel(state)), ' is Week ', h('span.rot-n', now + 1), ' of ' + n),
        membersOpen ? h('div.rot-members', state.staff.map(s => h('label', {},
          h('input', { type: 'checkbox', checked: members.has(s.id), onchange: e => {
            const on = e.currentTarget.checked;
            store.update(x => { x.frame.members = x.staff.filter(p => (p.id === s.id ? on : x.frame.members.includes(p.id))).map(p => p.id); }, { label: 'frame' });
          } }),
          s.name, s.type === 'casual' ? h('span.pill.casual', 'casual') : null))) : null);
    }

    function buildWeek(w){
      const box = h('div.rot-week');
      const badge = h('span.rot-badge', { hidden: true }, 'applies to this week');
      box.append(h('div.row', {}, h('h2.rot-title', `Week ${w + 1}`), badge,
        h('span.spacer'),
        h('button.small.primary', { onclick: () => apply(w) }, 'Apply to this week'),
        h('button.small', { onclick: () => confirm(`Clear the Week ${w + 1} pattern?`) && store.update(x => clearFrameWeek(x, w, frameMembers(x)), { label: 'frame' }) }, 'Clear')));
      const table = mountWeekTable(box, {
        store, label: 'frame',
        rows: state => state.staff.filter(s => state.frame.members.includes(s.id)),
        get: (state, id, d) => getPattern(state, id, w, d),
        set: (s, id, d, patch) => setPattern(s, id, w, d, patch),
        dates: null,
        endHeads: ['Hours'],
        rowEnd(state, r){
          const mins = Array.from({ length: 7 }, (_, d) => paidMinutes(state, parseShift(getPattern(state, r.id, w, d).t))).reduce((a, b) => a + b, 0);
          return [{ text: mins ? hoursLabel(mins) : '–', over: mins > weekLimit(state) }];
        },
        groups: false,
        palette: w === 0
      });
      return { box, table, badge };
    }

    function render(state){
      renderTop(state);
      const n = frameWeeks(state), now = frameWeekOf(state);
      if (tables.length !== n){
        tables.forEach(t => t.table.destroy());
        clear(weeksBox);
        tables = Array.from({ length: n }, (_, w) => buildWeek(w));
        tables.forEach(t => weeksBox.append(t.box));
      }
      tables.forEach((t, w) => {
        t.box.classList.toggle('now', w === now);
        t.badge.hidden = w !== now;
        t.table.render(state);
      });
    }

    return { render, unmount(){ tables.forEach(t => t.table.destroy()); tables = []; } };
  }
};

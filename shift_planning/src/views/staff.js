/* ==========================================================================
   views/staff.js — who is on the roster, and the shop's settings.

   Order here is the order everywhere: the grid, the availability page and
   the printed sheet all follow it. Permanents and casuals are shown as
   two groups because the manager plans them differently (fixed frame vs.
   weekly), but a person's type is just a label — it changes grouping and
   nothing else.

   Breaks are a rule, not per shift: "a shift over N hours has M minutes
   unpaid". The hours columns everywhere are after breaks; the coverage
   counts are not, because nobody knows when the break falls.

   Colours are the legend, edited here and nowhere else. A tag keeps its
   id, so renaming one renames it on every week already planned and
   removing one leaves those cells plain. Only a tag marked as a
   department is a place people work, and only those are counted on their
   own in the coverage panel; OFF is not a tag at all.
   ========================================================================== */

import { h, fill } from '../dom.js';
import { addStaff, removeStaff, moveStaff, addTag, removeTag,
         isoDate, fromISO, mondayOf, FRAME_ANCHOR } from '../model.js';
import { staffSummary } from '../coverage.js';

export const css = `
.staff-wrap{ display:grid; grid-template-columns:minmax(420px, 640px) 320px; gap:16px; align-items:start; }
.panel{ background:var(--paper); border:1px solid var(--line); border-radius:6px; padding:12px; }
.panel h2 + .hint{ margin-top:0; }
table.staff{ border-collapse:collapse; width:100%; }
table.staff td{ padding:2px 4px; border-bottom:1px solid var(--line-2); }
table.staff tr.group td{ background:#f0f0ee; color:var(--ink-2); font-size:11px; text-transform:uppercase; letter-spacing:.05em; padding:3px 6px; }
table.staff input[type=text]{ width:100%; }
table.staff td.num{ text-align:right; color:var(--ink-2); white-space:nowrap; font-variant-numeric:tabular-nums; }
table.staff td.tools{ white-space:nowrap; text-align:right; }
.staff-add{ margin-top:10px; }
.hours-row label{ display:flex; align-items:center; gap:6px; margin:6px 0; }
.hours-row input{ width:60px; }
.breaks label{ display:flex; align-items:center; gap:6px; margin:4px 0; }
.breaks input{ width:56px; }
input[type=color]{ width:26px; height:22px; padding:0; border:1px solid var(--line); border-radius:var(--radius); background:var(--paper); cursor:pointer; }
.tag-row{ display:grid; grid-template-columns:auto minmax(0,1fr) auto auto auto auto auto; gap:3px; align-items:center; margin:3px 0; }
.tag-row input[type=text]{ width:100%; min-width:0; }
.tag-row input[type=checkbox]{ margin:0 2px; }
.tag-add{ display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:3px; align-items:center; margin-top:8px; padding-top:8px; border-top:1px solid var(--line-2); }
.tag-add input[type=text]{ width:100%; min-width:0; }
.anchor-row input[type=date]{ width:100%; }
`;

export default {
  id: 'staff', label: 'Setup', hint: 'People, colours, opening hours, breaks and what gets flagged',

  mount(root, ctx){
    const { store } = ctx;
    const listBox = h('div'), breaksBox = h('div.breaks'), tagsBox = h('div.tags');
    const nameIn = h('input', { type: 'text', placeholder: 'Name', style: { width: '160px' } });
    const typeIn = h('select', {}, h('option', { value: 'permanent' }, 'Permanent'), h('option', { value: 'casual' }, 'Casual'));
    const add = () => {
      const name = nameIn.value.trim();
      if (!name) return;
      store.update(s => addStaff(s, name, typeIn.value), { label: 'staff' });
      nameIn.value = ''; nameIn.focus();
    };
    nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });

    /* The add-a-colour row is built once, so a half-typed label survives
       the rebuild that follows any other change. */
    const tagNameIn  = h('input', { type: 'text', placeholder: 'New colour' });
    const tagColorIn = h('input', { type: 'color', value: '#cccccc', title: 'Pick the colour' });
    const addTagRow = () => {
      const label = tagNameIn.value.trim();
      if (!label) return;
      store.update(s => addTag(s, label, tagColorIn.value), { label: 'tags' });
      tagNameIn.value = ''; tagNameIn.focus();
    };
    tagNameIn.addEventListener('keydown', e => { if (e.key === 'Enter') addTagRow(); });

    const num = (attrs) => h('input', { type: 'number', step: 1, ...attrs });
    const openIn = num({ min: 0, max: 23 }), closeIn = num({ min: 1, max: 24 });
    const setHours = () => {
      const o = +openIn.value, c = +closeIn.value;
      if (!(o >= 0 && c <= 24 && c > o)) return;
      store.update(s => { s.open = o * 60; s.close = c * 60; }, { label: 'hours' });
    };
    openIn.addEventListener('change', setHours); closeIn.addEventListener('change', setHours);

    const weekLimIn = num({ min: 1, max: 168 }), shiftLimIn = num({ min: 1, max: 24 });
    const setLimits = () => store.update(s => {
      s.limits.weekHours  = Math.max(1, +weekLimIn.value  || 45);
      s.limits.shiftHours = Math.max(1, +shiftLimIn.value || 12);
    }, { label: 'limits' });
    weekLimIn.addEventListener('change', setLimits); shiftLimIn.addEventListener('change', setLimits);

    /* Any date is snapped back to its Monday: week 1 of the frame has to
       start on one. */
    const anchorIn = h('input', { type: 'date', onchange: e => {
      const v = e.currentTarget.value;
      if (!v){ e.currentTarget.value = store.state.frame.anchor || FRAME_ANCHOR; return; }
      store.update(s => { s.frame.anchor = isoDate(mondayOf(fromISO(v))); }, { label: 'frame' });
    } });

    root.append(h('div.staff-wrap', {},
      h('div.panel', {},
        h('h2', 'People'),
        listBox,
        h('div.row.staff-add', {}, nameIn, typeIn, h('button', { onclick: add }, 'Add'))),
      h('div', {},
        h('div.panel', {},
          h('h2', 'Shop hours'),
          h('p.hint', 'Coverage is counted between these. Shifts outside them still count as hours.'),
          h('div.hours-row', {},
            h('label', {}, 'Open ', openIn, h('span.muted', ':00')),
            h('label', {}, 'Close ', closeIn, h('span.muted', ':00')))),
        h('div.panel', { style: { marginTop: '12px' } },
          h('h2', 'Colours'),
          h('p.hint', 'The legend. Tick “dept” when the colour is a department — a place the person works that day, counted on its own in the coverage panel. An unticked colour, like LEAVE, is only a marking. OFF is not in the list: a rest day is always yellow.'),
          tagsBox,
          h('div.tag-add', {}, tagNameIn, tagColorIn, h('button.small', { onclick: addTagRow }, 'Add'))),
        h('div.panel', { style: { marginTop: '12px' } },
          h('h2', 'Breaks'),
          h('p.hint', 'Unpaid time that comes off a shift. The biggest rule the shift exceeds applies. Hours shown everywhere are after breaks.'),
          breaksBox),
        h('div.panel', { style: { marginTop: '12px' } },
          h('h2', 'Flag'),
          h('p.hint', 'What the side panel marks in red. 45 hours a week is the BCEA ordinary-hours limit.'),
          h('div.hours-row', {},
            h('label', {}, 'Weeks over ', weekLimIn, h('span.muted', 'hours')),
            h('label', {}, 'Shifts over ', shiftLimIn, h('span.muted', 'hours')))),
        h('div.panel', { style: { marginTop: '12px' } },
          h('h2', 'Rotation anchor'),
          h('p.hint', 'Week 1 of the rotation frame starts on this Monday; the default is 1 Jan 2024. Only change it if the week numbering needs to shift.'),
          h('div.anchor-row', {}, anchorIn)),
        h('div.panel', { style: { marginTop: '12px' } },
          h('h2', 'Printed notice'),
          h('p.hint', 'The red line at the foot of the printed roster. Leave empty for none.'),
          h('input', { type: 'text', style: { width: '100%' }, value: store.state.notice,
            onchange: e => store.update(s => { s.notice = e.currentTarget.value.trim(); }, { label: 'notice' }) })))));

    function renderBreaks(state){
      const rows = state.breaks.map((b, i) => h('label', {},
        'over ', num({ min: 0, max: 24, step: 0.5, value: b.over, onchange: e => store.update(s => { s.breaks[i].over = Math.max(0, +e.currentTarget.value || 0); }, { label: 'breaks' }) }),
        ' hours: ', num({ min: 0, max: 180, step: 5, value: b.minutes, onchange: e => store.update(s => { s.breaks[i].minutes = Math.max(0, +e.currentTarget.value || 0); }, { label: 'breaks' }) }),
        ' min unpaid ',
        h('button.small.quiet', { title: 'Remove this rule', onclick: () => store.update(s => { s.breaks.splice(i, 1); }, { label: 'breaks' }) }, '×')));
      fill(breaksBox, rows,
        h('button.small', { style: { marginTop: '4px' }, onclick: () => store.update(s => { s.breaks.push({ over: 9, minutes: 90 }); }, { label: 'breaks' }) }, 'Add a rule'),
        state.breaks.length ? null : h('p.hint', 'No breaks: hours are worked hours.'));
    }

    function renderTags(state){
      const rows = state.tags.map((t, i) => {
        return h('div.tag-row', {},
          h('input', { type: 'color', value: t.color, title: 'Colour for ' + t.label,
            onchange: e => { const v = e.currentTarget.value; store.update(s => { const x = s.tags.find(y => y.id === t.id); if (x) x.color = v; }, { label: 'tags' }); } }),
          h('input', { type: 'text', value: t.label, title: 'What the legend calls it',
            onchange: e => { const v = e.currentTarget.value.trim();
              if (!v){ e.currentTarget.value = t.label; return; }
              store.update(s => { const x = s.tags.find(y => y.id === t.id); if (x) x.label = v; }, { label: 'tags' }); } }),
          h('input', { type: 'checkbox', checked: t.dept, 'aria-label': 'Counts as a department',
            title: 'Counts as a department: a place the person works, counted on its own in coverage',
            onchange: e => { const v = e.currentTarget.checked; store.update(s => { const x = s.tags.find(y => y.id === t.id); if (x) x.dept = v; }, { label: 'tags' }); } }),
          h('button.small.quiet', { title: 'Move up',   disabled: i === 0, onclick: () => store.update(s => { const [x] = s.tags.splice(i, 1); s.tags.splice(i - 1, 0, x); }, { label: 'tags' }) }, '↑'),
          h('button.small.quiet', { title: 'Move down', disabled: i === state.tags.length - 1, onclick: () => store.update(s => { const [x] = s.tags.splice(i, 1); s.tags.splice(i + 1, 0, x); }, { label: 'tags' }) }, '↓'),
          h('button.small.quiet', { title: 'Remove this colour', onclick: () => {
            if (confirm(`Remove ${t.label}? Cells using it go plain.`))
              store.update(s => removeTag(s, t.id), { label: 'tags' });
          } }, '×'));
      });
      fill(tagsBox, rows, state.tags.length ? null : h('p.hint', 'No colours: every cell prints plain.'));
    }

    function render(state){
      openIn.value = Math.floor(state.open / 60); closeIn.value = Math.floor(state.close / 60);
      weekLimIn.value = state.limits.weekHours; shiftLimIn.value = state.limits.shiftHours;
      anchorIn.value = state.frame.anchor || FRAME_ANCHOR;
      renderBreaks(state);
      renderTags(state);

      const table = h('table.staff');
      let lastType = null;
      state.staff.forEach((s, i) => {
        if (s.type !== lastType){
          lastType = s.type;
          table.append(h('tr.group', h('td', { colSpan: 5 }, s.type === 'casual' ? 'Casuals' : 'Permanents')));
        }
        const sum = staffSummary(state, s.id);
        table.append(h('tr', {},
          h('td', {}, h('input', { type: 'text', value: s.name,
            onchange: e => { const v = e.currentTarget.value.trim(); if (v) store.update(x => { x.staff.find(p => p.id === s.id).name = v; }, { label: 'staff' }); } })),
          h('td', {}, h('select', { onchange: e => store.update(x => { x.staff.find(p => p.id === s.id).type = e.currentTarget.value; }, { label: 'staff' }) },
            h('option', { value: 'permanent', selected: s.type === 'permanent' }, 'Permanent'),
            h('option', { value: 'casual',    selected: s.type === 'casual' },    'Casual'))),
          h('td.num', { title: 'hours after breaks · days this week' }, sum.minutes ? `${sum.hours} · ${sum.daysWorked}d` : '–'),
          h('td.tools', {},
            h('button.small.quiet', { title: 'Move up',   disabled: i === 0, onclick: () => store.update(x => moveStaff(x, s.id, -1), { label: 'staff' }) }, '↑'),
            h('button.small.quiet', { title: 'Move down', disabled: i === state.staff.length - 1, onclick: () => store.update(x => moveStaff(x, s.id, 1), { label: 'staff' }) }, '↓'),
            h('button.small.quiet', { title: 'Remove from the roster', onclick: () => {
              if (confirm(`Remove ${s.name} and all their shifts? (Undo can bring them back.)`))
                store.update(x => removeStaff(x, s.id), { label: 'staff' });
            } }, '×'))));
      });
      fill(listBox, table);
    }

    return { render, unmount(){} };
  }
};

/* ==========================================================================
   weektable.js — the people-down, days-across table with the cell editor,
   shared by the Grid (roster cells) and Rotation (frame patterns).

   A cell is selected, then edited. Selection is the keyboard's: arrows
   move it, Tab too, and Delete clears. Editing opens a small popover under
   the cell with a text box and ranked suggestions (see suggest.js):

     click a cell, or press Enter / F2, or just start typing
     type to narrow the list — "7" keeps the sevens, "o" keeps OFF
     ↑ ↓   choose            Enter  accept and move down
     Tab   accept, move right        Shift+Tab  move left
     Esc   close without changing

   Colours are mouse work: the chips in the popover, right-click on a
   cell, or paint mode — the palette above the table: click a shift or a
   colour to arm it, then click cells to stamp it; Esc or the chip again
   disarms. There are deliberately no keyboard shortcuts for colours.

   The table is rebuilt on every store update; the component keeps the
   selection, the open popover and keyboard focus across the rebuild.
   ========================================================================== */

import { h, clear, fill } from './dom.js';
import { DAY_SHORT, MONTHS, cellColor } from './model.js';
import { parseShift, hoursLabel } from './shifts.js';
import { suggestions, popular } from './suggest.js';
import { showTagMenu } from './menu.js';

export const css = `
.wt-wrap{ background:var(--paper); border:1px solid var(--line); border-radius:6px; overflow:auto; outline:none; }
.wt-wrap:focus-visible{ box-shadow:0 0 0 2px var(--accent); }
table.wt{ border-collapse:separate; border-spacing:0; width:100%; min-width:720px; }
table.wt th, table.wt td{ border-bottom:1px solid var(--line-2); border-right:1px solid var(--line-2); padding:0; }
table.wt th{ background:#fafafa; font-weight:600; text-align:left; padding:6px 8px; vertical-align:bottom; position:sticky; top:0; z-index:2; }
table.wt th.day{ text-align:center; }
table.wt th.day .date{ display:block; font-weight:400; color:var(--ink-2); font-size:11px; }
table.wt th.end{ text-align:right; }
table.wt td.name{ padding:0 8px; white-space:nowrap; position:sticky; left:0; background:var(--paper); z-index:1; }
table.wt td.name .pill{ margin-left:5px; }
table.wt tr.group td{ background:#f0f0ee; color:var(--ink-2); font-size:11px; text-transform:uppercase; letter-spacing:.05em; padding:3px 8px; }
table.wt td.cell{ position:relative; width:84px; text-align:center; cursor:cell; user-select:none; }
table.wt td.cell .t{ display:block; padding:5px 6px; min-height:26px; line-height:16px; }
table.wt td.cell.note .t{ color:var(--warn); font-style:italic; }
table.wt td.cell.selected{ box-shadow:inset 0 0 0 2px var(--accent); z-index:1; }
table.wt td.cell.unavail::after{
  content:''; position:absolute; top:0; right:0; border-style:solid; border-width:0 9px 9px 0;
  border-color:transparent var(--bad) transparent transparent;
}
table.wt td.end{ text-align:right; padding:0 8px; white-space:nowrap; color:var(--ink-2); font-variant-numeric:tabular-nums; }
table.wt td.end.over{ color:var(--bad); font-weight:600; }
.wt-wrap.painting td.cell{ cursor:copy; }

.wt-palette{ display:flex; align-items:center; gap:4px; flex-wrap:wrap; margin-bottom:6px; }
.wt-palette .lab{ font-size:11px; color:var(--ink-3); text-transform:uppercase; letter-spacing:.05em; margin:0 4px; }
.wt-palette button{ padding:2px 9px; font-size:12px; }
.wt-palette button.armed{ outline:2px solid var(--accent); outline-offset:1px; font-weight:600; }
.wt-palette button.tag{ display:inline-flex; align-items:center; gap:4px; }

.wt-editor{
  position:fixed; z-index:60; width:236px; background:var(--paper); border:1px solid var(--line);
  border-radius:6px; box-shadow:0 8px 28px rgba(0,0,0,.16); padding:6px;
}
.wt-editor input{ width:100%; text-align:center; font-size:14px; padding:4px 6px; }
.wt-editor .why{ font-size:11px; color:var(--bad); margin:4px 2px 0; }
.wt-editor ul{ list-style:none; margin:6px 0 0; padding:0; max-height:220px; overflow:auto; }
.wt-editor li{ display:flex; align-items:center; gap:8px; padding:4px 8px; border-radius:4px; cursor:pointer; }
.wt-editor li.hi{ background:var(--accent); color:#fff; }
.wt-editor li .hrs{ margin-left:auto; font-size:11px; opacity:.7; }
.wt-editor li.custom .hrs::before{ content:'custom · '; }
.wt-editor .chips{ display:flex; gap:4px; flex-wrap:wrap; margin-top:6px; padding-top:6px; border-top:1px solid var(--line-2); }
.wt-editor .chips button{ padding:2px 7px; font-size:11px; }
.wt-editor .chips button.tag{ display:inline-flex; align-items:center; gap:4px; }
.wt-editor .chips button.tag.on{ border-color:var(--ink); box-shadow:inset 0 0 0 1px var(--ink); }
.wt-editor .keys{ font-size:10px; color:var(--ink-3); margin-top:6px; }
`;

const titleCase = s => s.charAt(0) + s.slice(1).toLowerCase();

/* o = {
     store, label,
     rows(state) → [{ id, name, type }]                in display order
     get(state, id, d) → { t, tag }                    read a cell
     set(s, id, d, patch)                              write one, inside store.update
     dates(state) → Date[7] | null                     header dates
     head(state, d) → Node | null                      extra header content
     endHeads → ['Hours', …]                           extra column titles
     rowEnd(state, row) → [{ text, over? }]            extra column cells
     unavailable(state, id, d) → truthy when marked
     groups: true                                      Permanents/Casuals dividers
     palette: true                                     paint mode chips
   } */
export function mountWeekTable(root, o){
  const { store } = o;
  let sel = null, open = false, query = '', hi = 0, paint = null, focusInside = false;
  /* paint is null, { t:'7-4' } or { tag:'LSTORE'|null } */

  const palette = h('div.wt-palette');
  const wrap = h('div.wt-wrap', { tabindex: 0 });
  const editor = h('div.wt-editor', { hidden: true });
  root.append(o.palette ? palette : '', wrap);
  document.body.append(editor);

  const st = () => store.state;
  const rows = () => o.rows(st());
  const cellEl = (id, d) => wrap.querySelector(`td.cell[data-id="${id}"][data-day="${d}"]`);

  /* ---- selection ------------------------------------------------------ */

  function select(id, d, { scroll = true } = {}){
    sel = { id, day: d };
    wrap.querySelectorAll('td.cell.selected').forEach(td => td.classList.remove('selected'));
    const td = cellEl(id, d);
    if (td){ td.classList.add('selected'); if (scroll) td.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    if (open) position();
  }

  function move(di, dd){
    if (!sel) return;
    const rs = rows();
    const i = rs.findIndex(r => r.id === sel.id);
    const ni = Math.min(rs.length - 1, Math.max(0, i + di));
    const nd = Math.min(6, Math.max(0, sel.day + dd));
    select(rs[ni].id, nd);
  }

  /* ---- writing ---------------------------------------------------------- */

  const commit = (patch, label = o.label) => {
    if (!sel) return;
    const { id, day } = sel;
    const cur = o.get(st(), id, day);
    if (patch.t !== undefined && patch.tag === undefined && patch.t === cur.t) return;
    if (patch.tag !== undefined && patch.t === undefined && (patch.tag || null) === cur.tag) return;
    store.update(s => o.set(s, id, day, patch), { label });
  };

  /* ---- editor ----------------------------------------------------------- */

  const input = h('input', { type: 'text', autocomplete: 'off', spellcheck: false, placeholder: 'type a shift, or pick' });
  const why = h('div.why'), list = h('ul'), chips = h('div.chips');
  const keysHint = h('div.keys');
  editor.append(input, why, list, chips, keysHint);

  function openEditor(q = ''){
    if (!sel) return;
    open = true; query = q; hi = 0;
    input.value = q;
    editor.hidden = false;
    position();
    renderEditor();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  function closeEditor({ refocus = true } = {}){
    if (!open) return;
    open = false; editor.hidden = true;
    if (refocus) wrap.focus({ preventScroll: true });
  }

  function position(){
    const td = sel && cellEl(sel.id, sel.day);
    if (!td) return closeEditor();
    const r = td.getBoundingClientRect();
    const w = 236, hgt = editor.offsetHeight || 260;
    let left = Math.min(r.left, window.innerWidth - w - 8);
    let top  = r.bottom + 2;
    if (top + hgt > window.innerHeight - 8) top = Math.max(8, r.top - hgt - 2);
    editor.style.left = left + 'px';
    editor.style.top  = top + 'px';
  }

  function items(){ return suggestions(st(), sel.id, sel.day, query); }

  function renderEditor(){
    const s = st();
    const cell = o.get(s, sel.id, sel.day);
    const marked = o.unavailable ? o.unavailable(s, sel.id, sel.day) : null;
    why.textContent = marked ? 'Marked ' + (typeof marked === 'string' && marked !== 'date' && marked !== 'weekly' ? marked : 'unavailable') : '';
    why.hidden = !marked;

    const its = items();
    hi = Math.min(hi, Math.max(0, its.length - 1));
    fill(list, its.map((it, i) => {
      const p = parseShift(it.text);
      return h('li' + (i === hi ? '.hi' : '') + (it.custom ? '.custom' : ''), {
        onmousedown: e => e.preventDefault(),
        onclick: () => accept(it.text, 0, 0)
      }, it.text, h('span.hrs', p.kind === 'work' ? hoursLabel(p.minutes) : ''));
    }));
    if (!its.length) list.append(h('li', { style: { color: 'var(--ink-3)' } }, 'nothing matches — Enter keeps what you typed'));

    fill(chips,
      h('button', { type: 'button', onmousedown: e => e.preventDefault(), onclick: () => accept('OFF', 0, 0) }, 'OFF'),
      h('button', { type: 'button', onmousedown: e => e.preventDefault(), onclick: () => { commit({ t: '', tag: null }); closeEditor(); } }, 'Clear'),
      s.tags.map(t => h('button.tag' + (cell.tag === t.id ? '.on' : ''), {
        type: 'button', title: t.label,
        onmousedown: e => e.preventDefault(),
        onclick: () => { commit({ tag: cell.tag === t.id ? null : t.id }); }
      }, h('span.swatch', { style: { background: t.color } }), titleCase(t.label))));
    keysHint.textContent = '↑↓ choose · Enter down · Tab right · Esc';
  }

  /* Write `text`, close, and move the selection (di rows, dd days). */
  function accept(text, di, dd){
    const t = text === undefined ? (items()[hi] ? items()[hi].text : query.trim()) : text;
    commit({ t });
    closeEditor();
    if (di || dd) move(di, dd);
  }

  input.addEventListener('input', () => { query = input.value; hi = 0; renderEditor(); });
  input.addEventListener('keydown', e => {
    switch (e.key){
      case 'ArrowDown': e.preventDefault(); hi = Math.min(hi + 1, items().length - 1); renderEditor(); break;
      case 'ArrowUp':   e.preventDefault(); hi = Math.max(hi - 1, 0); renderEditor(); break;
      case 'Enter':     e.preventDefault(); accept(undefined, e.shiftKey ? -1 : 1, 0); break;
      case 'Tab':       e.preventDefault(); accept(undefined, 0, e.shiftKey ? -1 : 1); break;
      case 'Escape':    e.preventDefault(); closeEditor(); break;
      case 'Delete':    if (!input.value){ e.preventDefault(); commit({ t: '', tag: null }); closeEditor(); } break;
    }
  });
  input.addEventListener('blur', () => setTimeout(() => { if (open && !editor.contains(document.activeElement)) closeEditor({ refocus: false }); }, 0));

  /* ---- table keys ------------------------------------------------------- */

  wrap.addEventListener('keydown', e => {
    if (!sel || open) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key){
      case 'ArrowDown':  e.preventDefault(); move(1, 0); break;
      case 'ArrowUp':    e.preventDefault(); move(-1, 0); break;
      case 'ArrowLeft':  e.preventDefault(); move(0, -1); break;
      case 'ArrowRight': e.preventDefault(); move(0, 1); break;
      case 'Tab':        e.preventDefault(); move(0, e.shiftKey ? -1 : 1); break;
      case 'Enter': case 'F2': case ' ': e.preventDefault(); openEditor(''); break;
      case 'Delete': case 'Backspace': e.preventDefault(); commit({ t: '', tag: null }); break;
      case 'Escape': if (paint) arm(null); break;
      default:
        if (e.key.length === 1){ e.preventDefault(); openEditor(e.key); }
    }
  });
  wrap.addEventListener('focusin', () => { focusInside = true; });
  wrap.addEventListener('focusout', e => { if (!wrap.contains(e.relatedTarget) && !editor.contains(e.relatedTarget)) focusInside = false; });
  wrap.addEventListener('scroll', () => { if (open) position(); });
  window.addEventListener('resize', () => { if (open) position(); });

  /* ---- paint mode -------------------------------------------------------- */

  const samePaint = (a, b) => !!a && !!b && a.t === b.t && a.tag === b.tag;

  function arm(p){
    paint = samePaint(paint, p) ? null : p;
    wrap.classList.toggle('painting', !!paint);
    renderPalette(st());
  }

  function renderPalette(state){
    if (!o.palette) return;
    const texts = ['OFF', ...popular(state, 8).filter(t => t !== 'OFF')].slice(0, 8);
    const chip = (p, label, extra) => h('button' + (samePaint(paint, p) ? '.armed' : '') + (extra ? '.tag' : ''),
      { type: 'button', title: 'Click, then click cells to stamp ' + label, onclick: () => arm(p) }, extra, label);
    fill(palette,
      h('span.lab', 'paint'),
      texts.map(t => chip({ t }, t)),
      h('span.lab', 'colour'),
      state.tags.map(t => chip({ tag: t.id }, titleCase(t.label), h('span.swatch', { style: { background: t.color } }))),
      chip({ tag: null }, 'Plain'),
      paint ? h('span.muted', { style: { fontSize: '11px' } }, 'click cells · Esc to stop') : null);
  }

  /* ---- render ------------------------------------------------------------ */

  function render(state){
    const rs = rows(), dates = o.dates ? o.dates(state) : null;
    const table = h('table.wt');
    table.append(h('thead', h('tr', {},
      h('th', 'Name'),
      DAY_SHORT.map((d, i) => h('th.day', {}, d, dates ? h('span.date', dates[i].getDate() + ' ' + MONTHS[dates[i].getMonth()]) : null, o.head ? o.head(state, i) : null)),
      (o.endHeads || []).map(t => h('th.end', t)))));

    const body = h('tbody');
    let lastType = null;
    for (const r of rs){
      if (o.groups && r.type !== lastType){
        lastType = r.type;
        body.append(h('tr.group', h('td', { colSpan: 8 + (o.endHeads || []).length }, r.type === 'casual' ? 'Casuals' : 'Permanents')));
      }
      const tr = h('tr', {}, h('td.name', {}, r.name, r.type === 'casual' && !o.groups ? h('span.pill.casual', 'casual') : null));
      for (let d = 0; d < 7; d++){
        const cell = o.get(state, r.id, d);
        const parsed = parseShift(cell.t);
        const col = cellColor(state, cell);
        const marked = o.unavailable ? o.unavailable(state, r.id, d) : null;
        const td = h('td.cell.' + parsed.kind + (marked ? '.unavail' : '') + (sel && sel.id === r.id && sel.day === d ? '.selected' : ''), {
          dataset: { id: r.id, day: d },
          title: (parsed.kind === 'work' ? hoursLabel(parsed.minutes) : '') + (marked ? (parsed.kind === 'work' ? ' · ' : '') + 'marked unavailable' : ''),
          onmousedown: e => {
            if (e.button !== 0) return;
            e.preventDefault();
            if (paint){ select(r.id, d, { scroll: false }); commit(paint); return; }
            const same = sel && sel.id === r.id && sel.day === d;
            closeEditor({ refocus: false });
            select(r.id, d, { scroll: false });
            wrap.focus({ preventScroll: true });
            openEditor(same && open ? query : '');
          },
          oncontextmenu: e => {
            e.preventDefault();
            select(r.id, d, { scroll: false }); closeEditor();
            showTagMenu(state, e.clientX, e.clientY, cell.tag, tag => commit({ tag }), [
              { label: 'OFF', onclick: () => commit({ t: 'OFF' }) },
              { label: 'Clear', onclick: () => commit({ t: '', tag: null }) }
            ]);
          }
        }, h('span.t', cell.t));
        if (col){ td.style.background = col.color; td.style.color = col.ink; }
        tr.append(td);
      }
      for (const e of (o.rowEnd ? o.rowEnd(state, r) : [])) tr.append(h('td.end' + (e.over ? '.over' : ''), e.text));
      body.append(tr);
    }
    table.append(body);
    const scrollTop = wrap.scrollTop, scrollLeft = wrap.scrollLeft;
    fill(wrap, table);
    wrap.scrollTop = scrollTop; wrap.scrollLeft = scrollLeft;
    renderPalette(state);

    /* the selection may point at a row that has gone */
    if (sel && !rs.some(r => r.id === sel.id)){ sel = null; closeEditor(); }
    if (sel){
      const td = cellEl(sel.id, sel.day);
      if (td) td.classList.add('selected');
      if (open){ position(); renderEditor(); }
      else if (focusInside && document.activeElement !== wrap) wrap.focus({ preventScroll: true });
    }
  }

  function destroy(){ closeEditor({ refocus: false }); editor.remove(); }

  return { render, destroy, select: (id, d) => select(id, d), get selection(){ return sel; } };
}

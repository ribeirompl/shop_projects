/* ==========================================================================
   print.js — the printed roster, as SVG pages measured in millimetres.

   The whole sheet is one <svg> per page with viewBox in mm, so the paper
   coming out of the printer is exactly this drawing. Colours are SVG
   <rect> fills, not CSS backgrounds: browsers drop CSS backgrounds when
   "Background graphics" is off in the print dialog, which it is by
   default, and a roster whose OFF days lost their yellow is a roster that
   gets misread.

   Two layouts, both A4 landscape, both from the same cells:

     byday     — for management: seven columns, each a list of (name,
                 hours) pairs in start-time order, so the column reads
                 top-to-bottom through the day.
     bystaff   — for the staff room: one row per person, alphabetical,
                 seven hour cells. No totals; that is not the staff's
                 business.

   layoutPages() is pure geometry (rects and text runs with x/y/w/h) so
   the tests can prove nothing leaves the page; rosterPages() turns that
   into markup.
   ========================================================================== */

import { DAYS, DAY_SHORT, weekDates, fmtDay, weekLabel, getCell, cellColor, OFF_COLOR } from './model.js';
import { parseShift } from './shifts.js';
import { esc } from './dom.js';

export const PAGE   = { w: 297, h: 210 };   /* A4 landscape */
export const MARGIN = 8;
export const FONT   = 'Arial, Helvetica, sans-serif';

const HEADER_GREY = '#808080';
const NOTICE_RED  = '#FF0000';
const RULE        = '#9a9a9a';
const ROW_MIN = 3.4, ROW_MAX = 6.2;   /* mm */

/* ---- content -------------------------------------------------------------- */

const kindRank = { work: 0, off: 1, leave: 2, note: 3, blank: 4 };

/* One entry per (person, day) worth printing. */
function entry(state, s, d){
  const cell = getCell(state, s.id, d);
  const parsed = parseShift(cell.t);
  const col = cellColor(state, cell);
  return { id: s.id, name: s.name, text: cell.t, parsed, fill: col ? col.color : null, ink: col ? col.ink : '#000' };
}

/* Column lists for the byday layout, in start-time order. Blank cells are
   left out — a name with nothing beside it only invites the question "so
   am I on or not?" */
export function dayColumns(state){
  return DAYS.map((_, d) =>
    state.staff.map(s => entry(state, s, d)).filter(e => e.parsed.kind !== 'blank').sort((a, b) =>
      (kindRank[a.parsed.kind] - kindRank[b.parsed.kind]) ||
      ((a.parsed.spans[0]?.start ?? 0) - (b.parsed.spans[0]?.start ?? 0)) ||
      ((a.parsed.spans[0]?.end ?? 0) - (b.parsed.spans[0]?.end ?? 0)) ||
      a.name.localeCompare(b.name)));
}

export const staffAlphabetical = state => [...state.staff].sort((a, b) => a.name.localeCompare(b.name));

/* ---- geometry ------------------------------------------------------------- */

function chrome(state){
  const W = PAGE.w - 2 * MARGIN;
  const els = [];
  let y = MARGIN;

  els.push({ kind: 'text', x: MARGIN, y: y + 3.2, size: 4.2, weight: 700, text: 'Shift roster' });
  els.push({ kind: 'text', x: MARGIN + 32, y: y + 3.2, size: 3.6, text: weekLabel(state) });
  y += 7;

  /* footer: legend + notice, measured from the bottom */
  const footer = [];
  let fy = PAGE.h - MARGIN;
  if (state.notice){
    fy -= 6;
    footer.push({ kind: 'rect', x: MARGIN, y: fy, w: W, h: 6, fill: NOTICE_RED });
    footer.push({ kind: 'text', x: MARGIN + W / 2, y: fy + 3.9, size: 3.2, weight: 700, anchor: 'middle', fill: '#fff', text: state.notice });
  }
  fy -= 6.5;
  const legend = [{ label: 'OFF', color: OFF_COLOR }, ...state.tags.map(t => ({ label: t.label, color: t.color }))];
  const lw = Math.min(40, W / legend.length);
  legend.forEach((l, i) => {
    const x = MARGIN + i * lw;
    footer.push({ kind: 'rect', x, y: fy + 1, w: 8, h: 4.2, fill: l.color, stroke: '#666' });
    footer.push({ kind: 'text', x: x + 9.5, y: fy + 4.1, size: 2.8, text: l.label, clip: lw - 11 });
  });
  return { els, footer, top: y, bottom: fy - 2, W };
}

function rowHeightFor(rows, avail){
  return Math.max(ROW_MIN, Math.min(ROW_MAX, avail / Math.max(rows, 1)));
}

/* Split `n` rows into pages of at most `per`. */
const chunks = (n, per) => { const out = []; for (let i = 0; i < n; i += per) out.push([i, Math.min(n, i + per)]); return out; };

function bydayPages(state){
  const cols  = dayColumns(state);
  const dates = weekDates(state);
  const { els: head, footer, top, bottom, W } = chrome(state);

  const cw = W / 7, nameW = cw * 0.64;
  const headH = 10;                              /* date row + weekday row */
  const avail = bottom - top - headH;
  const rowsMax = Math.max(...cols.map(c => c.length), 1);
  const rowH = rowHeightFor(rowsMax, avail);
  const perPage = Math.max(1, Math.floor(avail / rowH));
  const font = Math.min(3.4, rowH * 0.6);

  return chunks(rowsMax, perPage).map(([from, to]) => {
    const els = [...head];
    let y = top;
    DAYS.forEach((day, d) => {
      const x = MARGIN + d * cw;
      els.push({ kind: 'text', x: x + cw / 2, y: y + 3.4, size: 3.2, weight: 700, anchor: 'middle', text: fmtDay(dates[d]) });
      els.push({ kind: 'rect', x, y: y + 5, w: cw, h: 5, fill: HEADER_GREY });
      els.push({ kind: 'text', x: x + cw / 2, y: y + 8.6, size: 3.2, weight: 700, anchor: 'middle', fill: '#fff', text: day });
    });
    y += headH;
    for (let r = from; r < to; r++){
      const ry = y + (r - from) * rowH;
      DAYS.forEach((_, d) => {
        const e = cols[d][r];
        const x = MARGIN + d * cw;
        els.push({ kind: 'rect', x, y: ry, w: cw, h: rowH, fill: 'none', stroke: RULE, sw: 0.15 });
        if (!e) return;
        if (e.fill) els.push({ kind: 'rect', x: x + 0.15, y: ry + 0.15, w: nameW - 0.3, h: rowH - 0.3, fill: e.fill });
        els.push({ kind: 'text', x: x + 1.2, y: ry + rowH * 0.68, size: font, fill: e.fill ? e.ink : '#000', text: e.name, clip: nameW - 2 });
        els.push({ kind: 'text', x: x + nameW + 1, y: ry + rowH * 0.68, size: font, text: e.text, clip: cw - nameW - 1.5 });
      });
    }
    els.push(...footer);
    return { w: PAGE.w, h: PAGE.h, els };
  });
}

function bystaffPages(state){
  const dates = weekDates(state);
  const { els: head, footer, top, bottom, W } = chrome(state);

  const nameW = 34;
  const cw = (W - nameW) / 7;
  const headH = 10;
  const avail = bottom - top - headH;
  const rows = staffAlphabetical(state);
  const rowH = rowHeightFor(rows.length, avail);
  const perPage = Math.max(1, Math.floor(avail / rowH));
  const font = Math.min(3.4, rowH * 0.6);

  return chunks(rows.length, perPage).map(([from, to]) => {
    const els = [...head];
    let y = top;
    els.push({ kind: 'rect', x: MARGIN, y: y + 5, w: W, h: 5, fill: HEADER_GREY });
    els.push({ kind: 'text', x: MARGIN + 1.2, y: y + 8.6, size: 3.2, weight: 700, fill: '#fff', text: 'Name' });
    DAYS.forEach((day, d) => {
      const x = MARGIN + nameW + d * cw;
      els.push({ kind: 'text', x: x + cw / 2, y: y + 3.4, size: 3.2, weight: 700, anchor: 'middle', text: fmtDay(dates[d]) });
      els.push({ kind: 'text', x: x + cw / 2, y: y + 8.6, size: 3.2, weight: 700, anchor: 'middle', fill: '#fff', text: day });
    });
    y += headH;

    for (let r = from; r < to; r++){
      const s = rows[r];
      const ry = y + (r - from) * rowH;
      els.push({ kind: 'rect', x: MARGIN, y: ry, w: W, h: rowH, fill: 'none', stroke: RULE, sw: 0.15 });
      els.push({ kind: 'text', x: MARGIN + 1.2, y: ry + rowH * 0.68, size: font, weight: 700, text: s.name, clip: nameW - 2 });
      for (let d = 0; d < 7; d++){
        const e = entry(state, s, d);
        const x = MARGIN + nameW + d * cw;
        if (e.fill) els.push({ kind: 'rect', x: x + 0.15, y: ry + 0.15, w: cw - 0.3, h: rowH - 0.3, fill: e.fill });
        if (e.text) els.push({ kind: 'text', x: x + cw / 2, y: ry + rowH * 0.68, size: font, anchor: 'middle', fill: e.fill ? e.ink : '#000', text: e.text, clip: cw - 1 });
      }
    }
    els.push(...footer);
    return { w: PAGE.w, h: PAGE.h, els };
  });
}

/* [{ w, h, els:[{kind:'rect'|'text', …}] }] — everything in mm. */
export function layoutPages(state, style = 'byday'){
  return style === 'bystaff' ? bystaffPages(state) : bydayPages(state);
}

/* ---- markup --------------------------------------------------------------- */

const num = n => (Math.round(n * 100) / 100).toString();

function render(el){
  if (el.kind === 'rect'){
    return `<rect x="${num(el.x)}" y="${num(el.y)}" width="${num(el.w)}" height="${num(el.h)}" fill="${el.fill}"` +
      (el.stroke ? ` stroke="${el.stroke}" stroke-width="${num(el.sw ?? 0.2)}"` : '') + '/>';
  }
  /* Long names are squeezed, not cut: textLength keeps them inside the cell. */
  const approxW = el.text.length * el.size * 0.52;
  const squeeze = el.clip && approxW > el.clip ? ` textLength="${num(el.clip)}" lengthAdjust="spacingAndGlyphs"` : '';
  return `<text x="${num(el.x)}" y="${num(el.y)}" font-size="${num(el.size)}"` +
    (el.weight ? ` font-weight="${el.weight}"` : '') +
    (el.anchor ? ` text-anchor="${el.anchor}"` : '') +
    (el.fill ? ` fill="${el.fill}"` : '') + squeeze + `>${esc(el.text)}</text>`;
}

export function pageSVG(p){
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.w}mm" height="${p.h}mm" viewBox="0 0 ${p.w} ${p.h}" ` +
    `font-family="${FONT}" fill="#000">` +
    `<rect x="0" y="0" width="${p.w}" height="${p.h}" fill="#fff"/>` +
    p.els.map(render).join('') + '</svg>';
}

export function rosterPages(state, style){
  return layoutPages(state, style).map(pageSVG);
}

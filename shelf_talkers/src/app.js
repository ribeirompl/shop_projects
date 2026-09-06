/* ==========================================================================
   app.js — state, entry table, layout picker, preview, print
   --------------------------------------------------------------------------
   The DOM and browser-facing half of the program. Everything with an answer
   that can be checked without a browser lives elsewhere:

     layout.js   sheet size, pagination, the picker thumbnails
     designs.js  where each design puts its slots inside a cell
     fit.js      what font size a slot's text ends up at
     text.js     escaping and price-line splitting
   ========================================================================== */

import {
  MM, LAYOUT_PRESETS, MAX_GRID,
  pageMM, previewSummary, sheetCells, thumbSVG
} from './layout.js';

import { isBlank } from './text.js';
import { DESIGNS, DESIGN_BY_ID } from './designs.js';
import { runAll, compact } from './fit.js';

const STORE_KEY = 'shelf-talkers.v1';

const EXAMPLE = [
  { name:'BANANAS', price:'R9.99', detail:'PER KG' },
  { name:'ALBANY EVERYDAY WHITE BREAD 700G & FAIRCAPE MILK SACHET',
    price:'BOTH FOR\nR32', detail:'COMBO' },
  { name:'CLOVER FULL CREAM MILK', price:'2 FOR R45', detail:'2 LITRE' }
];

/* ---------- state --------------------------------------------------------- */

let state = {
  items: [],
  design: 'bestbuy',
  paper: 'A4',
  orientation: 'portrait',
  cols: 1,
  rows: 3,
  showBlurb: true
};

let nextId = 1;
const newItem = (o = {}) => ({ id: nextId++, name:'', price:'', detail:'', ...o });

const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

function load(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) { state.items = EXAMPLE.map(newItem); return; }
    const saved = JSON.parse(raw);
    state = { ...state, ...saved };
    state.items = (saved.items || []).map(newItem);
  }catch(e){
    state.items = EXAMPLE.map(newItem);
  }
  if (!state.items.length) state.items = [newItem()];
}

let saveTimer = null;
function save(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try{
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      const t = new Date();
      $('#save-state').textContent = 'Saved ' +
        String(t.getHours()).padStart(2,'0') + ':' + String(t.getMinutes()).padStart(2,'0');
    }catch(e){
      $('#save-state').textContent = 'Could not save';
    }
  }, 350);
}

/* ==========================================================================
   ENTRY TABLE
   ========================================================================== */

function el2(tag, cls, parent){
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (parent) parent.appendChild(n);
  return n;
}

/* Grow a field to its content instead of making the user scroll inside it.
   Only reads back correctly once the row is in the document: scrollHeight on
   a detached node is 0, which would open every field at the 36px floor. */
function autoGrow(ta){
  ta.style.height = 'auto';
  ta.style.height = Math.max(36, ta.scrollHeight) + 'px';
}

function renderTable(){
  const host = $('#rows');
  host.innerHTML = '';

  state.items.forEach((item, idx) => {
    const row = el2('div', 'row');
    row.dataset.idx = idx;

    const grip = el2('div', 'grip', row);
    grip.textContent = '⠿';
    grip.title = 'Drag to reorder';

    /* A textarea, not an input: names run long, and wrapping them into view
       beats scrolling a one-line box you cannot read the middle of. */
    const name = el2('textarea', 'f-name', row);
    name.value = item.name; name.rows = 1; name.placeholder = 'Item name';

    const price = el2('textarea', '', row);
    price.value = item.price; price.rows = 1;
    price.placeholder = 'R9.99';
    price.title = 'Enter starts a new line — each line is sized on its own';

    const detail = el2('input', '', row);
    detail.value = item.detail; detail.placeholder = 'PER KG';

    const acts = el2('div', 'row-acts', row);
    const dup = el2('button', 'icon-btn', acts); dup.textContent = '⧉'; dup.title = 'Duplicate';
    const del = el2('button', 'icon-btn del', acts); del.textContent = '✕'; del.title = 'Delete';

    name.oninput   = () => { item.name   = name.value;   autoGrow(name);  touch(); };
    detail.oninput = () => { item.detail = detail.value; touch(); };
    price.oninput  = () => { item.price  = price.value;  autoGrow(price); touch(); };

    /* Enter adds a row rather than a newline — a name is always one line, and
       the price splits on Enter through its own handler in text.js. */
    name.onkeydown = e => {
      if (e.key === 'Enter'){ e.preventDefault(); addItemAfter(idx); }
    };

    dup.onclick = () => {
      state.items.splice(idx + 1, 0, newItem({ ...item, id: undefined }));
      refresh();
    };
    del.onclick = () => {
      state.items.splice(idx, 1);
      if (!state.items.length) state.items.push(newItem());
      refresh();
    };

    wireDrag(row, grip, idx);
    host.appendChild(row);
    autoGrow(name); autoGrow(price);   // in the document by now, so measurable
  });
}

function addItemAfter(idx){
  state.items.splice(idx + 1, 0, newItem());
  refresh();
  const rows = $$('#rows .row');
  const field = rows[idx + 1] && rows[idx + 1].querySelector('.f-name');
  if (field) field.focus();
}

/* ---- drag to reorder ---- */
let dragFrom = null;
function wireDrag(row, grip, idx){
  grip.onmousedown = () => { row.draggable = true; };
  row.onmouseup    = () => { row.draggable = false; };

  row.ondragstart = e => {
    dragFrom = idx;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  };
  row.ondragend = () => {
    row.classList.remove('dragging');
    row.draggable = false;
    $$('#rows .row').forEach(r => r.classList.remove('drop-before','drop-after'));
  };
  row.ondragover = e => {
    e.preventDefault();
    const r = row.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    row.classList.toggle('drop-after', after);
    row.classList.toggle('drop-before', !after);
  };
  row.ondragleave = () => row.classList.remove('drop-before','drop-after');
  row.ondrop = e => {
    e.preventDefault();
    const r = row.getBoundingClientRect();
    let to = e.clientY > r.top + r.height / 2 ? idx + 1 : idx;
    if (dragFrom == null || dragFrom === to) return;
    const [moved] = state.items.splice(dragFrom, 1);
    if (dragFrom < to) to--;
    state.items.splice(to, 0, moved);
    dragFrom = null;
    refresh();
  };
}

/* ==========================================================================
   SHEETS
   ========================================================================== */

const liveItems = () => state.items.filter(i => !isBlank(i));

/* One page: a sheet sized in mm, holding the cell grid. Returns the grid,
   which is what cells get appended to. */
function newSheet(host, pwMM, phMM, scale){
  const wrap  = el2('div', 'sheet-wrap', host);
  const sheet = el2('div', 'sheet', wrap);
  sheet.style.width  = pwMM + 'mm';
  sheet.style.height = phMM + 'mm';
  sheet.style.setProperty('--scale', scale);

  if (scale !== 1){
    wrap.style.width  = (pwMM * MM * scale) + 'px';
    wrap.style.height = (phMM * MM * scale) + 'px';
  }

  const grid = el2('div', 'grid', sheet);
  grid.style.gridTemplateColumns = `repeat(${state.cols}, 1fr)`;
  grid.style.gridTemplateRows    = `repeat(${state.rows}, 1fr)`;
  return grid;
}

/* Build every page of artwork into `host`. scale=1 for print, fitted for preview. */
function buildSheets(host, scale){
  host.innerHTML = '';

  const design = DESIGN_BY_ID[state.design];
  const [pwMM, phMM] = pageMM(state);
  const items = liveItems();

  const allTasks = [];
  let grid = null;

  for (const c of sheetCells(items, state)){
    if (c.index === 0) grid = newSheet(host, pwMM, phMM, scale);

    const cell = el2('div', 'cell', grid);
    if (c.lastCol) cell.classList.add('last-col');
    if (c.lastRow) cell.classList.add('last-row');

    if (!c.item){ cell.classList.add('empty'); continue; }

    const cellW = cell.clientWidth, cellH = cell.clientHeight;
    const ctx = { cellW, cellH, aspect: cellW / cellH, showBlurb: state.showBlurb };
    allTasks.push(...design.render(cell, c.item, ctx));
  }

  runAll(allTasks);
  host.querySelectorAll('.cell').forEach(compact);   // reclaim dead space
}

function renderPreview(){
  const host = $('#preview');
  const [pwMM] = pageMM(state);
  const avail = Math.max(200, host.clientWidth - 32);
  const scale = Math.min(1, avail / (pwMM * MM));

  buildSheets(host, scale);
  $('#preview-info').textContent = previewSummary(liveItems(), state);
}

/* ==========================================================================
   CONTROLS
   ========================================================================== */

function renderDesignSeg(){
  const host = $('#design-seg');
  host.innerHTML = '';
  DESIGNS.forEach(d => {
    const b = el2('button', '', host);
    b.type = 'button';
    b.textContent = d.label;
    b.setAttribute('aria-pressed', String(state.design === d.id));
    b.onclick = () => { state.design = d.id; refresh(); };
  });
}

function renderOrientSeg(){
  const host = $('#orient-seg');
  host.innerHTML = '';
  [['portrait','Portrait'],['landscape','Landscape']].forEach(([v, label]) => {
    const b = el2('button', '', host);
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-pressed', String(state.orientation === v));
    b.onclick = () => { state.orientation = v; renderOrientSeg(); renderLayoutGrid(); refresh(); };
  });
}

function renderLayoutGrid(){
  const host = $('#layout-grid');
  host.innerHTML = '';
  LAYOUT_PRESETS.forEach(([c, r]) => {
    const b = el2('button', 'lay', host);
    b.type = 'button';
    b.innerHTML = thumbSVG(c, r, 44, state) + `<span>${c} × ${r}</span>`;
    b.setAttribute('aria-pressed', String(state.cols === c && state.rows === r));
    b.onclick = () => { state.cols = c; state.rows = r; closePop(); refresh(); };
  });
  $('#custom-cols').value = state.cols;
  $('#custom-rows').value = state.rows;
}

function renderLayoutButton(){
  $('#layout-btn-thumb').innerHTML = thumbSVG(state.cols, state.rows, 22, state);
  $('#layout-btn-text').textContent =
    `${state.cols} × ${state.rows}` +
    (state.orientation === 'landscape' ? ' · landscape' : '');
}

/* ---- popover ---- */
function openPop(){
  const pop = $('#layout-pop'), btn = $('#layout-btn');
  const r = btn.getBoundingClientRect();
  pop.hidden = false;
  pop.style.left = Math.min(r.left, window.innerWidth - pop.offsetWidth - 12) + 'px';
  pop.style.top  = (r.bottom + 6) + 'px';
  renderLayoutGrid();
  setTimeout(() => document.addEventListener('mousedown', outsideClose), 0);
}
function closePop(){
  $('#layout-pop').hidden = true;
  document.removeEventListener('mousedown', outsideClose);
}
function outsideClose(e){
  if (!$('#layout-pop').contains(e.target) && !$('#layout-btn').contains(e.target)) closePop();
}

/* ==========================================================================
   PRINT
   ========================================================================== */

function setPageRule(){
  let st = document.getElementById('page-rule');
  if (!st){
    st = document.createElement('style');
    st.id = 'page-rule';
    document.head.appendChild(st);
  }
  const [w, h] = pageMM(state);
  st.textContent = `@page{size:${w}mm ${h}mm;margin:0}`;
}

/* Sheets are built unscaled into the off-screen #print-root. This must also
   happen for Ctrl+P and File→Print, not just our own button, or those paths
   print a blank page. */
function preparePrint(){
  const root = $('#print-root');
  if (!root.children.length) buildSheets(root, 1);
}

function doPrint(){
  preparePrint();
  requestAnimationFrame(() => window.print());
}

window.addEventListener('beforeprint', preparePrint);
window.addEventListener('afterprint', () => { $('#print-root').innerHTML = ''; });

/* ==========================================================================
   WIRING
   ========================================================================== */

let refreshTimer = null;
function touch(){                       // cheap path: data changed, table stays
  save();
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(renderPreview, 140);
}
function refresh(){                     // full path: structure changed
  save();
  setPageRule();
  renderDesignSeg();
  renderLayoutButton();
  renderTable();
  renderPreview();
}

function init(){
  load();

  $('#btn-print').onclick   = doPrint;
  $('#btn-add').onclick     = () => addItemAfter(state.items.length - 1);
  $('#btn-example').onclick = () => { state.items = EXAMPLE.map(newItem); refresh(); };
  $('#btn-clear').onclick   = () => {
    if (!confirm('Clear all items?')) return;
    state.items = [newItem()];
    refresh();
  };
  $('#chk-blurb').checked = state.showBlurb;
  $('#chk-blurb').onchange = e => { state.showBlurb = e.target.checked; refresh(); };

  $('#layout-btn').onclick = () => ($('#layout-pop').hidden ? openPop() : closePop());
  $('#custom-apply').onclick = () => {
    const clamp = v => Math.max(1, Math.min(MAX_GRID, +v || 1));
    state.cols = clamp($('#custom-cols').value);
    state.rows = clamp($('#custom-rows').value);
    closePop();
    refresh();
  };

  renderOrientSeg();

  let rt = null;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(renderPreview, 120);
  });

  refresh();
}

document.addEventListener('DOMContentLoaded', init);

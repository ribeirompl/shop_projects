/* ==========================================================================
   app.js — images, settings, preview, PDF export
   --------------------------------------------------------------------------
   jsPDF writes the document and Sortable handles reordering; neither job is
   reimplemented here. Both are bundled into the output file by build.js, so
   the tool still runs with no network.

   Preview and PDF share layout.js, so what you see is the arithmetic the
   document is built from rather than a lookalike.
   ========================================================================== */

import { jsPDF } from 'jspdf';
import Sortable from 'sortablejs';
import { pageMM, cellRects, placements, pageCount, formatOf } from './layout.js';

const MM = 96 / 25.4;                       // CSS px per mm

const GRID_PRESETS = [
  [1,1],[1,2],[2,1],[2,2],[2,3],[3,2],
  [1,4],[4,1],[3,3],[2,4],[4,2],[3,4],[4,3],[4,4]
];

const STORE_KEY = 'image-grid.v1';

/* ---------- state --------------------------------------------------------
   Settings persist; images do not. A handful of photos as data URLs blows
   past the ~5 MB localStorage quota, and a silent quota failure mid-save is
   worse than simply starting empty. */

let settings = {
  paper: 'A4',
  orientation: 'portrait',
  cols: 2,
  rows: 2,
  align: 'center',
  margin: 10                                // mm, inset around the whole block
};

let images = [];                            // { id, src, name, w, h }
let nextId = 1;

const $  = s => document.querySelector(s);

function el(tag, cls, parent){
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (parent) parent.appendChild(n);
  return n;
}

function loadSettings(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) settings = { ...settings, ...JSON.parse(raw) };
  }catch(e){ /* corrupt or unavailable — the defaults are fine */ }
}
function saveSettings(){
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(settings)); }catch(e){}
}

/* ==========================================================================
   IMAGES
   ========================================================================== */

/* Natural pixel size is read once, here, because both the preview and the
   PDF need the aspect ratio and decoding every image again per render would
   make dragging a slider crawl. */
function readImage(file){
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = e => {
      const src = e.target.result;
      const probe = new Image();
      probe.onerror = () => resolve(null);
      probe.onload = () => resolve({
        id: nextId++, src, name: file.name,
        w: probe.naturalWidth, h: probe.naturalHeight
      });
      probe.src = src;
    };
    reader.readAsDataURL(file);
  });
}

async function addFiles(files){
  const picked = Array.from(files).filter(f => /^image\//.test(f.type));
  if (!picked.length) return;

  setBusy(true, 'Reading ' + picked.length + ' image' + (picked.length === 1 ? '' : 's') + '…');
  /* Read in parallel, but keep the order they were picked in — FileReader
     finishes in size order, not selection order. */
  const loaded = (await Promise.all(picked.map(readImage))).filter(Boolean);
  images.push(...loaded);
  setBusy(false);

  const failed = picked.length - loaded.length;
  refresh();
  if (failed) status(failed + ' file' + (failed === 1 ? '' : 's') + ' could not be read');
}

function renderThumbs(){
  const host = $('#thumbs');
  host.innerHTML = '';

  images.forEach((img, idx) => {
    const t = el('div', 'thumb', host);
    t.dataset.id = String(img.id);
    t.title = img.name || '';

    const pic = el('img', '', t);
    pic.src = img.src;
    pic.alt = img.name || '';

    el('span', 'ord', t).textContent = idx + 1;

    const rm = el('button', 'rm', t);
    rm.type = 'button';
    rm.textContent = '×';
    rm.title = 'Remove';
    rm.onclick = e => {
      e.stopPropagation();
      images = images.filter(i => i.id !== img.id);
      refresh();
    };
  });

  const n = images.length;
  $('#thumbs-count').textContent = n
    ? n + ' image' + (n === 1 ? '' : 's')
    : 'No images yet';
}

/* Sortable is created once over the container and survives re-renders, so it
   must be told to read the new order out of the DOM rather than the reverse. */
function initSortable(){
  Sortable.create($('#thumbs'), {
    animation: 150,
    ghostClass: 'thumb-ghost',
    onEnd(){
      const order = Array.from($('#thumbs').children).map(n => n.dataset.id);
      images.sort((a, b) => order.indexOf(String(a.id)) - order.indexOf(String(b.id)));
      refresh();
    }
  });
}

/* ==========================================================================
   PREVIEW
   --------------------------------------------------------------------------
   Every page is drawn at true mm size and scaled down with a transform, so
   the preview is a photograph of the geometry rather than a second opinion
   about it.
   ========================================================================== */

function renderPreview(){
  const host = $('#preview');
  host.innerHTML = '';

  const [pwMM, phMM] = pageMM(settings);
  const avail = Math.max(200, host.clientWidth - 32);
  const scale = Math.min(1, avail / (pwMM * MM));

  const rects   = cellRects(settings);
  const perPage = rects.length;
  const pages   = pageCount(images, settings);
  const sheets  = [];

  for (let p = 0; p < pages; p++){
    const wrap  = el('div', 'sheet-wrap', host);
    wrap.style.width  = (pwMM * MM * scale) + 'px';
    wrap.style.height = (phMM * MM * scale) + 'px';

    const sheet = el('div', 'sheet', wrap);
    sheet.style.width  = pwMM + 'mm';
    sheet.style.height = phMM + 'mm';
    sheet.style.setProperty('--scale', scale);
    sheets.push(sheet);

    rects.forEach(cell => place(el('div', 'guide', sheet), cell));
  }

  /* The same placement list the PDF is written from. */
  placements(images, settings).forEach(pl => {
    const pic = el('img', 'placed', sheets[pl.page]);
    pic.src = pl.img.src;
    pic.alt = pl.img.name || '';
    place(pic, pl.rect);
  });

  const blanks = pages * perPage - images.length;
  $('#preview-info').textContent = images.length
    ? images.length + ' image' + (images.length === 1 ? '' : 's') +
      ' · ' + settings.cols + '×' + settings.rows +
      ' (' + perPage + ' per page) · ' +
      pages + ' page' + (pages === 1 ? '' : 's') +
      (blanks ? ' · ' + blanks + ' blank cell' + (blanks === 1 ? '' : 's') : '')
    : 'Add images to see the pages';
}

function place(node, r){
  node.style.left   = r.x + 'mm';
  node.style.top    = r.y + 'mm';
  node.style.width  = r.w + 'mm';
  node.style.height = r.h + 'mm';
}

/* ==========================================================================
   PDF
   ========================================================================== */

async function makePDF(){
  if (!images.length){ status('Add some images first'); return; }

  setBusy(true, 'Building PDF…');
  /* Yield once so the busy state actually paints before jsPDF blocks the
     main thread on a few megabytes of image data. */
  await new Promise(r => setTimeout(r, 0));

  try{
    const [pw, ph] = pageMM(settings);
    const doc = new jsPDF({
      orientation: settings.orientation,
      unit: 'mm',
      format: [pw, ph],
      compress: true
    });

    let page = 0;
    for (const pl of placements(images, settings)){
      while (page < pl.page){ doc.addPage([pw, ph], settings.orientation); page++; }
      doc.addImage(pl.img.src, formatOf(pl.img.src),
                   pl.rect.x, pl.rect.y, pl.rect.w, pl.rect.h);
    }

    /* Opened rather than downloaded: the new tab is where you hit print, and
       Save is one click away in the viewer. A blocked popup falls back to a
       plain download so the work is never simply lost. */
    const url = doc.output('bloburl');
    const win = window.open(url, '_blank');
    if (!win) { doc.save('image-grid.pdf'); status('Popup blocked — saved the PDF instead'); }
    else      { status('PDF opened in a new tab'); }
  }catch(err){
    console.error(err);
    status('Could not build the PDF: ' + (err && err.message ? err.message : err));
  }finally{
    setBusy(false);
  }
}

/* ==========================================================================
   CONTROLS
   ========================================================================== */

function renderGridSelect(){
  const sel = $('#sel-grid');
  sel.innerHTML = '';
  const current = settings.cols + ',' + settings.rows;
  let matched = false;

  GRID_PRESETS.forEach(([c, r]) => {
    const o = el('option', '', sel);
    o.value = c + ',' + r;
    o.textContent = c + ' × ' + r;
    if (o.value === current){ o.selected = true; matched = true; }
  });

  /* A custom size typed into the number inputs needs somewhere to show. */
  if (!matched){
    const o = el('option', '', sel);
    o.value = current;
    o.textContent = settings.cols + ' × ' + settings.rows + ' (custom)';
    o.selected = true;
  }
}

function syncControls(){
  $('#sel-orient').value  = settings.orientation;
  $('#sel-align').value   = settings.align;
  $('#num-margin').value  = settings.margin;
  $('#custom-cols').value = settings.cols;
  $('#custom-rows').value = settings.rows;
  renderGridSelect();
}

/* ---- transient UI ---- */
let statusTimer = null;
function status(msg){
  const n = $('#status');
  n.textContent = msg || '';
  clearTimeout(statusTimer);
  if (msg) statusTimer = setTimeout(() => { n.textContent = ''; }, 4000);
}
function setBusy(on, msg){
  $('#btn-pdf').disabled = on;
  document.body.classList.toggle('busy', on);
  if (on && msg) status(msg);
}

/* ==========================================================================
   WIRING
   ========================================================================== */

function refresh(){
  saveSettings();
  syncControls();
  renderThumbs();
  renderPreview();
}

const clampInt = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};

function init(){
  loadSettings();
  initSortable();

  $('#btn-pdf').onclick = makePDF;
  $('#btn-clear').onclick = () => {
    if (!images.length) return;
    if (!confirm('Remove all images?')) return;
    images = [];
    refresh();
  };

  /* ---- file input + drop zone ---- */
  const zone = $('#drop-zone'), input = $('#file-input');
  zone.onclick = () => input.click();
  zone.onkeydown = e => {
    if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); input.click(); }
  };
  input.onchange = e => { addFiles(e.target.files); input.value = ''; };

  zone.ondragover  = e => { e.preventDefault(); zone.classList.add('over'); };
  zone.ondragleave = ()  => zone.classList.remove('over');
  zone.ondrop = e => {
    e.preventDefault();
    zone.classList.remove('over');
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  /* A file dropped anywhere else would otherwise navigate away from the app
     and lose everything already loaded. */
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    if (e.dataTransfer && e.dataTransfer.files.length) e.preventDefault();
  });

  /* ---- settings ---- */
  $('#sel-orient').onchange = e => { settings.orientation = e.target.value; refresh(); };
  $('#sel-align').onchange  = e => { settings.align = e.target.value; refresh(); };
  $('#sel-grid').onchange   = e => {
    const [c, r] = e.target.value.split(',').map(Number);
    settings.cols = c; settings.rows = r;
    refresh();
  };
  $('#num-margin').onchange = e => {
    settings.margin = clampInt(e.target.value, 0, 40, settings.margin);
    refresh();
  };

  const applyCustom = () => {
    settings.cols = clampInt($('#custom-cols').value, 1, 12, settings.cols);
    settings.rows = clampInt($('#custom-rows').value, 1, 12, settings.rows);
    refresh();
  };
  $('#custom-cols').onchange = applyCustom;
  $('#custom-rows').onchange = applyCustom;

  let rt = null;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(renderPreview, 120);
  });

  refresh();
}

document.addEventListener('DOMContentLoaded', init);

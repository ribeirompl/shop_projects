/* ==========================================================================
   layout.js — sheet geometry and pagination
   --------------------------------------------------------------------------
   The single source of truth for how many cells a sheet has, which item
   lands in which one, and how big the page is in millimetres. Three things
   consume it and they must agree exactly:

     · the on-screen preview, scaled down to fit the pane
     · the print sheets, built unscaled into #print-root
     · the layout-picker thumbnails, drawn to the true paper proportions

   Cell *contents* are laid out in fractions of the cell (see designs.js);
   millimetres stop here, at the sheet.
   ========================================================================== */

export const MM = 96 / 25.4;                 // CSS px per mm
export const PAPER = { A4: [210, 297] };     // add A1: [594, 841] here when wanted

export const LAYOUT_PRESETS = [
  [1,1],[1,2],[2,1],[1,3],
  [3,1],[2,2],[1,4],[4,1],
  [2,3],[3,2],[1,5],[5,1],
  [2,4],[4,2],[3,3],[4,3]
];

export const MAX_GRID = 12;                  // guard on the custom cols/rows box

/* Blank border around the whole grid. The normal one is minimal, inside
   every office printer's dead zone; the wide one is for printers that clip
   more than that, or for sheets that get trimmed by hand. */
export const SHEET_MARGIN_MM = { normal: 4, wide: 10 };

export const sheetMarginMM = wide => wide ? SHEET_MARGIN_MM.wide : SHEET_MARGIN_MM.normal;

/* The border is split between two mechanisms, and the split is the whole
   point of this block.

   Some of it is declared to `@page`. That matters because Chrome obeys
   `margin:0` literally and lays ink into the strip no printer can reach; the
   driver then clips the sheet or shunts it across to fit, so an even border
   on screen comes out heavy on two sides on paper. A real page margin keeps
   the printer's dead zone inside the border we asked for.

   But Chrome also fills a roomy page margin with its own furniture — date,
   title, file path, page number. Measured against this page: printed at
   10mm, clean at 8mm and every value below. Staff print straight from the
   toolbar and never open "More settings", so the dialog's "Headers and
   footers" box cannot be what stands between them and a filename across the
   top of every sign. Hence the cap, set well clear of where it starts.

   Whatever the cap leaves over is inset inside the sheet instead, exactly as
   the screen draws it. Grid width works out the same either way
   (paper − 2·page − 2·inset = paper − 2·margin), so a cell is the same size
   in the preview and on paper, which is what lets fit.js measure one and
   trust the other. */
export const PAGE_MARGIN_MAX_MM = 6;

export const pageMarginMM  = wide => Math.min(sheetMarginMM(wide), PAGE_MARGIN_MAX_MM);
export const insetMarginMM = wide => sheetMarginMM(wide) - pageMarginMM(wide);

/* The paper minus the @page margin — the box print lays the sheet into. */
export function sheetAreaMM(state, wide){
  const [w, h] = pageMM(state);
  const m = pageMarginMM(wide);
  return [w - 2 * m, h - 2 * m];
}

export function pageMM(state){
  const [w, h] = PAPER[state.paper] || PAPER.A4;
  return state.orientation === 'landscape' ? [h, w] : [w, h];
}

export const perPage = state => state.cols * state.rows;

export const pageCount = (items, state) =>
  Math.max(1, Math.ceil(items.length / perPage(state)));

/* Every cell of every page, blanks included — the whole document as plain
   data, so pagination can be tested without a browser. `item` is null for a
   cell with nothing to put in it; the renderer greys those out. */
export function sheetCells(items, state){
  const per   = perPage(state);
  const pages = pageCount(items, state);
  const out   = [];

  for (let p = 0; p < pages; p++){
    for (let i = 0; i < per; i++){
      const col = i % state.cols;
      const row = Math.floor(i / state.cols);
      out.push({
        page: p,
        index: i,
        col, row,
        lastCol: col === state.cols - 1,
        lastRow: row === state.rows - 1,
        item: items[p * per + i] || null
      });
    }
  }
  return out;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* The line under the preview. Pure so the counting and the pluralisation
   can be pinned down without rendering anything. */
export function previewSummary(items, state){
  const per    = perPage(state);
  const pages  = pageCount(items, state);
  const blanks = pages * per - items.length;

  return `${plural(items.length, 'item')} · ${state.cols}×${state.rows} ` +
         `(${per} per page) · ${plural(pages, 'page')}` +
         (blanks ? ` · ${plural(blanks, 'blank cell')}` : '');
}

/* Miniature page for the layout picker, drawn to the true proportions of the
   chosen paper — a 1×3 on landscape must not look like a 1×3 on portrait. */
export function thumbSVG(cols, rows, w, state){
  const [pw, ph] = pageMM(state);
  const h   = Math.round(w * ph / pw);
  const pad = 1.5;
  const iw  = w - pad * 2, ih = h - pad * 2;

  let cells = '';
  for (let r = 0; r < rows; r++){
    for (let c = 0; c < cols; c++){
      cells += `<rect x="${(pad + c * iw / cols).toFixed(2)}" y="${(pad + r * ih / rows).toFixed(2)}" ` +
               `width="${(iw / cols).toFixed(2)}" height="${(ih / rows).toFixed(2)}" ` +
               `fill="#dbe3ea" stroke="#fff" stroke-width="0.8"/>`;
    }
  }
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
         `<rect width="${w}" height="${h}" fill="#fff" stroke="#c9d2da"/>${cells}</svg>`;
}

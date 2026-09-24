/* Pagination decides how many sheets go through the printer and which item
   lands on which one. Getting it wrong wastes paper, and the mistake only
   shows up once it is printed.

     npm test
*/

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PAPER, LAYOUT_PRESETS, MAX_GRID,
  SHEET_MARGIN_MM, PAGE_MARGIN_MAX_MM, insetMarginMM, pageMarginMM,
  pageMM, perPage, pageCount, sheetAreaMM, sheetCells, sheetMarginMM, previewSummary, thumbSVG
} from '../src/layout.js';

const base = { paper:'A4', orientation:'portrait', cols:1, rows:3 };
const items = n => Array.from({ length: n }, (_, i) => ({ name: 'ITEM ' + i }));

test('page size follows orientation', () => {
  assert.deepEqual(pageMM(base), [210, 297]);
  assert.deepEqual(pageMM({ ...base, orientation:'landscape' }), [297, 210]);
});

test('an unknown paper falls back to A4 rather than crashing the preview', () => {
  assert.deepEqual(pageMM({ ...base, paper:'A9000' }), PAPER.A4);
});

test('a page holds cols × rows items', () => {
  assert.equal(perPage(base), 3);
  assert.equal(perPage({ ...base, cols:4, rows:3 }), 12);
});

test('items spill onto as many pages as needed', () => {
  assert.equal(pageCount(items(0), base), 1, 'an empty set still shows one page');
  assert.equal(pageCount(items(1), base), 1);
  assert.equal(pageCount(items(3), base), 1, 'exactly full');
  assert.equal(pageCount(items(4), base), 2, 'one over');
  assert.equal(pageCount(items(7), base), 3);
});

test('cells are emitted row-major, page by page', () => {
  const st = { ...base, cols:2, rows:2 };
  const cells = sheetCells(items(5), st);

  assert.equal(cells.length, 8, 'two pages of four cells, blanks included');
  assert.deepEqual(cells.map(c => c.page),  [0,0,0,0,1,1,1,1]);
  assert.deepEqual(cells.map(c => c.index), [0,1,2,3,0,1,2,3]);

  // Cell 1 is to the right of cell 0; cell 2 is below it.
  assert.deepEqual(cells[0], { ...cells[0], col:0, row:0 });
  assert.deepEqual([cells[1].col, cells[1].row], [1, 0]);
  assert.deepEqual([cells[2].col, cells[2].row], [0, 1]);
});

test('the last column and row are flagged, for the trim rules', () => {
  const cells = sheetCells(items(6), { ...base, cols:3, rows:2 });

  assert.deepEqual(cells.map(c => c.lastCol), [false,false,true,false,false,true]);
  assert.deepEqual(cells.map(c => c.lastRow), [false,false,false,true,true,true]);
});

test('items fill in order and the leftover cells come back empty', () => {
  const cells = sheetCells(items(4), { ...base, cols:1, rows:3 });

  assert.deepEqual(cells.map(c => c.item && c.item.name),
    ['ITEM 0','ITEM 1','ITEM 2','ITEM 3', null, null]);
});

test('the preview line counts items, pages and blanks, and gets the plurals right', () => {
  assert.equal(previewSummary(items(1), { ...base, cols:1, rows:1 }),
    '1 item · 1×1 (1 per page) · 1 page');

  assert.equal(previewSummary(items(4), base),
    '4 items · 1×3 (3 per page) · 2 pages · 2 blank cells');

  assert.equal(previewSummary(items(2), base),
    '2 items · 1×3 (3 per page) · 1 page · 1 blank cell');

  // A full sheet mentions no blanks at all.
  assert.equal(previewSummary(items(3), base),
    '3 items · 1×3 (3 per page) · 1 page');
});

test('the picker thumbnail draws one rect per cell, plus the page itself', () => {
  const svg = thumbSVG(2, 3, 44, base);
  assert.equal((svg.match(/<rect/g) || []).length, 1 + 6);
});

test('the thumbnail keeps the true paper proportions, so landscape looks landscape', () => {
  const wh = svg => {
    const m = /width="(\d+)" height="(\d+)"/.exec(svg);
    return [Number(m[1]), Number(m[2])];
  };

  const [pw, ph] = wh(thumbSVG(1, 3, 44, base));
  assert.ok(ph > pw, 'portrait thumb is taller than it is wide');
  assert.equal(ph, Math.round(44 * 297 / 210));

  const [lw, lh] = wh(thumbSVG(1, 3, 44, { ...base, orientation:'landscape' }));
  assert.ok(lw > lh, 'landscape thumb is wider than it is tall');
});

test('every preset is a sane grid the custom box would also accept', () => {
  for (const [c, r] of LAYOUT_PRESETS){
    assert.ok(Number.isInteger(c) && c >= 1 && c <= MAX_GRID, `cols ${c}`);
    assert.ok(Number.isInteger(r) && r >= 1 && r <= MAX_GRID, `rows ${r}`);
  }
  const seen = new Set(LAYOUT_PRESETS.map(p => p.join('x')));
  assert.equal(seen.size, LAYOUT_PRESETS.length, 'no duplicate presets');
});

test('the wide-margin switch picks the wider border, and the default stays minimal', () => {
  assert.equal(sheetMarginMM(false), SHEET_MARGIN_MM.normal);
  assert.equal(sheetMarginMM(true),  SHEET_MARGIN_MM.wide);
  assert.ok(SHEET_MARGIN_MM.wide > SHEET_MARGIN_MM.normal);
  assert.ok(SHEET_MARGIN_MM.wide * 2 < 210 / 2, 'leaves most of the page for artwork');
});

test('the printed area is the paper less the @page margin', () => {
  for (const wide of [false, true]){
    const m = pageMarginMM(wide);
    for (const o of ['portrait','landscape']){
      const st = { ...base, orientation:o };
      const [pw, ph] = pageMM(st);
      assert.deepEqual(sheetAreaMM(st, wide), [pw - 2 * m, ph - 2 * m], `${o}, wide=${wide}`);
    }
  }
});

test('the border splits into an @page margin plus an inset, and still adds up', () => {
  for (const wide of [false, true]){
    assert.equal(pageMarginMM(wide) + insetMarginMM(wide), sheetMarginMM(wide), `wide=${wide}`);
    assert.ok(insetMarginMM(wide) >= 0, 'the inset is never negative');
  }
  assert.equal(insetMarginMM(false), 0, 'the normal border fits in the page margin whole');
  assert.ok(insetMarginMM(true) > 0, 'the wide one is capped and spills into the inset');
});

/* Chrome fills a roomy @page margin with the date, title, file path and page
   number. Measured against this page it starts at 10mm and is clean at 8mm
   and below, so the cap has to stay clear of that — staff print from the
   toolbar and never see the dialog's "Headers and footers" box. */
test('the @page margin never reaches the size where Chrome prints its own furniture', () => {
  const HEADERS_APPEAR_AT = 10;
  assert.ok(PAGE_MARGIN_MAX_MM <= 8, `${PAGE_MARGIN_MAX_MM}mm is past the measured-clean 8mm`);
  for (const wide of [false, true])
    assert.ok(pageMarginMM(wide) < HEADERS_APPEAR_AT, `wide=${wide}`);
});

/* The screen insets the whole border inside a full sheet; print splits it.
   That only holds together if a cell comes out the same size either way. */
test('a cell is the same size on screen and on paper', () => {
  for (const wide of [false, true]){
    const st = { ...base, cols:2, rows:4 };
    const [pw] = pageMM(st);
    const screen = (pw - 2 * sheetMarginMM(wide)) / st.cols;
    const paper  = (sheetAreaMM(st, wide)[0] - 2 * insetMarginMM(wide)) / st.cols;
    assert.ok(Math.abs(screen - paper) < 1e-9, `wide=${wide}: ${screen} vs ${paper}`);
  }
});

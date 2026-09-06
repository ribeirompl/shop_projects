/* Pagination decides how many sheets go through the printer and which item
   lands on which one. Getting it wrong wastes paper, and the mistake only
   shows up once it is printed.

     npm test
*/

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PAPER, LAYOUT_PRESETS, MAX_GRID,
  pageMM, perPage, pageCount, sheetCells, previewSummary, thumbSVG
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

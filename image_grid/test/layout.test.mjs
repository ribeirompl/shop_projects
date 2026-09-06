/* Geometry is the whole product here — a page that is 2 mm out is a page that
   gets reprinted. These run against the same module the app imports.

     npm test
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { jsPDF } from 'jspdf';

import {
  pageMM, cellRects, fitRect, placements, pageCount, formatOf
} from '../src/layout.js';

const base = { paper:'A4', orientation:'portrait', cols:2, rows:2, align:'center', margin:10 };

/* ---- a real PNG ---------------------------------------------------------
   Built here rather than pasted as a base64 blob, so the PDF test is fed
   bytes a decoder will actually accept and the dimensions can be varied. */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf){
  let c = 0xFFFFFFFF;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data){
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, crc]);
}
function makePNG(w, h){
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;                                    // 8 bits per channel
  ihdr[9] = 2;                                    // truecolour RGB
  // rows are [filter byte][RGB…]; solid red is enough to be a picture
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w * 3 },
    (_, i) => (i % 3 === 0 ? 0xFF : 0x00)))]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
const pngURL = (w, h) => 'data:image/png;base64,' + makePNG(w, h).toString('base64');

const img = (w, h) => ({ id:1, name:'x.png', src:pngURL(w, h), w, h });
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, msg + ` (${a} vs ${b})`);

test('page size follows orientation', () => {
  assert.deepEqual(pageMM(base), [210, 297]);
  assert.deepEqual(pageMM({ ...base, orientation:'landscape' }), [297, 210]);
});

test('cells divide the page inside one shared margin', () => {
  const r = cellRects(base);
  assert.equal(r.length, 4);

  near(r[0].x, 10, 'first cell starts at the margin');
  near(r[0].y, 10, 'first cell starts at the margin');
  near(r[0].w, (210 - 20) / 2, 'cell width');
  near(r[0].h, (297 - 20) / 2, 'cell height');

  // The block of cells ends exactly on the far margin — no drift.
  const last = r[r.length - 1];
  near(last.x + last.w, 210 - 10, 'right edge');
  near(last.y + last.h, 297 - 10, 'bottom edge');
});

test('margin 0 uses the whole sheet', () => {
  const r = cellRects({ ...base, cols:1, rows:1, margin:0 });
  assert.deepEqual(r, [{ x:0, y:0, w:210, h:297 }]);
});

test('images are fitted whole, never cropped', () => {
  const cell = { x:0, y:0, w:100, h:100 };

  const wide = fitRect(200, 100, cell, false);      // 2:1 into a square
  near(wide.w, 100, 'width fills');
  near(wide.h, 50,  'height scaled by ratio');
  near(wide.y, 25,  'centred vertically');
  near(wide.x, 0,   'centred horizontally');

  const tall = fitRect(100, 200, cell, false);      // 1:2 into a square
  near(tall.h, 100, 'height fills');
  near(tall.w, 50,  'width scaled by ratio');
  near(tall.x, 25,  'centred horizontally');

  // Nothing ever leaves its cell.
  for (const r of [wide, tall]){
    assert.ok(r.x >= cell.x - 1e-9 && r.x + r.w <= cell.x + cell.w + 1e-9);
    assert.ok(r.y >= cell.y - 1e-9 && r.y + r.h <= cell.y + cell.h + 1e-9);
  }
});

test('top alignment pins to the cell top, centre does not', () => {
  const cell = { x:0, y:0, w:100, h:100 };
  near(fitRect(200, 100, cell, true).y, 0, 'top-aligned');
  near(fitRect(200, 100, cell, false).y, 25, 'centred');
});

test('pagination fills row-major and spills onto new pages', () => {
  const imgs = Array.from({ length: 5 }, () => img(100, 100));
  const pl = placements(imgs, base);              // 2×2 = 4 per page

  assert.equal(pageCount(imgs, base), 2);
  assert.deepEqual(pl.map(p => p.page), [0,0,0,0,1]);
  assert.deepEqual(pl.map(p => p.cell), [0,1,2,3,0]);

  // Cell 1 is to the right of cell 0; cell 2 is below it.
  assert.ok(pl[1].rect.x > pl[0].rect.x);
  near(pl[1].rect.y, pl[0].rect.y, 'same row');
  assert.ok(pl[2].rect.y > pl[0].rect.y);
  near(pl[2].rect.x, pl[0].rect.x, 'same column');

  // The fifth image restarts at the top-left of page two.
  near(pl[4].rect.x, pl[0].rect.x, 'page two cell 0');
  near(pl[4].rect.y, pl[0].rect.y, 'page two cell 0');
});

test('an empty set still reports one page', () => {
  assert.equal(pageCount([], base), 1);
  assert.deepEqual(placements([], base), []);
});

test('image format comes from the data URL, not a hardcoded JPEG', () => {
  assert.equal(formatOf('data:image/png;base64,AAA'), 'PNG');
  assert.equal(formatOf('data:image/jpeg;base64,AAA'), 'JPEG');
  assert.equal(formatOf('data:image/webp;base64,AAA'), 'WEBP');
  assert.equal(formatOf(''), 'JPEG');              // last-resort default
});

test('jsPDF accepts the placements and pages out correctly', () => {
  const imgs = Array.from({ length: 5 }, () => img(2, 1));
  const [pw, ph] = pageMM(base);
  const doc = new jsPDF({ orientation: base.orientation, unit:'mm', format:[pw, ph], compress:true });

  let page = 0;
  for (const pl of placements(imgs, base)){
    while (page < pl.page){ doc.addPage([pw, ph], base.orientation); page++; }
    doc.addImage(pl.img.src, formatOf(pl.img.src), pl.rect.x, pl.rect.y, pl.rect.w, pl.rect.h);
  }

  assert.equal(doc.getNumberOfPages(), 2, 'five images at 4-up is two pages');

  const out = doc.output('arraybuffer');
  assert.ok(out.byteLength > 500, 'produced a non-trivial PDF');
  const head = Buffer.from(out.slice(0, 5)).toString('latin1');
  assert.equal(head, '%PDF-', 'looks like a PDF');
});

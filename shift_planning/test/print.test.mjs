import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshState, addStaff, setCell } from '../src/model.js';
import { layoutPages, rosterPages, dayColumns, staffAlphabetical, PAGE, MARGIN } from '../src/print.js';

function inside(el){
  const w = el.w ?? 0, h = el.h ?? 0;
  return el.x >= -0.01 && el.y >= -0.01 && el.x + w <= PAGE.w + 0.01 && el.y + h <= PAGE.h + 0.01;
}

for (const style of ['byday', 'bystaff']){
  test(`${style}: one landscape page, everything on it, inside the margins`, () => {
    const s = freshState();
    const pages = layoutPages(s, style);
    assert.equal(pages.length, 1);
    assert.equal(pages[0].w, 297);
    assert.equal(pages[0].h, 210);
    for (const el of pages[0].els){
      assert.ok(inside(el), JSON.stringify(el));
      if (el.kind === 'rect') assert.ok(el.x >= MARGIN - 0.01 && el.x + el.w <= PAGE.w - MARGIN + 0.01, JSON.stringify(el));
    }
  });
}

test('a crowd overflows onto a second page rather than off the bottom', () => {
  const s = freshState();
  for (let i = 0; i < 60; i++){ const p = addStaff(s, 'Extra ' + i); setCell(s, p.id, 0, { t: '9-5' }); }
  const pages = layoutPages(s, 'bystaff');
  assert.ok(pages.length >= 2);
  for (const p of pages) for (const el of p.els) assert.ok(inside(el), JSON.stringify(el));
});

test('byday columns: blanks left out, work first in start-time order', () => {
  const s = freshState();
  const cols = dayColumns(s);
  assert.ok(cols[0].every(e => e.parsed.kind !== 'blank'));
  assert.ok(!cols[0].some(e => e.name === 'Chiara'));          /* blank on Monday */
  assert.ok(cols[5].some(e => e.name === 'Chiara'));            /* 7-2 on Saturday */
  const work = cols[0].filter(e => e.parsed.kind === 'work');
  for (let i = 1; i < work.length; i++)
    assert.ok(work[i].parsed.spans[0].start >= work[i - 1].parsed.spans[0].start);
  const firstOff = cols[0].findIndex(e => e.parsed.kind === 'off');
  assert.ok(firstOff >= work.length);
});

test('bystaff is alphabetical, ungrouped, and shows no hours', () => {
  const s = freshState();
  const names = staffAlphabetical(s).map(p => p.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  const page = layoutPages(s, 'bystaff')[0];
  const texts = page.els.filter(e => e.kind === 'text').map(e => e.text);
  assert.ok(!texts.includes('Hours'));
  assert.ok(!texts.some(t => /^\d+h$/.test(t)));
  assert.ok(!texts.includes('Casuals'));
  assert.equal(texts.indexOf('Alex') < texts.indexOf('Yvonne'), true);
});

test('markup: one svg per page in mm, colours as fills, legend from the tags, text escaped', () => {
  const s = freshState();
  const p = addStaff(s, 'A & B <C>');
  setCell(s, p.id, 0, { t: '7-4', tag: 'BAKERY' });
  s.tags.find(t => t.id === 'BAKERY').label = 'Bake <house>';
  const svgs = rosterPages(s, 'bystaff');
  assert.equal(svgs.length, 1);
  assert.ok(svgs[0].startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm"'));
  assert.ok(svgs[0].includes('fill="#ED7D31"'));
  assert.ok(svgs[0].includes('fill="#FFE699"'));
  assert.ok(svgs[0].includes('A &amp; B &lt;C&gt;'));
  assert.ok(svgs[0].includes('Bake &lt;house&gt;'));
  assert.ok(!svgs[0].includes('<C>'));
  assert.ok(svgs[0].includes(s.notice));
});

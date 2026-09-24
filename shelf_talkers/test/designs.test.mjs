/* Design geometry is fractional, so it can be checked without a browser and
   without a sheet size: whatever the cell turns out to be, the slots have to
   stay inside it and stay off each other.

   The collisions these guard against are the ones that actually happened —
   the price running into the detail at 3×2, small print printing when it was
   switched off.

     npm test
*/

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DESIGNS, DESIGN_BY_ID, ASPECT_SPLIT, BLURB_LINES, PRICE_GAP,
  bestbuyLayout, brilliantLayout, woolLayout, reflowEmpty
} from '../src/designs.js';

/* A cell of the given size, as app.js builds it. */
const ctx = (cellW, cellH, showBlurb = true) =>
  ({ cellW, cellH, aspect: cellW / cellH, showBlurb });

/* Real cells off real sheets, spanning both arrangements. A 1×3 on A4
   portrait is a wide strip; a 3×2 is a narrow tall one. */
const CELLS = {
  '1×3 portrait':  ctx(210, 99),      // aspect 2.12 — wide
  '1×5 portrait':  ctx(210, 59.4),    // aspect 3.54 — wide
  '1×1 portrait':  ctx(210, 297),     // aspect 0.71 — tall
  '1×1 landscape': ctx(297, 210),     // aspect 1.41 — tall, just under the split
  '2×4 portrait':  ctx(105, 74.25),   // aspect 1.41 — tall
  '3×2 portrait':  ctx(70, 148.5)     // aspect 0.47 — tall, the tightest case
};

/* Slots that hold something. `panel` is the coloured band every other slot
   deliberately sits on top of, so it is not part of the collision check. */
const SLOT_KEYS = ['headline', 'blurb', 'name', 'price', 'detail', 'logo', 'wordmark'];

const slotsOf = L => SLOT_KEYS
  .filter(k => L[k])
  .map(k => ({ key: k, r: L[k] }));

const overlaps = (a, b) =>
  a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 &&
  a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;

const LAYOUTS = {
  'BEST BUY':       bestbuyLayout,
  'BRILLIANT BUYS': brilliantLayout,
  'WOOL AND MORE':  woolLayout
};

/* ---- the invariants, across every design and every cell shape ----------- */

for (const [design, layout] of Object.entries(LAYOUTS)){
  for (const [shape, c] of Object.entries(CELLS)){

    test(`${design} @ ${shape}: every slot stays inside the cell`, () => {
      const L = layout(c);
      for (const { key, r } of [...slotsOf(L), { key:'panel', r:L.panel }]){
        assert.ok(r.w > 0 && r.h > 0, `${key} has real size`);
        assert.ok(r.x >= -1e-9 && r.y >= -1e-9, `${key} starts inside the cell`);
        assert.ok(r.x + r.w <= 1 + 1e-9, `${key} right edge (${r.x + r.w})`);
        assert.ok(r.y + r.h <= 1 + 1e-9, `${key} bottom edge (${r.y + r.h})`);
      }
    });

    test(`${design} @ ${shape}: no two slots overlap`, () => {
      const slots = slotsOf(layout(c));
      for (let i = 0; i < slots.length; i++){
        for (let j = i + 1; j < slots.length; j++){
          assert.ok(!overlaps(slots[i].r, slots[j].r),
            `${slots[i].key} overlaps ${slots[j].key}`);
        }
      }
    });

    test(`${design} @ ${shape}: the small print obeys its switch`, () => {
      assert.ok(layout({ ...c, showBlurb: true }).blurb,  'shown when on');
      assert.equal(layout({ ...c, showBlurb: false }).blurb, null, 'gone when off');
    });

    test(`${design} @ ${shape}: the minimum size scales with the cell`, () => {
      const small = layout(c).min;
      const big   = layout(ctx(c.cellW * 2, c.cellH * 2)).min;
      assert.ok(big > small, 'a bigger cell gets a bigger floor');
      assert.ok(small > 0, 'and it is never zero');
    });
  }
}

/* ---- the arrangement split ---------------------------------------------- */

test('a cell wider than the aspect split gets the wide arrangement', () => {
  for (const layout of Object.values(LAYOUTS)){
    assert.equal(layout(ctx(300, 100)).wide, true,  'aspect 3.0 is wide');
    assert.equal(layout(ctx(100, 300)).wide, false, 'aspect 0.33 is tall');

    // Exactly on the boundary counts as wide.
    assert.equal(layout(ctx(ASPECT_SPLIT * 100, 100)).wide, true);
    assert.equal(layout(ctx(ASPECT_SPLIT * 100 - 1, 100)).wide, false);
  }
});

/* ---- the collisions that actually happened ------------------------------ */

test('the price never runs into the detail, in any design or cell shape', () => {
  for (const [design, layout] of Object.entries(LAYOUTS)){
    for (const [shape, c] of Object.entries(CELLS)){
      const L = layout(c);
      assert.ok(!overlaps(L.price, L.detail), `${design} @ ${shape}`);
    }
  }
});

/* Not overlapping was not enough: at 2×1 landscape BRILLIANT BUYS had the
   two boxes touching, and both fill their box, so it printed "R9.99R10 75G". */
test('the price keeps clear air before the detail, in any design or cell shape', () => {
  for (const [design, layout] of Object.entries(LAYOUTS)){
    for (const [shape, c] of Object.entries(CELLS)){
      const L = layout(c);
      const gap = L.detail.x - (L.price.x + L.price.w);
      assert.ok(gap >= PRICE_GAP - 1e-9, `${design} @ ${shape}: gap ${gap.toFixed(3)}`);
    }
  }
});

test('BEST BUY keeps its small print out of the green, as a footer under the price', () => {
  for (const [shape, c] of Object.entries(CELLS)){
    const L = bestbuyLayout(c);
    assert.ok(!overlaps(L.blurb, L.panel), `${shape}: small print is on the white`);
    assert.ok(L.blurb.y >= L.price.y + L.price.h - 1e-9, `${shape}: and below the price`);
  }
});

test('BRILLIANT BUYS runs its small print up the left edge, clear of the bar', () => {
  const L = brilliantLayout(ctx(210, 297));
  assert.ok(L.blurb.w < L.blurb.h, 'a tall, narrow strip');
  assert.ok(L.blurb.x < 0.05, 'hard against the left edge');
  assert.ok(L.blurb.y >= L.panel.h, 'starts below the green bar');
});

/* ---- WOOL's logo bar ----------------------------------------------------- */

test('WOOL tall sizes the blue bar to the logo, but never lets it run away', () => {
  // A very wide, short cell would want a deep bar; a narrow one, a sliver.
  const wide = woolLayout(ctx(400, 300));
  const thin = woolLayout(ctx(40, 400));

  assert.ok(wide.panel.h <= 0.30 + 1e-9, 'clamped at 30% of the cell');
  assert.ok(thin.panel.h >= 0.10 - 1e-9, 'never thinner than 10%');
});

test('WOOL puts the full logo in the bar when tall, and crops to the ball when wide', () => {
  const tall = woolLayout(ctx(210, 297));
  const wide = woolLayout(ctx(297, 100));

  assert.deepEqual(tall.logo, { x:0, y:0, w:1, h:tall.panel.h }, 'logo fills the bar');
  assert.equal(tall.wordmark, null, 'the PNG already carries the wordmark');

  assert.ok(wide.logo.w < 0.3, 'the ball sits in the blue column');
  assert.ok(wide.wordmark, 'the wordmark is set as text beside it');
});

/* ---- the registry -------------------------------------------------------- */

test('every design is registered once, with an id, a label and both halves', () => {
  assert.equal(DESIGNS.length, 3);

  const ids = DESIGNS.map(d => d.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');

  for (const d of DESIGNS){
    assert.ok(d.label, `${d.id} has a label`);
    assert.equal(typeof d.layout, 'function', `${d.id} exposes its geometry`);
    assert.equal(typeof d.render, 'function', `${d.id} can draw itself`);
    assert.equal(DESIGN_BY_ID[d.id], d, `${d.id} is reachable by id`);
  }
});

test('the small print is real copy, not a leftover placeholder', () => {
  assert.ok(BLURB_LINES.length >= 3);
  assert.ok(BLURB_LINES[0].includes('VAT'));
});

/* ---- small print off ------------------------------------------------------ */

for (const [design, layout] of Object.entries(LAYOUTS)){
  test(`${design}: with small print off, slots still stay inside and off each other`, () => {
    for (const [shape, c] of Object.entries(CELLS)){
      const L = layout({ ...c, showBlurb: false });
      const slots = slotsOf(L);
      for (const { key, r } of slots){
        assert.ok(r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 1 + 1e-9 && r.y + r.h <= 1 + 1e-9,
          `${shape}: ${key} inside`);
      }
      for (let i = 0; i < slots.length; i++)
        for (let j = i + 1; j < slots.length; j++)
          assert.ok(!overlaps(slots[i].r, slots[j].r), `${shape}: ${slots[i].key} overlaps ${slots[j].key}`);
      assert.ok(L.detail.x - (L.price.x + L.price.w) >= PRICE_GAP - 1e-9, `${shape}: price gap`);
    }
  });
}

test('BEST BUY headline has the whole panel to itself, small print or not', () => {
  for (const c of Object.values(CELLS)){
    const on  = bestbuyLayout({ ...c, showBlurb: true  });
    const off = bestbuyLayout({ ...c, showBlurb: false });
    assert.deepEqual(on.headline, off.headline);
    assert.ok(on.headline.w >= on.panel.w * 0.9, 'spans the panel');
  }
});

/* ---- empty fields hand their room on ------------------------------------- */

const FULL = { name:'BANANAS', price:'R9.99', detail:'PER KG' };

for (const [design, layout] of Object.entries(LAYOUTS)){
  test(`${design}: no detail — the price runs on across the detail's box`, () => {
    for (const [shape, c] of Object.entries(CELLS)){
      const L = layout(c);
      const R = reflowEmpty(L, { ...FULL, detail:'  ' });
      assert.equal(R.detail, null, shape);
      assert.ok(Math.abs(R.price.x + R.price.w - (L.detail.x + L.detail.w)) < 1e-9, `${shape}: reaches the detail's edge`);
      for (const { key, r } of slotsOf(R)){
        if (key !== 'price') assert.ok(!overlaps(R.price, r), `${shape}: price overlaps ${key}`);
      }
    }
  });

  test(`${design}: no price or detail — the name takes the whole body`, () => {
    for (const [shape, c] of Object.entries(CELLS)){
      const L = layout(c);
      const R = reflowEmpty(L, { name:'BANANAS', price:'', detail:'' });
      assert.equal(R.price, null); assert.equal(R.detail, null);
      assert.ok(R.name.h > L.name.h, `${shape}: name grew`);
      for (const { key, r } of slotsOf(R)){
        if (key !== 'name') assert.ok(!overlaps(R.name, r), `${shape}: name overlaps ${key}`);
      }
    }
  });

  test(`${design}: a full item is left exactly as laid out`, () => {
    const L = layout(CELLS['2×4 portrait']);
    assert.deepEqual(reflowEmpty(L, FULL), L);
  });
}

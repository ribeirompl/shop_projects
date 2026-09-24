/* The sizing arithmetic, driven with measurements instead of a browser.

   Every number here is "what the element measured at REF px", which is all
   the real code passes in too — so these exercise the same functions the
   app runs, not a re-implementation of them.

     npm test
*/

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REF, LINE_H, MIN_RATIO,
  lineSize, nudge, blockSeed, bisect, stackSizes, justifiedStack, compactPositions
} from '../src/fit.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg} (${a} vs ${b})`);

/* ---- single line -------------------------------------------------------- */

test('a single line is solved exactly, by whichever dimension runs out first', () => {
  // At REF=100 the text is 400×50. The box is 200×100.
  // Width allows 100×200/400 = 50px; height allows 100×100/50 = 200px.
  assert.equal(lineSize({ w:200, h:100 }, { w:400, h:50 }, 1, 10000), 50);

  // Same text in a box that is wide but short — now height is the limit.
  assert.equal(lineSize({ w:4000, h:25 }, { w:400, h:50 }, 1, 10000), 50);
});

test('a line is clamped to its min and max', () => {
  assert.equal(lineSize({ w:9999, h:9999 }, { w:100, h:100 }, 1, 40), 40, 'capped at max');
  assert.equal(lineSize({ w:1, h:1 }, { w:400, h:50 }, 12, 10000), 12, 'floored at min');
});

test('an unmeasurable line falls back to the minimum instead of NaN', () => {
  assert.equal(lineSize({ w:200, h:100 }, { w:0, h:0 }, 7, 10000), 7);
});

test('sizes round down, never up — a rounding error must not overflow the box', () => {
  // 100 * 100/3 = 3333.333…  Quantising to 1/100px must floor.
  const px = lineSize({ w:100, h:100000 }, { w:3, h:1 }, 1, 1e9);
  assert.equal(px, 3333.33);
  assert.ok(px * 3 / REF <= 100 + 1e-9, 'the fitted line still fits its box');
});

test('the corrective nudge gives back half a pixel, but never past the minimum', () => {
  assert.equal(nudge(20, 10), 19.5);
  assert.equal(nudge(10.2, 10), 10, 'clamped at min');
});

/* ---- wrapping block ----------------------------------------------------- */

test('the block seed is a generous upper bound, clamped to min and max', () => {
  // Square box, square natural extent: the area estimate is REF, plus 35%.
  near(blockSeed({ w:100, h:100 }, { w:100, h:100 }, 1, 10000), REF * 1.35, 'seed');

  assert.equal(blockSeed({ w:9999, h:9999 }, { w:1, h:1 }, 1, 60), 60, 'capped at max');
  assert.equal(blockSeed({ w:1, h:1 }, { w:9999, h:9999 }, 8, 10000), 8, 'floored at min');
});

test('the search converges on the largest size that fits', () => {
  // A synthetic slot that overflows above 42px.
  const lo = bisect(10, 100, px => px > 42, 20);
  assert.ok(lo <= 42, 'never returns a size that overflows');
  assert.ok(lo > 41.99, 'gets close to the true answer');
});

test('the search walks up towards hi when nothing overflows', () => {
  // Each step halves the remaining gap, so after 8 it is 90/256 short of hi.
  near(bisect(10, 100, () => false, 8), 100 - 90 / 2 ** 8, 'converges on hi');
});

test('the search stays at lo when even the smallest size overflows', () => {
  // hi collapses towards lo and lo never moves — the caller then clamps to min.
  assert.equal(bisect(10, 100, () => true, 8), 10);
});

/* ---- the price stack ---------------------------------------------------- */

test('a short price line prints bigger than a long one — the whole point of the stack', () => {
  // "BOTH FOR" is wide at REF, "R32" is narrow. Box is roomy in height.
  const [both, r32] = stackSizes({ w:200, h:10000 }, [400, 100], 1);
  assert.ok(r32 > both * 2, `R32 should dwarf BOTH FOR (${both} vs ${r32})`);
});

test('a long lead-in never collapses to nothing beside a short line', () => {
  // A hugely wide first line would otherwise size to almost zero.
  const [lead, big] = stackSizes({ w:200, h:100000 }, [100000, 100], 0);
  assert.ok(lead >= big * MIN_RATIO - 0.01, `held at MIN_RATIO of the biggest (${lead} vs ${big})`);
});

test('holding that ratio never pushes a line wider than its box', () => {
  // At 3×2, "BOTH FOR" was raised past the edge beside a huge "R32" and clipped.
  const box = { w:200, h:100000 };
  const nat = [900, 100];
  stackSizes(box, nat, 0).forEach((px, i) =>
    assert.ok(nat[i] * px / REF <= box.w + 1e-9, `line ${i} fits (${nat[i] * px / REF})`));
});

test('the stack is scaled down to fit the height of its box', () => {
  const box = { w:200, h:120 };
  const sizes = stackSizes(box, [400, 100], 1);
  const used = sizes.reduce((sum, v) => sum + v * LINE_H, 0);

  assert.ok(used <= box.h + 1e-9, `stack must fit its box (${used} vs ${box.h})`);
  assert.ok(used > box.h * 0.98, 'and should very nearly fill it');
});

test('a stack that already fits is left alone', () => {
  const box = { w:200, h:100000 };
  const sizes = stackSizes(box, [400, 400], 1);
  near(sizes[0], 50, 'width-limited, not height-limited');
  near(sizes[1], 50, 'both lines the same width give the same size');
});

test('every line respects the minimum, and an empty stack is not an error', () => {
  const sizes = stackSizes({ w:1, h:1 }, [9999, 9999], 14);
  assert.deepEqual(sizes, [14, 14]);
  assert.deepEqual(stackSizes({ w:200, h:200 }, [], 1), []);
});

/* ---- the justified headline --------------------------------------------- */

/* The ink a line actually covers: its natural width scaled to the chosen
   size, plus one tracking step per gap. The trailing step CSS adds after the
   last glyph is not ink, which is the whole reason these lines are left
   aligned — so it is not counted here either. */
const ink = (natW, r, chars) => natW * r.size / REF + r.track * (chars - 1);

test('BEST over BUY: one size for both, and both reach the far edge', () => {
  const box = { w:200, h:10000 };            // height is not the constraint
  // BUY is a letter shorter, so at REF it measures narrower than BEST.
  const [best, buy] = justifiedStack(box, [{ w:400, chars:4 }, { w:300, chars:3 }], 1, 10000);

  assert.equal(best.size, buy.size, 'the shorter word is not printed larger');
  near(best.size, 50, 'sized by the widest line, so nothing overflows');

  near(ink(400, best, 4), 200, 'BEST spans the box');
  near(ink(300, buy,  3), 200, 'BUY spans it too, on tracking alone');
  assert.ok(buy.track > best.track, 'the shorter word takes more of the slack');
});

test('the widest line sets the size and needs no tracking of its own', () => {
  const [wide, narrow] =
    justifiedStack({ w:300, h:10000 }, [{ w:600, chars:5 }, { w:300, chars:3 }], 1, 10000);

  near(wide.track, 0, 'already fills the width');
  assert.ok(narrow.track > 0, 'the other one does not');
});

test('a short box is limited by height, and every line still fits it', () => {
  // Two lines at LINE_H each must fit 100px: 50px a line before rounding.
  const r = justifiedStack({ w:100000, h:100 }, [{ w:10, chars:2 }, { w:10, chars:2 }], 1, 10000);
  assert.ok(r[0].size <= 100 / (2 * LINE_H) + 1e-9, 'the stack fits its box');
  assert.equal(r[0].size, r[1].size);
});

test('tracking never goes negative, and a single glyph is left alone', () => {
  // A line wider than its box would otherwise ask for negative tracking,
  // which would pull the letters into each other.
  const r = justifiedStack({ w:10, h:10000 }, [{ w:100, chars:4 }], 1, 10000);
  assert.ok(r[0].track >= 0, 'letters are never pulled together');

  // One glyph has no gaps to spread slack over; dividing by zero would give
  // Infinity and blow the line off the sheet.
  const one = justifiedStack({ w:200, h:10000 }, [{ w:20, chars:1 }], 1, 10000);
  assert.ok(Number.isFinite(one[0].track), 'no divide-by-zero on one letter');
});

test('an outline is left room for, so the stroke is not clipped at the edge', () => {
  const line = [{ w:200, chars:4 }];
  const box  = { w:200, h:10000 };

  const bare = justifiedStack(box, line, 1, 10000)[0];
  near(bare.size, 100, 'unstroked text fills the box exactly');

  // 0.2em of outline means the glyphs paint 0.2 * size wider than they measure.
  const outlined = justifiedStack(box, line, 1, 10000, { outset:0.2 })[0];
  assert.ok(outlined.size < bare.size, 'sized down to make room');

  // Up against the edge, never over it: sizes round down by design, so this
  // may land a rounding step short but must never land past 200.
  const painted = 200 * outlined.size / REF + 0.2 * outlined.size;
  assert.ok(painted <= 200,        `ink plus outline stays inside (${painted})`);
  assert.ok(painted >  200 - 0.05, `and does not waste the box (${painted})`);
});

test('tracking stops at the cap instead of spacing a word out', () => {
  // BUY-shaped: a long way short of the box, so it wants a lot of tracking.
  const lines = [{ w:400, chars:4 }, { w:200, chars:3 }];

  const free    = justifiedStack({ w:400, h:1e5 }, lines, 1, 10000)[1];
  const capped  = justifiedStack({ w:400, h:1e5 }, lines, 1, 10000, { maxTrack:0.1 })[1];

  assert.ok(free.track > capped.track, 'the cap bites');
  near(capped.track, 0.1 * capped.size, 'and stops exactly there');

  // A line that needs less than the cap is unaffected by it.
  const easy = justifiedStack({ w:410, h:1e5 }, [{ w:400, chars:4 }], 1, 10000,
                              { maxTrack:10 })[0];
  assert.ok(easy.track < 10 * easy.size, 'the cap is a ceiling, not a target');
});

test('the size floor and ceiling are respected, and an empty stack is safe', () => {
  const floored = justifiedStack({ w:1, h:1 }, [{ w:9999, chars:4 }], 14, 10000);
  assert.equal(floored[0].size, 14);

  const capped = justifiedStack({ w:10000, h:10000 }, [{ w:10, chars:4 }], 1, 60);
  assert.equal(capped[0].size, 60);

  assert.deepEqual(justifiedStack({ w:200, h:200 }, [], 1, 10000), []);
});

/* ---- reclaiming dead space ---------------------------------------------- */

test('leftover space is shared as equal gutters above, between and below', () => {
  // Three 20px slots in a 120px band: 60px spare over four gutters = 15px each.
  const at = compactPositions(0, 120, [20, 20, 20]);

  assert.deepEqual(at, [
    { top: 15, height: 20 },     // 15 gutter
    { top: 50, height: 20 },     // + 20 slot + 15 gutter
    { top: 85, height: 20 }
  ]);

  const last = at[at.length - 1];
  near(120 - (last.top + last.height), 15, 'the gutter below matches the others');
});

test('compacting starts from the band, wherever on the cell it sits', () => {
  const at = compactPositions(200, 120, [20, 20, 20]);
  assert.equal(at[0].top, 215, 'offset by the band top');
});

test('a full band is left alone rather than given negative gutters', () => {
  assert.equal(compactPositions(0, 60, [20, 20, 20]), null, 'exactly full');
  assert.equal(compactPositions(0, 50, [20, 20, 20]), null, 'over-full');
});

test('slot heights are preserved, so nothing re-wraps', () => {
  const heights = [10, 40, 25];
  const at = compactPositions(0, 200, heights);
  assert.deepEqual(at.map(a => a.height), heights);
});

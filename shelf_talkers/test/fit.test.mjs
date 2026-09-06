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
  lineSize, nudge, blockSeed, bisect, stackSizes, compactPositions
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
  const [lead, big] = stackSizes({ w:200, h:100000 }, [100000, 100], 1);
  near(lead, Math.floor(big * MIN_RATIO * 100) / 100, 'floored at MIN_RATIO of the biggest');
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

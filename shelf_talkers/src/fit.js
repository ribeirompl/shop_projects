/* ==========================================================================
   fit.js — size text to a fixed box
   --------------------------------------------------------------------------
   Split in two halves, deliberately:

     · the arithmetic (top)    pure — takes measurements in, returns sizes.
                               This is the half the tests exercise.
     · the DOM drivers (below) measure a real element, hand the numbers to
                               the arithmetic, and write the answer back.

   Three cases, handled differently because they are different problems:

     fitLine   single line, white-space:nowrap. Text width scales linearly
               with font-size, so one measurement at a reference size gives
               the answer exactly. No search.

     fitBlock  wrapping text. Line breaks move as the size changes, so
               linear scaling only gives a bound — seed from it and
               binary-search a handful of steps.

     fitStack  the price stack, where each line is sized on its own so a
               short line prints big beside a long one.

   All measurements use offset/scroll properties, which are untransformed
   layout values — the preview's transform:scale() cannot skew them.
   ========================================================================== */

export const REF   = 100;   // reference font-size for the linear probe (px)
export const EPS   = 0.5;   // sub-pixel slack, px
export const STEPS = 8;     // refinement passes for wrapping text

/* LINE_H must match the CSS line-height on .price-stack .line.
   MIN_RATIO stops a long lead-in collapsing to nothing beside a short one. */
export const LINE_H    = 1.05;
export const MIN_RATIO = 0.34;

/* Font sizes are quantised to 1/100 px and always rounded *down*, so a
   rounding error can only ever make text smaller than measured — never
   overflow the box it was just fitted to. */
const q = px => Math.floor(px * 100) / 100;

/* ==========================================================================
   THE ARITHMETIC — no DOM
   ========================================================================== */

/* Exact for a single line: at REF the text measures `nat`, and both
   dimensions scale linearly with font-size, so the largest fitting size is
   a ratio rather than a search. */
export function lineSize(box, nat, min, max, outset = 0){
  if (!nat.w || !nat.h) return min;
  /* An outlined glyph paints wider and taller than it measures: the stroke is
     centred on the outline, so half of it hangs past every edge, and
     scrollWidth counts none of it. `outset` is that overhang as a fraction of
     font-size — total, both sides — and the slot clips whatever runs over. */
  const px = REF * Math.min(box.w / (nat.w + outset * REF),
                            box.h / (nat.h + outset * REF));
  return Math.min(max, Math.max(min, q(px)));
}

/* A hair over after rounding or font hinting: give back half a pixel. */
export const nudge = (px, min) => Math.max(min, px - 0.5);

/* Upper bound for wrapping text, from the area the glyphs need at REF when
   laid out on one line. Generous by 35% because wrapping recovers width the
   single-line probe counted as unusable — often the seed just fits and no
   search is needed at all. */
export function blockSeed(box, nat, min, max){
  const byArea = REF * Math.sqrt((box.w * box.h) / ((nat.w || 1) * (nat.h || 1)));
  return Math.min(max, Math.max(min, byArea * 1.35));
}

/* Binary search between a size known to fit and one known not to.
   `overflowsAt` is injected so the search can be driven by a real element in
   the app and by a synthetic box in the tests. */
export function bisect(lo, hi, overflowsAt, steps = STEPS){
  for (let i = 0; i < steps; i++){
    const mid = (lo + hi) / 2;
    if (overflowsAt(mid)) hi = mid; else lo = mid;
  }
  return lo;
}

/* The price stack.

   Splitting the box into equal sub-slots would make every line the same
   size, which defeats the whole point: on the reference sign "BOTH FOR" is
   small and "R32" is huge. So each line is sized by how much room its own
   text needs across the full width, and the stack as a whole is then scaled
   to fit the height. A short line therefore prints big. */
export function stackSizes(box, natWidths, min){
  if (!natWidths.length) return [];

  let size = natWidths.map(w => REF * box.w / (w || 1));

  const biggest = Math.max(...size);
  size = size.map(v => Math.max(v, biggest * MIN_RATIO));

  const needed = size.reduce((sum, v) => sum + v * LINE_H, 0);
  if (needed > box.h){
    const k = box.h / needed;
    size = size.map(v => v * k);
  }

  return size.map(v => Math.max(min, q(v)));
}

/* A stacked headline whose lines are all one size and both edges line up.

   stackSizes() above deliberately gives each line its own size, so a short
   "BOTH FOR" prints small above a huge "R32". That is right for a price and
   wrong for a two-word headline: BEST over BUY at two different sizes reads
   as a mistake rather than a decision. Here one size fits every line, and
   the slack left over on the shorter ones is taken up by tracking instead —
   the words stay the same size and still reach both edges.

   The slack is spread over the gaps between characters, not the characters:
   n glyphs have n-1 gaps. CSS still adds letter-spacing after the last glyph
   as well, so a line's advance runs one step past its ink — which is why the
   caller left-aligns these lines. The overhang then falls off the right edge
   where it costs nothing, instead of shoving a centred line half a step left.

   `opts.maxTrack` caps the tracking, in em. Fully justifying two words of
   different lengths can demand enough of it that the short one reads as
   spaced-out capitals rather than a word, so past the cap the line simply
   stops short and stays centred — nearly square with its neighbour, which
   looks deliberate, where blown apart does not.

   `opts.outset` is the overhang an outline paints past the glyphs, in em.
   It comes off both the size and the width the ink is justified to.

   `lines` is [{ w, chars }] measured at REF. Returns [{ size, track }] in px. */
export function justifiedStack(box, lines, min, max, opts = {}){
  if (!lines.length) return [];

  const outset   = opts.outset || 0;
  const maxTrack = opts.maxTrack == null ? Infinity : opts.maxTrack;

  const byWidth  = Math.min(...lines.map(l => box.w / ((l.w || 1) / REF + outset)));
  const byHeight = box.h / (lines.length * LINE_H + outset);
  const size     = Math.min(max, Math.max(min, q(Math.min(byWidth, byHeight))));

  const room = box.w - outset * size;           // width the ink may cover
  return lines.map(l => {
    const ink  = l.w * size / REF;
    const gaps = Math.max(1, l.chars - 1);      // one glyph cannot be tracked
    const want = Math.max(0, room - ink) / gaps;
    return { size, track: q(Math.min(want, maxTrack * size)) };
  });
}

/* Reclaim dead space.

   A slot's band is a fixed fraction of the cell, but the text inside is
   usually limited by width, not height — so a short name leaves a pool of
   air inside its band and the sign reads as top-heavy with a hole in it.

   Each slot shrinks to the height it actually uses and the leftover is
   shared evenly as gutters above, between and below. Widths never change,
   so nothing re-wraps and no re-fit is needed. Returns null when the slots
   already fill the band and there is nothing to give. */
export function compactPositions(top, band, heights){
  const used = heights.reduce((a, b) => a + b, 0);
  if (used >= band) return null;

  const gutter = (band - used) / (heights.length + 1);
  let y = top + gutter;

  return heights.map(h => {
    const at = { top: y, height: h };
    y += h + gutter;
    return at;
  });
}

/* ==========================================================================
   THE DOM DRIVERS
   ========================================================================== */

const boxOf = slot => ({ w: slot.clientWidth, h: slot.clientHeight });

const overflows = (txt, box) =>
  txt.scrollWidth  > box.w + EPS ||
  txt.scrollHeight > box.h + EPS;

const apply = (txt, px) => { txt.style.fontSize = px + 'px'; };

/* How far an outline paints past the glyphs, as a fraction of font-size.
   Read from the computed style rather than repeated here, so the stroke width
   stays a single number in app.css. Zero for everything that is not stroked. */
function strokeEm(el){
  const cs = getComputedStyle(el);
  const w  = parseFloat(cs.webkitTextStrokeWidth) || 0;
  const fs = parseFloat(cs.fontSize) || REF;
  return w / fs;
}

/* Mark the element when even the minimum size will not fit, so the UI can
   flag the row rather than silently printing something clipped. */
const flag = (txt, box) => { txt.dataset.overflow = overflows(txt, box) ? '1' : ''; };

export function fitLine(slot, txt, min, max){
  const box = boxOf(slot);
  if (!box.w || !box.h || !txt.textContent.trim()) return;

  apply(txt, REF);
  const nat = { w: txt.scrollWidth, h: txt.scrollHeight };
  if (!nat.w || !nat.h){ apply(txt, min); return; }

  const px = lineSize(box, nat, min, max, strokeEm(txt));
  apply(txt, px);

  // one corrective pass: rounding or a font's hinting can push it a hair over
  if (overflows(txt, box) && px > min) apply(txt, nudge(px, min));

  flag(txt, box);
}

export function fitBlock(slot, txt, min, max){
  const box = boxOf(slot);
  if (!box.w || !box.h || !txt.textContent.trim()) return;

  // Probe with wrapping disabled to learn the natural single-line extent.
  const prevWS = txt.style.whiteSpace;
  txt.style.whiteSpace = 'nowrap';
  apply(txt, REF);
  const nat = { w: txt.scrollWidth || 1, h: txt.scrollHeight || 1 };
  txt.style.whiteSpace = prevWS;

  const hi = blockSeed(box, nat, min, max);
  apply(txt, hi);
  if (!overflows(txt, box)){
    txt.dataset.overflow = '';
    return;                          // the generous seed already fits
  }

  const lo = bisect(min, hi, px => { apply(txt, px); return overflows(txt, box); });

  apply(txt, Math.max(min, q(lo)));
  flag(txt, box);
}

export function fitStack(slot, lines, min){
  const box = boxOf(slot);
  if (!box.w || !box.h || !lines.length) return;

  const nat = lines.map(l => { apply(l, REF); return l.scrollWidth || 1; });

  stackSizes(box, nat, min).forEach((px, i) => {
    apply(lines[i], px);
    lines[i].dataset.overflow = lines[i].scrollWidth > box.w + EPS ? '1' : '';
  });
}

/* Tracking has to be cleared before the reference measurement, or each pass
   would measure the spacing the previous one added and creep wider. */
export function fitJustified(slot, lines, min, max, maxTrack){
  const box = boxOf(slot);
  if (!box.w || !box.h || !lines.length) return;

  const nat = lines.map(l => {
    l.style.letterSpacing = '0px';
    apply(l, REF);
    return { w: l.scrollWidth || 1, chars: l.textContent.trim().length };
  });

  const opts = { outset: strokeEm(lines[0]), maxTrack };

  justifiedStack(box, nat, min, max, opts).forEach((r, i) => {
    apply(lines[i], r.size);
    lines[i].style.letterSpacing = r.track + 'px';
    /* CSS puts letter-spacing after the last glyph too, so the line's advance
       runs one step past its ink and a centred line would sit half a step
       left. An equal text-indent pushes it back: the ink then centres exactly,
       whether the line reached the edges or stopped at the tracking cap. */
    lines[i].style.textIndent = r.track + 'px';
    lines[i].dataset.overflow =
      lines[i].scrollWidth - r.track > box.w + EPS ? '1' : '';
  });
}

function contentHeight(slot){
  let h = 0;
  for (const c of slot.children) h += c.offsetHeight;
  return h;
}

export function compact(cell){
  const slots = Array.from(cell.querySelectorAll('.grp-body'));
  if (slots.length < 2) return;

  const top    = Math.min(...slots.map(s => s.offsetTop));
  const bottom = Math.max(...slots.map(s => s.offsetTop + s.offsetHeight));

  const at = compactPositions(top, bottom - top, slots.map(contentHeight));
  if (!at) return;                              // already full, nothing to give

  slots.forEach((s, i) => {
    s.style.top    = at[i].top + 'px';
    s.style.height = at[i].height + 'px';
  });

  anchorDetail(cell);
}

/* The trailing detail (PER KG, COMBO, 2 LITRE) belongs beside the price, not
   at some fixed height of its own — once the price has moved, a fixed detail
   drifts away from it. Centre it on the price's *last* line, which is the big
   number in a "BOTH FOR / R32" stack. */
function anchorDetail(cell){
  const price  = cell.querySelector('.price-stack.grp-body');
  const detail = cell.querySelector('.slot.detail');
  if (!price || !detail) return;

  const last = price.lastElementChild;
  if (!last) return;

  const centre = price.offsetTop + last.offsetTop + last.offsetHeight / 2;
  const h = contentHeight(detail);
  detail.style.top    = (centre - h / 2) + 'px';
  detail.style.height = h + 'px';
}

/* Run every task queued by a design. */
export function runAll(tasks){
  for (const t of tasks){
    if (t.kind === 'stack')      fitStack(t.slot, t.lines, t.min);
    else if (t.kind === 'justified') fitJustified(t.slot, t.lines, t.min, t.max, t.maxTrack);
    else if (t.kind === 'line')  fitLine(t.slot, t.txt, t.min, t.max);
    else                         fitBlock(t.slot, t.txt, t.min, t.max);
  }
}

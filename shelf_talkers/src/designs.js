/* ==========================================================================
   designs.js — the three shelf-talker designs
   --------------------------------------------------------------------------
   Each design is split the same way fit.js is:

     layout(ctx)  pure. Returns every rectangle the design uses, as a
                  fraction of the cell. No DOM, so the geometry can be
                  tested — that slots stay inside the cell, that the price
                  never runs into the detail, that the small print appears
                  only when it is switched on.

     render(...)  builds the DOM from that layout and returns fit-tasks.
                  It never sets a font size; fit.js owns those.

   Nothing here is expressed in mm. Every rectangle is a fraction of its
   cell, so the same design renders correctly at 1-up A4 or 8-up, portrait
   or landscape — and would extend to A1 without any new layout work.

   Coloured areas are inline <svg> shapes, never CSS backgrounds, so they
   still print with "Background graphics" switched off.
   ========================================================================== */

import { esc, priceLines } from './text.js';

export const ASPECT_SPLIT = 1.5;   // cell wider than this → "wide" arrangement

export const BLURB_LINES = [
  'PRICES INCLUDE VAT',
  'WE RESERVE THE RIGHT TO LIMIT QUANTITIES',
  'OFFERS VALID WHILE STOCKS LAST',
  // Apostrophes are deliberate: the slots uppercase everything, and
  // "T’S & C’S APPLY" reads far better than "TS & CS APPLY".
  'T&rsquo;s &amp; C&rsquo;s APPLY'      // ← delete this line to drop it everywhere
];

const SVGNS = 'http://www.w3.org/2000/svg';
let uid = 0;

const rect = (x, y, w, h) => ({ x, y, w, h });

/* The minimum font size any slot may shrink to, as a fraction of cell
   height — below this the sign is unreadable across a shop floor. */
const MIN_FRACTION = 0.018;

/* ==========================================================================
   GEOMETRY — pure, no DOM
   ========================================================================== */

/* ctx: { cellW, cellH, aspect, showBlurb } */

export function bestbuyLayout(ctx){
  const wide = ctx.aspect >= ASPECT_SPLIT;
  const min  = MIN_FRACTION * ctx.cellH;

  if (wide){
    return {
      wide, min,
      /* A straight two-stop ramp, no mid stop — roughly the 100° of the CSS
         original, running near-vertically down a left column. */
      panel:    rect(0, 0, .30, 1),
      gradient: { x1:'0', y1:'0', x2:'0.18', y2:'1' },
      headline: rect(.015, .08, .27, .40),        // BEST / BUY, stacked
      blurb:    ctx.showBlurb ? rect(.015, .52, .27, .42) : null,
      name:     rect(.335, .04, .635, .36),
      price:    rect(.335, .42, .44, .54),
      detail:   rect(.78, .62, .20, .22),
      maxPx:    { blurb: .055 * ctx.cellH, detail: .10 * ctx.cellH }
    };
  }

  return {
    wide, min,
    panel:    rect(0, 0, 1, .24),                 // banner across the top
    gradient: { x1:'0', y1:'0', x2:'1', y2:'0.18' },
    headline: rect(.035, .03, .50, .18),
    blurb:    ctx.showBlurb ? rect(.57, .025, .40, .19) : null,
    name:     rect(.05, .28, .90, .25),
    /* Price stops short of the detail so the two cannot collide in a narrow
       cell — at 3×2 they were touching. */
    price:    rect(.05, .55, .58, .36),
    detail:   rect(.70, .72, .27, .16),
    maxPx:    { blurb: .038 * ctx.cellH, detail: .09 * ctx.cellH }
  };
}

export function brilliantLayout(ctx){
  const wide = ctx.aspect >= ASPECT_SPLIT;
  const min  = MIN_FRACTION * ctx.cellH;

  const bar     = (wide ? 26 : 19) / 100;         // yellow bar, fraction of height
  const blurbY  = bar + .015;
  const bodyTop = bar + .04;
  const priceY  = bodyTop + .32;

  return {
    wide, min,
    panel:    rect(0, 0, 1, bar),
    gradient: null,
    headline: rect(.02, .012, .96, bar - .024),
    /* Small print runs bottom-to-top along the left edge. */
    blurb:    ctx.showBlurb ? rect(.004, blurbY, .055, .985 - blurbY) : null,
    name:     rect(.10, bodyTop, .86, .30),
    price:    rect(.10, priceY, .56, .94 - priceY),
    detail:   rect(.66, .70, .30, .18),
    maxPx:    { blurb: .030 * ctx.cellH, detail: .11 * ctx.cellH }
  };
}

/* The logo PNG already carries the brand blue as its own background, so a
   blue bar of the same colour behind it reads as one continuous band at any
   width. The wide arrangement clips the same PNG down to the yarn ball. */
export const WOOL_LOGO_W = 2023, WOOL_LOGO_H = 430;

/* Square crop of the yarn ball alone. Measured off the artwork: the pink
   ball spans x 56–338, y 58–334, and the "B" of Blomtuin starts at x 354 —
   so 296px square from (49,48) is the largest clean crop. */
export const WOOL_CROP = { x:49, y:48, w:296, h:296 };

export function woolLayout(ctx){
  const wide = ctx.aspect >= ASPECT_SPLIT;
  const min  = MIN_FRACTION * ctx.cellH;

  if (wide){
    const col = .26;
    return {
      wide, min,
      panel:    rect(0, 0, col, 1),
      gradient: null,
      logo:     rect(.03, .05, col - .06, .30),   // yarn ball only
      wordmark: rect(.02, .37, .22, .24),
      blurb:    ctx.showBlurb ? rect(.02, .64, .22, .32) : null,
      name:     rect(.30, .05, .66, .36),
      price:    rect(.30, .44, .44, .50),
      detail:   rect(.76, .62, .21, .22),
      maxPx:    { blurb: .050 * ctx.cellH, detail: .10 * ctx.cellH,
                  wordmark: .14 * ctx.cellH }
    };
  }

  /* Tall: blue bar across the top with the full logo sitting in it. The bar
     is as deep as the logo naturally wants to be at this cell width, clamped
     so it never swallows the sign or shrinks to a stripe. */
  const naturalH = (ctx.cellW / (WOOL_LOGO_W / WOOL_LOGO_H)) / ctx.cellH;
  const bar      = Math.max(.10, Math.min(.30, naturalH));
  const bodyTop  = bar + .04;
  const priceY   = bodyTop + .30;

  return {
    wide, min,
    panel:    rect(0, 0, 1, bar),
    gradient: null,
    logo:     rect(0, 0, 1, bar),
    wordmark: null,
    name:     rect(.06, bodyTop, .88, .28),
    price:    rect(.06, priceY, .62, .90 - priceY),
    detail:   rect(.69, .70, .27, .16),
    blurb:    ctx.showBlurb ? rect(.06, .905, .88, .085) : null,
    maxPx:    { blurb: .030 * ctx.cellH, detail: .10 * ctx.cellH }
  };
}

/* ==========================================================================
   DOM HELPERS
   ========================================================================== */

function el(tag, cls, parent){
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (parent) parent.appendChild(n);
  return n;
}

function svgEl(tag, attrs){
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

/* var() does not resolve in SVG *presentation attributes*, only in CSS, so
   every themed colour is applied through inline style rather than fill="". */
function styled(node, css){
  for (const k in css) node.style.setProperty(k, css[k]);
  return node;
}

/* A positioned slot, placed from a fractional rect. */
function slot(parent, cls, r, align){
  const s = el('div', 'slot ' + cls + ' ' + (align || 'va-c ha-c'), parent);
  s.style.left   = (r.x * 100) + '%';
  s.style.top    = (r.y * 100) + '%';
  s.style.width  = (r.w * 100) + '%';
  s.style.height = (r.h * 100) + '%';
  return s;
}

/* A block of text inside a slot. `html` may contain <br>. */
function text(slotEl, cls, html, nowrap){
  const t = el('div', 'txt ' + cls + (nowrap ? ' nowrap' : ''), slotEl);
  t.innerHTML = html;
  return t;
}

/* The flat coloured panel every design starts from. */
function panelSVG(cell, r, fill){
  const svg = svgEl('svg', { class:'panel', preserveAspectRatio:'none', viewBox:'0 0 100 100' });
  svg.appendChild(styled(
    svgEl('rect', { x:String(r.x * 100), y:String(r.y * 100),
                    width:String(r.w * 100), height:String(r.h * 100) }),
    { fill }));
  cell.appendChild(svg);
  return svg;
}

/* One slot holding every price line. fit.js sizes each line from its own
   width and scales the stack to the box, so "BOTH FOR" prints small above a
   huge "R32" — the reference behaviour. */
function renderPriceStack(cell, r, lines, tasks, min){
  if (!lines.length) return;
  const s = slot(cell, 'price price-stack grp-body', r);
  s.style.flexDirection = 'column';
  const els = lines.map(line => text(s, 'line', esc(line), true));
  tasks.push({ slot: s, lines: els, kind: 'stack', min });
}

function renderName(cell, r, item, tasks, min){
  const s = slot(cell, 'name grp-body', r);
  tasks.push({ slot: s, txt: text(s, 'n', esc(item.name)), kind:'block', min, max: 10000 });
}

function renderDetail(cell, r, item, tasks, min, max){
  if (!item.detail) return;
  const s = slot(cell, 'detail', r);
  tasks.push({ slot: s, txt: text(s, 'd', esc(item.detail), true), kind:'line', min, max });
}

const blurbAll = sep => BLURB_LINES.filter(Boolean).join(sep);

/* ==========================================================================
   BEST BUY
   ========================================================================== */

export const BestBuy = {
  id: 'bestbuy',
  label: 'BEST BUY',
  layout: bestbuyLayout,

  render(cell, item, ctx){
    const L = bestbuyLayout(ctx);
    const tasks = [];
    cell.classList.add('d-bestbuy');

    /* ---- red panel ---- */
    const gid = 'bbg' + (++uid);
    const svg = svgEl('svg', { class:'panel', preserveAspectRatio:'none', viewBox:'0 0 100 100' });
    const defs = svgEl('defs');
    const grad = svgEl('linearGradient', { id: gid, ...L.gradient });
    grad.appendChild(styled(svgEl('stop', { offset:'0' }), { 'stop-color':'var(--bb-red-from)' }));
    grad.appendChild(styled(svgEl('stop', { offset:'1' }), { 'stop-color':'var(--bb-red-to)'   }));
    defs.appendChild(grad);
    svg.appendChild(defs);
    svg.appendChild(svgEl('rect', {
      x:String(L.panel.x * 100), y:String(L.panel.y * 100),
      width:String(L.panel.w * 100), height:String(L.panel.h * 100),
      fill:`url(#${gid})`
    }));
    cell.appendChild(svg);

    if (L.wide){
      /* BEST / BUY stacked — sized by the same stack fitter as the price, so
         the two words fill the column without fighting over its height. */
      const hs = slot(cell, 'headline price-stack', L.headline);
      hs.style.flexDirection = 'column';
      const hl = ['BEST','BUY'].map(w => text(hs, 'line', w, true));
      tasks.push({ slot: hs, lines: hl, kind:'stack', min: L.min });
    } else {
      const hs = slot(cell, 'headline', L.headline, 'va-c ha-l');
      tasks.push({ slot: hs, txt: text(hs, 'h', 'BEST BUY', true),
                   kind:'line', min: L.min, max: 10000 });
    }

    if (L.blurb){
      const bs = slot(cell, 'blurb', L.blurb);
      const html = L.wide
        ? BLURB_LINES[0] + ' &bull; ' + BLURB_LINES[1] + '<br><br>' + BLURB_LINES[2] +
          (BLURB_LINES[3] ? '<br><br>' + BLURB_LINES[3] : '')
        : blurbAll('<br>');
      tasks.push({ slot: bs, txt: text(bs, 'b', html),
                   kind:'block', min: L.min * 0.6, max: L.maxPx.blurb });
    }

    renderName(cell, L.name, item, tasks, L.min);
    renderPriceStack(cell, L.price, priceLines(item.price), tasks, L.min);
    renderDetail(cell, L.detail, item, tasks, L.min, L.maxPx.detail);

    return tasks;
  }
};

/* ==========================================================================
   BRILLIANT BUYS
   --------------------------------------------------------------------------
   Yellow bar across the top in both arrangements; the small print runs
   bottom-to-top along the left edge.
   ========================================================================== */

export const Brilliant = {
  id: 'brilliant',
  label: 'BRILLIANT BUYS',
  layout: brilliantLayout,

  render(cell, item, ctx){
    const L = brilliantLayout(ctx);
    const tasks = [];
    cell.classList.add('d-brilliant');

    panelSVG(cell, L.panel, 'var(--brill-bar)');

    const hs = slot(cell, 'headline', L.headline);
    tasks.push({ slot: hs, txt: text(hs, 'h', 'Brilliant Buys!', true),
                 kind:'line', min: L.min, max: 10000 });

    /* Small print, rotated up the left edge. The rotated wrapper is given the
       slot's dimensions swapped, and *it* is what the fitter measures. */
    if (L.blurb){
      const s   = slot(cell, 'blurb', L.blurb);
      const rot = el('div', 'blurb-rot', s);
      rot.style.width  = (s.clientHeight || (ctx.cellH * L.blurb.h)) + 'px';
      rot.style.height = (s.clientWidth  || (ctx.cellW * L.blurb.w)) + 'px';
      const t = text(rot, 'b', BLURB_LINES[0] + ' &bull; ' + BLURB_LINES[1] +
                               '<br>' + BLURB_LINES[2] +
                               (BLURB_LINES[3] ? ' &bull; ' + BLURB_LINES[3] : ''));
      t.style.whiteSpace = 'normal';
      tasks.push({ slot: rot, txt: t, kind:'block', min: L.min * 0.5, max: L.maxPx.blurb });
    }

    renderName(cell, L.name, item, tasks, L.min);
    renderPriceStack(cell, L.price, priceLines(item.price), tasks, L.min);
    renderDetail(cell, L.detail, item, tasks, L.min, L.maxPx.detail);

    return tasks;
  }
};

/* ==========================================================================
   WOOL AND MORE
   ========================================================================== */

const WOOL_LOGO_SRC = '__ASSET_WOOL__';      // build.js swaps in the data URI

/* An <image> of the logo, optionally clipped to a sub-rectangle. */
function woolLogo(rectPct, viewBox, crop){
  const svg = svgEl('svg', {
    class:'logo', viewBox, preserveAspectRatio:'xMidYMid meet'
  });

  const attrs = { href: WOOL_LOGO_SRC, x:'0', y:'0',
                  width:String(WOOL_LOGO_W), height:String(WOOL_LOGO_H) };

  if (crop){
    // The clip path is not optional: with a non-square viewport,
    // preserveAspectRatio letterboxes the viewBox and SVG happily paints
    // image content into the slack, dragging the wordmark back into view.
    const cid   = 'wclip' + (++uid);
    const cdefs = svgEl('defs');
    const clip  = svgEl('clipPath', { id: cid });
    clip.appendChild(svgEl('rect', { x:String(crop.x), y:String(crop.y),
                                     width:String(crop.w), height:String(crop.h) }));
    cdefs.appendChild(clip);
    svg.appendChild(cdefs);
    attrs['clip-path'] = `url(#${cid})`;
  }

  const img = svgEl('image', attrs);
  img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', WOOL_LOGO_SRC);
  svg.appendChild(img);

  svg.style.left   = (rectPct.x * 100) + '%';
  svg.style.top    = (rectPct.y * 100) + '%';
  svg.style.width  = (rectPct.w * 100) + '%';
  svg.style.height = (rectPct.h * 100) + '%';
  return svg;
}

export const Wool = {
  id: 'wool',
  label: 'WOOL AND MORE',
  layout: woolLayout,

  render(cell, item, ctx){
    const L = woolLayout(ctx);
    const tasks = [];
    cell.classList.add('d-wool');

    panelSVG(cell, L.panel, 'var(--wool-blue)');

    if (L.wide){
      cell.appendChild(woolLogo(L.logo,
        `${WOOL_CROP.x} ${WOOL_CROP.y} ${WOOL_CROP.w} ${WOOL_CROP.h}`, WOOL_CROP));

      const ws = slot(cell, 'wordmark', L.wordmark);
      tasks.push({ slot: ws, txt: text(ws, 'w', 'WOOL<br>AND<br>MORE'),
                   kind:'block', min: L.min, max: L.maxPx.wordmark });

      if (L.blurb){
        const bs = slot(cell, 'blurb', L.blurb);
        tasks.push({ slot: bs, txt: text(bs, 'b', blurbAll('<br><br>')),
                     kind:'block', min: L.min * 0.6, max: L.maxPx.blurb });
      }
    } else {
      cell.appendChild(woolLogo(L.logo, `0 0 ${WOOL_LOGO_W} ${WOOL_LOGO_H}`, null));
    }

    renderName(cell, L.name, item, tasks, L.min);
    renderPriceStack(cell, L.price, priceLines(item.price), tasks, L.min);
    renderDetail(cell, L.detail, item, tasks, L.min, L.maxPx.detail);

    if (!L.wide && L.blurb){
      const bs = slot(cell, 'blurb', L.blurb);
      bs.style.color = '#000';
      tasks.push({ slot: bs, txt: text(bs, 'b', blurbAll(' &bull; ')),
                   kind:'block', min: L.min * 0.5, max: L.maxPx.blurb });
    }

    return tasks;
  }
};

/* ---------- registry ------------------------------------------------------ */

export const DESIGNS = [BestBuy, Brilliant, Wool];
export const DESIGN_BY_ID = Object.fromEntries(DESIGNS.map(d => [d.id, d]));

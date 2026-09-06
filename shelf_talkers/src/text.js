/* ==========================================================================
   text.js — turning what someone typed into what gets drawn
   --------------------------------------------------------------------------
   Small, but shared by every design and by the tests, so the rules live in
   exactly one place rather than being re-invented per design.
   ========================================================================== */

/* Item text is injected as innerHTML so the blurb can carry entities, which
   means anything the user typed has to be escaped on the way in. */
export const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* Price is a mini-textarea: each typed line becomes its own fitted line, so
   "BOTH FOR" can print small above a huge "R32". Blank lines are dropped
   rather than reserving height for nothing. */
export function priceLines(price){
  return String(price == null ? '' : price)
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
}

/* A row the user has started but not filled in should not consume a cell. */
export const isBlank = item =>
  !(item && (item.name || item.price || item.detail));

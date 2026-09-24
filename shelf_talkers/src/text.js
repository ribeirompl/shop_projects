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

/* Every cell is a mini-textarea: each typed line is kept as its own line.
   In the price each becomes its own fitted line, so "BOTH FOR" can print
   small above a huge "R32". Blank lines are dropped rather than reserving
   height for nothing. */
export function textLines(s){
  return String(s == null ? '' : s)
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
}

/* Name and detail are one fitted block each, so their typed lines become
   forced breaks inside it. Empty when there is nothing to draw. */
export const linesHTML = s => textLines(s).map(esc).join('<br>');

/* A row the user has started but not filled in should not consume a cell. */
export const isBlank = item =>
  !(item && (textLines(item.name).length || textLines(item.price).length ||
             textLines(item.detail).length));

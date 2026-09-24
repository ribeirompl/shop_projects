/* What someone types in the table, turned into what gets drawn.

     npm test
*/

import test from 'node:test';
import assert from 'node:assert/strict';

import { esc, textLines, linesHTML, isBlank } from '../src/text.js';

test('typed text is escaped, because slots are filled with innerHTML', () => {
  assert.equal(esc('AT&T'), 'AT&amp;T');
  assert.equal(esc('<b>BREAD</b>'), '&lt;b&gt;BREAD&lt;/b&gt;');
  assert.equal(esc('2 < 3 & 4 > 1'), '2 &lt; 3 &amp; 4 &gt; 1');
});

test('escaping ampersands first stops a double-escape', () => {
  assert.equal(esc('&lt;'), '&amp;lt;', 'the literal text the user typed, shown as-is');
});

test('nothing at all escapes to an empty string, not "null"', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '0', 'but a real zero survives');
});

test('each typed price line becomes its own line, so "BOTH FOR" can print small', () => {
  assert.deepEqual(textLines('BOTH FOR\nR32'), ['BOTH FOR', 'R32']);
  assert.deepEqual(textLines('R9.99'), ['R9.99']);
});

test('price lines are trimmed, and blank ones do not reserve height', () => {
  assert.deepEqual(textLines('  BOTH FOR  \n\n  R32  \n'), ['BOTH FOR', 'R32']);
  assert.deepEqual(textLines('   '), []);
  assert.deepEqual(textLines(''), []);
  assert.deepEqual(textLines(null), []);
});

test('a textarea pasted from Windows splits on CRLF too', () => {
  assert.deepEqual(textLines('BOTH FOR\r\nR32'), ['BOTH FOR', 'R32']);
});

test('a row the user started but never filled in does not take up a cell', () => {
  assert.equal(isBlank({ name:'', price:'', detail:'' }), true);
  assert.equal(isBlank({}), true);
  assert.equal(isBlank(null), true);

  assert.equal(isBlank({ name:'BANANAS', price:'', detail:'' }), false);
  assert.equal(isBlank({ name:'', price:'R9.99', detail:'' }), false);
  assert.equal(isBlank({ name:'', price:'', detail:'PER KG' }), false);
});

test('name and detail keep their typed line breaks, escaped, blank lines dropped', () => {
  assert.equal(linesHTML('ALBANY WHITE BREAD\n\n& MILK '), 'ALBANY WHITE BREAD<br>&amp; MILK');
  assert.equal(linesHTML('PER KG'), 'PER KG');
  assert.equal(linesHTML(' \n '), '', 'nothing to draw');
});

test('a cell holding only whitespace or newlines still counts as blank', () => {
  assert.equal(isBlank({ name:'\n', price:'  ', detail:'' }), true);
});

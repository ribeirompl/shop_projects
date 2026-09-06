import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshState, cycleUnavailable, gotoWeek, setCell } from '../src/model.js';
import { canon, suggestions, popular, tallies } from '../src/suggest.js';

const byName = (state, name) => state.staff.find(s => s.name === name);
const texts = list => list.map(x => x.text);

test('canon gives one spelling per shift', () => {
  assert.equal(canon('07:00-16:00'), '7-4');
  assert.equal(canon(' 7 – 4 '), '7-4');
  assert.equal(canon('off'), 'OFF');
  assert.equal(canon('x'), 'OFF');
  assert.equal(canon('leave'), 'LEAVE');
  assert.equal(canon('**'), '**');
  assert.equal(canon(''), '');
});

test('this person\'s own shifts rank first, then the weekday\'s, then everyone\'s', () => {
  const s = freshState();
  const sipha = byName(s, 'Sipha').id;         /* 2-8 ×4, 4-8, 9-3, OFF */
  const top = texts(suggestions(s, sipha, 3));
  assert.equal(top[0], '2-8');
  assert.ok(top.includes('OFF'));
  const t = tallies(s, sipha, 3);
  assert.equal(t.person.get('2-8'), 4);
  assert.ok(t.all.get('9-8') > (t.person.get('9-8') || 0));
});

test('typing narrows by prefix and a typed shift is always offered first', () => {
  const s = freshState();
  const jana = byName(s, 'Jana').id;
  assert.ok(texts(suggestions(s, jana, 0, '7')).every(t => t.startsWith('7')));
  assert.ok(texts(suggestions(s, jana, 0, '12')).every(t => t.startsWith('12')));
  assert.deepEqual(texts(suggestions(s, jana, 0, 'o')), ['OFF']);
  const custom = suggestions(s, jana, 0, '7-3:30');
  assert.equal(custom[0].text, '7-3:30');
  assert.equal(custom[0].custom, true);
  const known = suggestions(s, jana, 0, '7-4');
  assert.equal(known[0].text, '7-4');
  assert.equal(known[0].custom, undefined);
  assert.equal(suggestions(s, jana, 0, '7-4-5').some(x => x.custom), false);   /* junk is not offered */
  assert.equal(suggestions(s, jana, 0, 'x')[0].text, 'OFF');
});

test('unavailable puts OFF first; history and patterns count too', () => {
  const s = freshState();
  const jana = byName(s, 'Jana').id;
  assert.notEqual(texts(suggestions(s, jana, 0))[0], 'OFF');
  cycleUnavailable(s, jana, 0);
  assert.equal(texts(suggestions(s, jana, 0))[0], 'OFF');

  const s2 = freshState();
  const id = byName(s2, 'Chiara').id;         /* only weekends this week */
  gotoWeek(s2, '2026-09-07');
  for (let d = 0; d < 5; d++) setCell(s2, id, d, { t: '10-3' });
  gotoWeek(s2, '2026-08-31');
  assert.equal(texts(suggestions(s2, id, 0))[0], '10-3');
});

test('popular is the palette', () => {
  const s = freshState();
  const p = popular(s, 5);
  assert.equal(p.length, 5);
  assert.equal(p[0], 'OFF');                   /* 40-odd OFFs in the seed week */
  assert.ok(p.includes('9-8'));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshState, getCell } from '../src/model.js';
import { frameWeekOf, frameMembers, saveWeekToFrame, applyFrame, clearFrameWeek, getPattern, setPattern, patternHasContent } from '../src/frame.js';

const byName = (state, name) => state.staff.find(s => s.name === name);

test('which frame week applies follows the anchor', () => {
  const s = freshState();
  assert.equal(s.frame.anchor, '2024-01-01');
  assert.equal(frameWeekOf(s, '2024-01-01'), 0);
  assert.equal(frameWeekOf(s, '2026-08-31'), 1);        /* 139 weeks on, 139 mod 3 */
  s.frame.weeks = 3; s.frame.anchor = '2026-08-31';
  assert.equal(frameWeekOf(s, '2026-08-31'), 0);
  assert.equal(frameWeekOf(s, '2026-09-07'), 1);
  assert.equal(frameWeekOf(s, '2026-09-14'), 2);
  assert.equal(frameWeekOf(s, '2026-09-21'), 0);
  assert.equal(frameWeekOf(s, '2026-08-24'), 2);
  s.frame.weeks = 0;                                   /* nonsense is clamped */
  assert.equal(frameWeekOf(s, '2026-09-07'), 0);
});

test('members default to the permanents and follow roster order', () => {
  const s = freshState();
  const ids = frameMembers(s);
  assert.deepEqual(ids, s.staff.filter(p => p.type === 'permanent').map(p => p.id));
  s.frame.members = [...ids, 'ghost'];
  assert.deepEqual(frameMembers(s), ids);
});

test('save, edit, apply, clear', () => {
  const s = freshState();
  const ids = frameMembers(s);
  const jana = byName(s, 'Jana').id;
  saveWeekToFrame(s, 1, ids);
  assert.deepEqual(getPattern(s, jana, 1, 1), { t: '9-8', tag: 'LSTORE' });
  assert.equal(patternHasContent(s, jana, 1), true);
  assert.equal(patternHasContent(s, jana, 0), false);

  setPattern(s, jana, 1, 1, { t: '7-4' });
  assert.deepEqual(getPattern(s, jana, 1, 1), { t: '7-4', tag: 'LSTORE' });   /* tag kept */
  setPattern(s, jana, 0, 3, { tag: 'BAKERY' });
  assert.deepEqual(getPattern(s, jana, 0, 3), { t: '', tag: 'BAKERY' });

  s.cells = {};
  assert.equal(applyFrame(s, 2, ids), 0);              /* nothing saved in week 3 */
  const touched = applyFrame(s, 1, ids);
  assert.equal(touched, ids.length * 7);
  assert.deepEqual(getCell(s, jana, 1), { t: '7-4', tag: 'LSTORE' });
  assert.equal(getCell(s, byName(s, 'Jayden').id, 1).t, '');   /* casuals untouched */

  clearFrameWeek(s, 1, ids);
  assert.equal(s.frame.patterns[jana][1], undefined);
  assert.equal(patternHasContent(s, jana, 1), false);
});

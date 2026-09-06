import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshState, blankState, setCell, getCell, cellColor, migrate, cycleUnavailable, unavailable, unavailLabel,
         gotoWeek, savedWeeks, copyWeekFrom, removeStaff, removeTag, addTag, inkFor, deptOf, depts, TILLS } from '../src/model.js';
import { dayCoverage, dayHeadcount, staffSummary, warnings, peakCoverage, breakFor, ALL } from '../src/coverage.js';
import { parseShift } from '../src/shifts.js';

const H = 60;
const byName = (state, name) => state.staff.find(s => s.name === name);

test('the seed loads with every cell readable, permanents first', () => {
  const s = freshState();
  assert.equal(s.staff.length, 32);
  assert.equal(getCell(s, byName(s, 'Jana').id, 0).t, '7-4');
  assert.equal(getCell(s, byName(s, 'Jana').id, 1).tag, 'LSTORE');
  assert.equal(getCell(s, byName(s, 'Joshua').id, 2).t, '8-12, 5-8');
  const types = s.staff.map(p => p.type);
  assert.equal(types.lastIndexOf('permanent') < types.indexOf('casual'), true);
});

test('coverage counts the people on the floor at each instant', () => {
  const s = freshState();
  const mon = dayCoverage(s, 0, 30);
  assert.equal(mon.marks[0], 7 * H);
  assert.equal(mon.marks.at(-1), 19 * H + 30);
  /* 07:00 Monday: Jana 7-4, Anita 7-5, Sive 7-5, Celiwe 7-5, Shaun 7-2, Debbie 7-5 */
  assert.equal(mon.counts[0], 6);
  assert.deepEqual(mon.who[0].map(id => s.staff.find(p => p.id === id).name).sort(),
    ['Anita', 'Celiwe', 'Debbie', 'Jana', 'Shaun', 'Sive']);
  assert.ok(peakCoverage(s) >= 6);
});

test('coverage per department follows the colour tag; no tag is the tills', () => {
  const s = freshState();
  assert.equal(deptOf(s, { t: '7-4', tag: null }), TILLS);
  assert.equal(deptOf(s, { t: '7-4', tag: 'LSTORE' }), 'LSTORE');
  assert.equal(deptOf(s, { t: '7-4', tag: 'LEAVE' }), TILLS);      /* leave is not a place */
  assert.deepEqual(depts(s).map(d => d.id), [TILLS, 'LSTORE', 'BAKERY', 'LSF', 'MIXED']);
  /* Tuesday 10:00: Jana, Chanelle, Loretta(OFF Tue), Alex on LSTORE 9-8 */
  const tue = dayCoverage(s, 1, 60, 'LSTORE');
  const at10 = tue.counts[tue.marks.indexOf(10 * H)];
  assert.equal(at10, 3);
  assert.equal(dayHeadcount(s, 1, 'LSTORE'), 3);
  assert.equal(dayHeadcount(s, 1, ALL), dayHeadcount(s, 1, TILLS) + 3);
});

test('breaks come off paid hours by the biggest rule exceeded', () => {
  const s = freshState();
  s.breaks = [{ over: 5, minutes: 30 }, { over: 9, minutes: 60 }];
  assert.equal(breakFor(s, 4 * H), 0);
  assert.equal(breakFor(s, 5 * H), 0);           /* "over", not "at least" */
  assert.equal(breakFor(s, 8 * H), 30);
  assert.equal(breakFor(s, 11 * H), 60);
  const jana = staffSummary(s, byName(s, 'Jana').id);
  assert.equal(jana.worked, (9 + 11 + 11 + 9 + 11) * H);
  assert.equal(jana.minutes, jana.worked - (30 + 60 + 60 + 30 + 60));   /* 9h,11h,11h,9h,11h */
  s.breaks = [];
  assert.equal(staffSummary(s, byName(s, 'Jana').id).minutes, jana.worked);
});

test('per-person summary', () => {
  const s = freshState();
  s.breaks = [];
  const jana = staffSummary(s, byName(s, 'Jana').id);
  assert.equal(jana.daysWorked, 5);
  assert.equal(jana.offDays, 2);
  assert.equal(staffSummary(s, byName(s, 'Joshua').id).blanks, 1);
  const sofie = staffSummary(s, byName(s, 'Sofie').id);
  assert.equal(sofie.notes, 2);
  assert.equal(sofie.minutes, 0);
});

test('warnings: over the limit, seven days, notes, rostered while unavailable', () => {
  const s = freshState();
  let ws = warnings(s);
  assert.ok(ws.some(w => w.level === 'bad' && /Chanelle.*over 45h/.test(w.msg)));
  assert.ok(ws.some(w => w.level === 'bad' && /Hershell.*seven/.test(w.msg)));
  assert.ok(ws.some(w => w.level === 'warn' && /Sofie.*not a shift/.test(w.msg)));
  s.limits.weekHours = 70;
  assert.ok(!warnings(s).some(w => /over 70h/.test(w.msg)));

  const jorja = byName(s, 'Jorja').id;
  cycleUnavailable(s, jorja, 0);
  ws = warnings(s);
  assert.ok(ws.some(w => w.level === 'bad' && /Jorja Mon: rostered on a day marked unavailable/.test(w.msg)));
});

test('unavailability cycles available → this date → every weekday → available', () => {
  const s = freshState();
  const id = byName(s, 'Elijah').id;
  assert.equal(unavailable(s, id, 1), null);
  cycleUnavailable(s, id, 1);
  assert.equal(unavailable(s, id, 1), 'date');
  assert.equal(unavailLabel(s, id, 1), 'unavailable');
  cycleUnavailable(s, id, 1);
  assert.equal(unavailable(s, id, 1), 'weekly');
  assert.equal(unavailLabel(s, id, 1), 'every Tuesday');
  gotoWeek(s, '2026-09-07');
  assert.equal(unavailable(s, id, 1), 'weekly');     /* weekly follows the person */
  cycleUnavailable(s, id, 3);
  gotoWeek(s, '2026-08-31');
  assert.equal(unavailable(s, id, 3), null);         /* a date mark does not */
  cycleUnavailable(s, id, 1);
  assert.equal(unavailable(s, id, 1), null);
  removeStaff(s, id);
  assert.deepEqual(Object.keys(s.unavail), []);
});

test('tags: colours are editable, removing one leaves cells plain', () => {
  const s = freshState();
  assert.equal(inkFor('#FF0000'), '#ffffff');
  assert.equal(inkFor('#FFE699'), '#000000');
  const jana = byName(s, 'Jana').id;
  assert.equal(cellColor(s, getCell(s, jana, 1)).color, '#70AD47');
  s.tags.find(t => t.id === 'LSTORE').color = '#123456';
  assert.equal(cellColor(s, getCell(s, jana, 1)).color, '#123456');
  const t = addTag(s, 'Deli', '#ffcc00', true);
  assert.ok(depts(s).some(d => d.id === t.id));
  removeTag(s, 'LSTORE');
  assert.equal(getCell(s, jana, 1).tag, null);
  assert.equal(cellColor(s, getCell(s, jana, 1)), null);
  assert.equal(deptOf(s, { t: '7-4', tag: 'LSTORE' }), TILLS);   /* a stale id is harmless */
});

test('weeks: switching parks the roster and brings it back; copy previous', () => {
  const s = freshState();
  const jana = byName(s, 'Jana').id;
  gotoWeek(s, '2026-09-09');                          /* a Wednesday snaps to its Monday */
  assert.equal(s.weekStart, '2026-09-07');
  assert.deepEqual(s.cells, {});
  assert.deepEqual(savedWeeks(s), ['2026-08-31']);
  assert.equal(copyWeekFrom(s, '2026-08-31') > 0, true);
  assert.equal(getCell(s, jana, 0).t, '7-4');
  setCell(s, jana, 0, { t: '9-5' });
  gotoWeek(s, '2026-08-31');
  assert.equal(getCell(s, jana, 0).t, '7-4');
  gotoWeek(s, '2026-09-07');
  assert.equal(getCell(s, jana, 0).t, '9-5');
  gotoWeek(s, '2026-09-14');
  gotoWeek(s, '2026-09-21');
  assert.deepEqual(savedWeeks(s), ['2026-08-31', '2026-09-07']);   /* empty weeks are not kept */
});

test('setCell drops empty cells and keeps tags; colours follow tag then kind', () => {
  const s = freshState();
  const id = byName(s, 'Anke').id;
  setCell(s, id, 0, { t: '' });
  assert.equal(s.cells[id + '|0'], undefined);
  setCell(s, id, 0, { tag: 'BAKERY' });
  assert.deepEqual(getCell(s, id, 0), { t: '', tag: 'BAKERY' });
  assert.equal(cellColor(s, getCell(s, id, 0)).color, '#ED7D31');
  assert.equal(cellColor(s, { t: 'OFF', tag: null }).color, '#FFE699');
  assert.equal(cellColor(s, { t: '7-4', tag: null }), null);
});

test('migrate accepts a roster as it is and refuses anything else; blank has the settings only', () => {
  const s = freshState();
  const saved = JSON.parse(JSON.stringify(s));
  assert.deepEqual(migrate(saved), saved);
  assert.equal(migrate({ v: 99 }), null);
  assert.equal(migrate({ v: 1 }), null);
  assert.equal(migrate(null), null);
  const b = blankState();
  assert.equal(b.staff.length, 0);
  assert.equal(b.frame.anchor, '2024-01-01');
  assert.equal(b.tags.length, 5);
});

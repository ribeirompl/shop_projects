import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSpan, parseShift, formatSpan, formatShift, hoursLabel, coversAt } from '../src/shifts.js';

const H = 60;

test('shop notation: a start of 1–6 is afternoon, an end rolls forward past the start', () => {
  assert.deepEqual(parseSpan('7-4'),  { start: 7 * H,  end: 16 * H });
  assert.deepEqual(parseSpan('12-8'), { start: 12 * H, end: 20 * H });
  assert.deepEqual(parseSpan('8-12'), { start: 8 * H,  end: 12 * H });
  assert.deepEqual(parseSpan('2-8'),  { start: 14 * H, end: 20 * H });
  assert.deepEqual(parseSpan('1-8'),  { start: 13 * H, end: 20 * H });
  assert.deepEqual(parseSpan('11-6'), { start: 11 * H, end: 18 * H });
  assert.deepEqual(parseSpan('9-2'),  { start: 9 * H,  end: 14 * H });
});

test('minutes, 24-hour and am/pm forms', () => {
  assert.deepEqual(parseSpan('7:30-4'),      { start: 7 * H + 30, end: 16 * H });
  assert.deepEqual(parseSpan('10-4:30'),     { start: 10 * H, end: 16 * H + 30 });
  assert.deepEqual(parseSpan('07:00-16:00'), { start: 7 * H, end: 16 * H });
  assert.deepEqual(parseSpan('14-20'),       { start: 14 * H, end: 20 * H });
  assert.deepEqual(parseSpan('7am-4pm'),     { start: 7 * H, end: 16 * H });
  assert.deepEqual(parseSpan('7 – 4'),       { start: 7 * H, end: 16 * H });
  assert.deepEqual(parseSpan('7 to 4'),      { start: 7 * H, end: 16 * H });
});

test('junk is not a span', () => {
  for (const s of ['', '7', '7-4-5', '25-8', 'seven-four', '7-60:00']) assert.equal(parseSpan(s), null, s);
});

test('cell kinds', () => {
  assert.equal(parseShift('7-4').kind, 'work');
  assert.equal(parseShift('OFF').kind, 'off');
  assert.equal(parseShift(' off ').kind, 'off');
  assert.equal(parseShift('Leave').kind, 'leave');
  assert.equal(parseShift('').kind, 'blank');
  assert.equal(parseShift(null).kind, 'blank');
  assert.equal(parseShift('**').kind, 'note');
  assert.equal(parseShift('exam').kind, 'note');
});

test('split shifts add up and sort; overlaps are refused', () => {
  const p = parseShift('5-8, 8-12');
  assert.equal(p.kind, 'work');
  assert.deepEqual(p.spans, [{ start: 8 * H, end: 12 * H }, { start: 17 * H, end: 20 * H }]);
  assert.equal(p.minutes, 7 * H);
  assert.equal(parseShift('9-2 & 5-8').minutes, 8 * H);
  assert.equal(parseShift('8-12, 11-3').kind, 'note');
});

test('formatting round-trips, falling back to 24-hour when shop notation would misread', () => {
  const cases = [[7 * H, 16 * H], [12 * H, 20 * H], [8 * H, 12 * H], [14 * H, 20 * H], [7 * H + 30, 16 * H],
                 [6 * H, 14 * H], [19 * H, 21 * H], [0, 4 * H]];
  for (const [start, end] of cases){
    const txt = formatSpan({ start, end });
    assert.deepEqual(parseSpan(txt), { start, end }, txt);
  }
  assert.equal(formatSpan({ start: 7 * H, end: 16 * H }), '7-4');
  assert.equal(formatSpan({ start: 6 * H, end: 14 * H }), '06:00-14:00');
  assert.equal(formatShift([{ start: 8 * H, end: 12 * H }, { start: 17 * H, end: 20 * H }]), '8-12, 5-8');
});

test('hours label and coverage instants', () => {
  assert.equal(hoursLabel(9 * H), '9h');
  assert.equal(hoursLabel(8 * H + 30), '8h30');
  const p = parseShift('7-4');
  assert.equal(coversAt(p, 7 * H), true);
  assert.equal(coversAt(p, 16 * H), false);   /* end is exclusive */
  assert.equal(coversAt(p, 6 * H + 59), false);
});

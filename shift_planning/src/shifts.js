/* ==========================================================================
   shifts.js — the shop's shift notation, and nothing else.

   Staff write shifts the way the old spreadsheet did: "7-4" is 07:00–16:00,
   "12-8" is 12:00–20:00, "2-8" is 14:00–20:00 and "8-12" is 08:00–12:00.
   Nobody writes am/pm, so the rules that make that unambiguous are:

     · a START of 1–6 is afternoon (13:00–18:00); 7–12 is morning
     · an END that is not after the start rolls forward twelve hours
     · anything with a leading zero, or ≥ 13, is already 24-hour and is
       taken literally ("07:00-16:00", "14-20")
     · an explicit am/pm suffix always wins ("7am-4pm")

   A cell may hold several spans ("8-12, 5-8" — a split shift), the word
   OFF, a leave word, or any other note ("**", "exam"). Everything here is
   pure — minutes in, minutes out — so it is tested without a browser.
   ========================================================================== */

export const OFF_WORDS   = ['off', 'x', 'rest', '-'];
export const LEAVE_WORDS = ['leave', 'sick', 'al', 'holiday', 'annual'];

const SPAN_SPLIT = /\s*(?:,|&|\+|;|\/|\band\b)\s*/i;
const DASH       = /\s*[-–—]\s*|\s+to\s+/i;
const TIME       = /^(\d{1,2})(?:[:.h](\d{1,2}))?\s*(am|pm|a|p)?$/i;

function token(str){
  const m = TIME.exec(str.trim());
  if (!m) return null;
  const h = +m[1], min = m[2] ? +m[2].padEnd(2, '0') : 0;
  if (h > 24 || min > 59) return null;
  const literal = h >= 13 || (m[1].length === 2 && m[1][0] === '0');
  const ampm    = m[3] ? m[3][0].toLowerCase() : null;
  return { h, min, literal, ampm };
}

function resolve(t, { start, after }){
  let h = t.h;
  if (t.ampm === 'p' && h < 12) h += 12;
  else if (t.ampm === 'a' && h === 12) h = 0;
  else if (!t.ampm && !t.literal){
    if (start){ if (h >= 1 && h <= 6) h += 12; }
    else if (h * 60 + t.min <= after && h < 12) h += 12;
  }
  return h * 60 + t.min;
}

/* "7-4" → {start:420, end:960} or null */
export function parseSpan(str){
  const parts = str.split(DASH);
  if (parts.length !== 2) return null;
  const a = token(parts[0]), b = token(parts[1]);
  if (!a || !b) return null;
  const start = resolve(a, { start: true });
  const end   = resolve(b, { start: false, after: start });
  if (end <= start || end > 24 * 60) return null;
  return { start, end };
}

/* The whole cell. `kind` is one of:
     work   — spans:[{start,end}], minutes
     off    — a rest day (counts as a day off)
     leave  — annual/sick leave (not a rest day, not work)
     blank  — nothing typed
     note   — text that is none of the above; printed as-is, not counted */
export function parseShift(text){
  const raw = (text ?? '').toString().trim();
  if (!raw) return { kind: 'blank', text: raw, spans: [], minutes: 0 };
  const low = raw.toLowerCase();
  if (OFF_WORDS.includes(low))   return { kind: 'off',   text: raw, spans: [], minutes: 0 };
  if (LEAVE_WORDS.includes(low)) return { kind: 'leave', text: raw, spans: [], minutes: 0 };

  const spans = raw.split(SPAN_SPLIT).map(parseSpan);
  if (spans.some(s => !s)) return { kind: 'note', text: raw, spans: [], minutes: 0 };
  spans.sort((p, q) => p.start - q.start);
  for (let i = 1; i < spans.length; i++){
    if (spans[i].start < spans[i - 1].end) return { kind: 'note', text: raw, spans: [], minutes: 0 };
  }
  const minutes = spans.reduce((n, s) => n + s.end - s.start, 0);
  return { kind: 'work', text: raw, spans, minutes };
}

export const isWorking = text => parseShift(text).kind === 'work';

/* ---- formatting ---------------------------------------------------------- */

const pad2 = n => String(n).padStart(2, '0');
export const clock = m => pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);

function shopToken(m){
  let h = Math.floor(m / 60); const min = m % 60;
  if (h > 12) h -= 12;
  return min ? h + ':' + pad2(min) : String(h);
}

/* Shop notation when it survives a round trip, 24-hour otherwise — so
   06:00–14:00 comes out as "06:00-14:00" rather than "6-2" (= 18:00–14:00). */
export function formatSpan({ start, end }){
  const shop = shopToken(start) + '-' + shopToken(end);
  const back = parseSpan(shop);
  if (back && back.start === start && back.end === end) return shop;
  return clock(start) + '-' + clock(end);
}

export const formatShift = spans => spans.map(formatSpan).join(', ');

/* 540 → "9h", 510 → "8h30" */
export function hoursLabel(minutes){
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m ? `${h}h${pad2(m)}` : `${h}h`;
}

/* Does the shift cover the instant `m` (minutes from midnight)? */
export function coversAt(parsed, m){
  return parsed.spans.some(s => s.start <= m && m < s.end);
}

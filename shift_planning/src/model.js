/* ==========================================================================
   model.js — the one state shape, the store around it, and the small
   helpers every view uses to read and write it.

   state = {
     v:          1
     weekStart:  'YYYY-MM-DD'          Monday of the week being planned
     cells:      { 'id|day': { t:'7-4', tag:'LSTORE'|null } }   day 0 = Monday
                 — the week being planned. Other weeks live in `weeks`.
     weeks:      { 'YYYY-MM-DD': cells }   every week that has been touched
     open, close: minutes from midnight — the hours coverage is measured over
     staff:      [{ id, name, type:'permanent'|'casual' }]   display order
     tags:       [{ id, label, color, dept }]  the colour legend; dept means
                 the colour is a place people work (counted separately)
     unavail:    { 'id|YYYY-MM-DD': true }     cannot work that date
     unavailWeekly: { 'id|dow': true }         cannot work that weekday, ever
     breaks:     [{ over: hours, minutes }]    unpaid break by shift length
     limits:     { weekHours, shiftHours }     what the side panel flags
     frame:      { weeks, anchor, members:[id], patterns:{ id: [week][day] → {t,tag} } }
     notice:     footer line on the printed roster
     ui:         { view }                      remembered, but not roster data
   }

   The text in a cell is the source of truth — exactly what prints — and
   shifts.js turns it into minutes when a view needs numbers. Views change
   state only through store.update(fn), which snapshots for undo, notifies
   every view and persists.
   ========================================================================== */

import { SEED_STAFF, SEED_WEEK } from './seed.js';
import { parseShift } from './shifts.js';

export const STORE_KEY = 'shift-planner.v2';

export const DAYS      = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const MONTHS    = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ---- colours ------------------------------------------------------------- */

/* The legend from the old sheet, as the starting point. A tag is where the
   person works that day; no tag means the tills. OFF is not a tag — a cell
   whose text reads as a rest day is coloured automatically — but it is in
   the printed legend so the key matches what staff are used to. Tags are
   edited on the Setup page; history keeps the tag id, so renaming a colour
   renames it everywhere and deleting one leaves old cells plain. */
export const DEFAULT_TAGS = [
  { id: 'LEAVE',  label: 'LEAVE',         color: '#FF0000', dept: false },
  { id: 'LSTORE', label: 'LSTORE',        color: '#70AD47', dept: true },
  { id: 'BAKERY', label: 'BAKERY',        color: '#ED7D31', dept: true },
  { id: 'LSF',    label: 'L STORE FOODS', color: '#00B0F0', dept: true },
  { id: 'MIXED',  label: 'MIXED SHIFT',   color: '#ACB9CA', dept: true }
];
export const OFF_COLOR = '#FFE699';
export const TILLS = 'TILLS';

/* Black or white text, whichever reads on `color`. */
export function inkFor(color){
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color || '');
  if (!m) return '#000000';
  const [r, g, b] = m.slice(1).map(x => parseInt(x, 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.55 ? '#000000' : '#ffffff';
}

export const tagById = (state, id) => (state.tags || []).find(t => t.id === id) || null;

/* Departments for coverage: the tills, plus every tag that is a place. */
export const depts = state => [{ id: TILLS, label: 'Tills' }, ...state.tags.filter(t => t.dept).map(t => ({ id: t.id, label: t.label }))];
export const deptOf = (state, cell) => { const t = cell && cell.tag && tagById(state, cell.tag); return t && t.dept ? t.id : TILLS; };

/* Fill + ink for a cell, or null for a plain one. */
export function cellColor(state, cell){
  const tag = cell && cell.tag && tagById(state, cell.tag);
  if (tag) return { color: tag.color, ink: inkFor(tag.color) };
  const kind = parseShift(cell && cell.t).kind;
  if (kind === 'off') return { color: OFF_COLOR, ink: '#000000' };
  if (kind === 'leave'){
    const leave = state.tags.find(t => /leave/i.test(t.label));
    const color = leave ? leave.color : '#FF0000';
    return { color, ink: inkFor(color) };
  }
  return null;
}

export function addTag(state, label, color = '#cccccc', dept = true){
  const t = { id: uid(), label: label.trim() || 'Colour', color, dept };
  state.tags.push(t);
  return t;
}

export function removeTag(state, id){
  state.tags = state.tags.filter(t => t.id !== id);
  const strip = cells => { for (const c of Object.values(cells)) if (c.tag === id) c.tag = null; };
  strip(state.cells);
  for (const w of Object.values(state.weeks)) strip(w);
  for (const rows of Object.values(state.frame.patterns)) for (const row of rows || []) if (row) strip(row);
}

/* ---- dates ---------------------------------------------------------------- */

export const isoDate = d =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
export const fromISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const mondayOf = d => addDays(d, -((d.getDay() + 6) % 7));
export const daysBetween = (a, b) => Math.round((fromISO(b) - fromISO(a)) / 864e5);
export const fmtDay = d => d.getDate() + ' ' + MONTHS[d.getMonth()];
export const weekDates = state => DAYS.map((_, i) => addDays(fromISO(state.weekStart), i));
export const weekLabel = state => {
  const [a, , , , , , b] = weekDates(state);
  return fmtDay(a) + ' – ' + fmtDay(b) + ' ' + b.getFullYear();
};
export const thisMonday = () => isoDate(mondayOf(new Date()));

/* ---- cells ---------------------------------------------------------------- */

export const cellKey = (id, day) => id + '|' + day;

export function getCell(state, id, day){
  return state.cells[cellKey(id, day)] || { t: '', tag: null };
}

/* Merge a patch; an empty cell is dropped so the map only holds real data. */
export function setCell(state, id, day, patch){
  const cur  = getCell(state, id, day);
  const next = { t: patch.t !== undefined ? String(patch.t) : cur.t,
                 tag: patch.tag !== undefined ? (patch.tag || null) : cur.tag };
  if (!next.t && !next.tag) delete state.cells[cellKey(id, day)];
  else state.cells[cellKey(id, day)] = next;
}

export const staffById = (state, id) => state.staff.find(s => s.id === id) || null;

/* ---- weeks ---------------------------------------------------------------- */

/* The week being planned is `cells`; every other week sits in `weeks`.
   Switching parks the current one and unparks the target, so the rest of
   the code only ever looks at `cells`. */
export function gotoWeek(state, iso){
  const monday = isoDate(mondayOf(fromISO(iso)));
  if (monday === state.weekStart) return;
  if (Object.keys(state.cells).length) state.weeks[state.weekStart] = state.cells;
  else delete state.weeks[state.weekStart];
  state.weekStart = monday;
  state.cells = state.weeks[monday] || {};
}

export const savedWeeks = state =>
  Object.keys(state.weeks).filter(k => k !== state.weekStart && Object.keys(state.weeks[k]).length).sort();

export const previousWeek = state => isoDate(addDays(fromISO(state.weekStart), -7));
export const nextWeek     = state => isoDate(addDays(fromISO(state.weekStart), 7));

export function copyWeekFrom(state, iso){
  const src = iso === state.weekStart ? state.cells : state.weeks[iso];
  if (!src) return 0;
  state.cells = JSON.parse(JSON.stringify(src));
  return Object.keys(state.cells).length;
}

export function clearWeek(state){
  state.cells = {};
}

/* ---- availability ---------------------------------------------------------- */

/* Three states for a person on day d of the current week:
     null      — available
     'date'    — cannot work this date
     'weekly'  — cannot work this weekday, every week
   A date mark is shown ahead of a weekly one, but both mean unavailable. */
export function unavailable(state, id, d){
  const iso = isoDate(weekDates(state)[d]);
  if (state.unavail[id + '|' + iso]) return 'date';
  if (state.unavailWeekly[id + '|' + d]) return 'weekly';
  return null;
}

/* What the mark says: "unavailable" or "every Tuesday". */
export const unavailLabel = (state, id, d) => {
  const u = unavailable(state, id, d);
  return u === 'weekly' ? 'every ' + DAYS[d] : u === 'date' ? 'unavailable' : null;
};

/* available → unavailable (this date) → every <weekday> → available. */
export function cycleUnavailable(state, id, d){
  const iso = isoDate(weekDates(state)[d]);
  const cur = unavailable(state, id, d);
  delete state.unavail[id + '|' + iso];
  delete state.unavailWeekly[id + '|' + d];
  if (cur === null)   state.unavail[id + '|' + iso] = true;
  else if (cur === 'date') state.unavailWeekly[id + '|' + d] = true;
}

/* ---- staff ---------------------------------------------------------------- */

export const uid = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function addStaff(state, name, type = 'casual'){
  const s = { id: uid(), name: name.trim(), type };
  state.staff.push(s);
  return s;
}

export function removeStaff(state, id){
  state.staff = state.staff.filter(s => s.id !== id);
  const strip = map => { for (const k of Object.keys(map)) if (k.startsWith(id + '|')) delete map[k]; };
  strip(state.cells);
  for (const w of Object.values(state.weeks)) strip(w);
  strip(state.unavail); strip(state.unavailWeekly);
  delete state.frame.patterns[id];
  state.frame.members = state.frame.members.filter(m => m !== id);
}

export function moveStaff(state, id, delta){
  const i = state.staff.findIndex(s => s.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= state.staff.length) return;
  [state.staff[i], state.staff[j]] = [state.staff[j], state.staff[i]];
}

/* ---- fresh state ---------------------------------------------------------- */

export const FRAME_ANCHOR = '2024-01-01';   /* a Monday */

function baseState(){
  return {
    v: 1,
    weekStart: thisMonday(),
    cells: {},
    weeks: {},
    open: 7 * 60,
    close: 20 * 60,
    staff: [],
    tags: DEFAULT_TAGS.map(t => ({ ...t })),
    unavail: {},
    unavailWeekly: {},
    breaks: [{ over: 5, minutes: 60 }],
    limits: { weekHours: 45, shiftHours: 12 },
    frame: { weeks: 3, anchor: FRAME_ANCHOR, members: [], patterns: {} },
    notice: 'NO SWOPPING OF SHIFTS ALLOWED WITHOUT MANAGEMENT APPROVAL',
    ui: { view: 'grid' }
  };
}

/* Nothing in it but the settings — what a new roster file starts from. */
export const blankState = baseState;

/* The August 2026 week from the old workbook, for trying the tool out. */
export function freshState(){
  const s = baseState();
  /* Permanents first, casuals after, each keeping the sheet's order: the
     views group by type, and the sheet interleaves them. */
  const ordered = [...SEED_STAFF].sort((a, b) => (a[1] === 'casual') - (b[1] === 'casual'));
  s.staff = ordered.map(([name, type], i) => ({ id: 'p' + String(i + 1).padStart(2, '0'), name, type }));
  ordered.forEach(([, , week], i) => week.forEach((c, d) => {
    const [t, tag] = Array.isArray(c) ? c : [c, null];
    if (t || tag) s.cells[cellKey(s.staff[i].id, d)] = { t, tag: tag || null };
  }));
  s.weekStart = SEED_WEEK;
  s.frame.members = s.staff.filter(p => p.type === 'permanent').map(p => p.id);
  return s;
}

/* A saved roster is taken as it is; anything that is not one is refused.
   No migration yet — the shape is still moving, and the storage key is
   bumped when it does. */
export function migrate(loaded){
  return loaded && loaded.v === 1 && Array.isArray(loaded.staff) && Array.isArray(loaded.tags) ? loaded : null;
}

/* ---- the store ------------------------------------------------------------ */

export const serialize = state => JSON.stringify({ ...state, savedAt: Date.now() });

export function createStore(initial, { persist = true, limit = 200 } = {}){
  let state = initial;
  const subs = new Set();
  const past = [], future = [];

  const save = () => {
    if (!persist) return;
    try { localStorage.setItem(STORE_KEY, serialize(state)); } catch { /* quota / private mode */ }
  };
  const notify = meta => subs.forEach(fn => fn(state, meta));

  return {
    get state(){ return state; },

    /* fn mutates state in place. {history:false} for UI-only changes
       (which tab is open) that should not be undoable. */
    update(fn, { history = true, label = '' } = {}){
      if (history){
        past.push(JSON.stringify(state));
        if (past.length > limit) past.shift();
        future.length = 0;
      }
      fn(state);
      save();
      notify({ label, history });
    },

    /* Swap the whole state (import, reset, file load). */
    replace(next, { history = true, label = 'replace' } = {}){
      if (history){
        past.push(JSON.stringify(state));
        if (past.length > limit) past.shift();
        future.length = 0;
      }
      state = next;
      save();
      notify({ label, history });
    },

    undo(){
      if (!past.length) return false;
      future.push(JSON.stringify(state));
      state = JSON.parse(past.pop());
      save(); notify({ label: 'undo' });
      return true;
    },
    redo(){
      if (!future.length) return false;
      past.push(JSON.stringify(state));
      state = JSON.parse(future.pop());
      save(); notify({ label: 'redo' });
      return true;
    },
    get canUndo(){ return past.length > 0; },
    get canRedo(){ return future.length > 0; },

    subscribe(fn){ subs.add(fn); return () => subs.delete(fn); }
  };
}

export function loadState(){
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch { return null; }
}

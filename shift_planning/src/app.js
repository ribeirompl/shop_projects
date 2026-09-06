/* ==========================================================================
   app.js — the shell: week arrows, tabs, undo/redo, the roster file,
   import/export, the two print buttons.

   Each planning mode is a view module:

     export default {
       id, label, hint,
       wide?: true,                         // hide the side panel
       mount(root, ctx){                    // build DOM into root once
         return { render(state, meta){}, unmount(){} };
       }
     }
     export const css = `…`;              // injected once at startup

   ctx = { store }. Views read store.state and write through
   store.update(fn). Every view's render() runs after every update, so a
   view never has to know who changed what.

   The roster lives in a file on disk (see filesync.js). On the first
   visit, before anything else, the page asks which file — opening the
   one the shop already has is the normal case; the other choice saves
   what is on screen into a new file. Nothing here ever empties a roster:
   starting over is Setup and "Clear every shift", both undoable.
   ========================================================================== */

import { h, clear, fill } from './dom.js';
import { createStore, loadState, freshState, migrate, serialize, weekLabel, fromISO,
         gotoWeek, previousWeek, nextWeek, copyWeekFrom, clearWeek, thisMonday, fmtDay } from './model.js';
import { showMenu } from './menu.js';
import { rosterPages } from './print.js';
import { mountSide } from './side.js';
import * as files from './filesync.js';
import { css as tableCss } from './weektable.js';

import * as grid     from './views/grid.js';
import * as rotation from './views/rotation.js';
import * as avail    from './views/availability.js';
import * as staff    from './views/staff.js';

const MODULES = [grid, rotation, avail, staff];
const VIEWS   = MODULES.map(m => m.default);

const store = createStore(loadState() || freshState());
const ctx   = { store };

/* ---- view CSS -------------------------------------------------------- */
document.head.append(h('style', tableCss));
for (const m of MODULES) if (m.css) document.head.append(h('style', m.css));

/* ---- tabs ------------------------------------------------------------ */
const $ = id => document.getElementById(id);
const viewRoot = $('view'), tabs = $('tabs'), main = $('main');
let active = null;

function showView(id){
  const v = VIEWS.find(x => x.id === id) || VIEWS[0];
  if (active){ active.unmount && active.unmount(); clear(viewRoot); }
  main.classList.toggle('wide-view', !!v.wide);
  active = v.mount(viewRoot, ctx);
  active.render(store.state, { label: 'mount' });
  for (const b of tabs.children) b.classList.toggle('active', b.dataset.id === v.id);
  if (store.state.ui.view !== v.id) store.update(s => { s.ui.view = v.id; }, { history: false });
}

for (const v of VIEWS){
  tabs.append(h('button', { dataset: { id: v.id }, title: v.hint || '', onclick: () => showView(v.id) }, v.label));
}

/* ---- week arrows ----------------------------------------------------- */
const weekBtn = $('week-label');
const setWeek = iso => store.update(s => gotoWeek(s, iso), { label: 'week' });
$('week-prev').addEventListener('click', () => setWeek(previousWeek(store.state)));
$('week-next-arrow').addEventListener('click', () => setWeek(nextWeek(store.state)));
$('week-next').addEventListener('click', () => setWeek(nextWeek({ weekStart: thisMonday() })));
weekBtn.addEventListener('click', () => setWeek(thisMonday()));

/* ---- undo / redo ----------------------------------------------------- */
$('undo').addEventListener('click', () => store.undo());
$('redo').addEventListener('click', () => store.redo());

document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const t = e.target;
  const editing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && t.type !== 'date' && t.value !== '';
  if (e.key.toLowerCase() === 'z' && !e.shiftKey && !editing){ e.preventDefault(); store.undo(); }
  else if ((e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) && !editing){ e.preventDefault(); store.redo(); }
  else if (e.key.toLowerCase() === 'p'){ e.preventDefault(); doPrint('byday'); }
});

/* ---- the roster file ------------------------------------------------- */
const status = $('file-status'), banner = $('banner'), modal = $('modal');
let handle = null, saver = null;

function setStatus(text, title){ status.textContent = text; status.title = title || text; }

function connect(fh){
  handle = fh;
  saver = files.autosaver(handle, () => serialize(store.state), r =>
    setStatus(r.ok ? `saved · ${handle.name}` : `not saved — ${r.error}`, r.ok ? `${handle.name} written ${r.at.toLocaleTimeString()}` : r.error));
  setStatus('linked · ' + handle.name);
  banner.hidden = true;
}

/* Read the file into the app. `always` takes the file whatever its age
   (the user just chose it); otherwise it wins only when it is newer than
   what the browser kept, which is the case whenever another PC wrote it.
   An empty file is written out so it catches up. */
async function loadFromFile({ always = false } = {}){
  try {
    const txt = await files.readFile(handle);
    const loaded = txt.trim() ? migrate(JSON.parse(txt)) : null;
    if (loaded && (always || (loaded.savedAt || 0) > (store.state.savedAt || 0))) store.replace(loaded, { history: false, label: 'file' });
    else saver.touch();
  } catch (err) {
    setStatus('not saved — ' + err.message);
  }
}

async function openSavedFile(){
  try { connect(await files.openFile()); await loadFromFile({ always: true }); return true; }
  catch (err) { if (err.name !== 'AbortError') alert('Could not open that file: ' + err.message); return false; }
}

/* Save-as: the roster on screen is written into a file the user picks,
   and every later change follows it there. Any file linked before is left
   on disk as it was. */
async function saveToNewFile(){
  try {
    connect(await files.saveAsFile());
    await saver.flush();
    return true;
  } catch (err) { if (err.name !== 'AbortError') alert('Could not save to that file: ' + err.message); return false; }
}

async function unlinkFile(){
  await files.forget();
  handle = null; saver = null;
  banner.hidden = true;
  setStatus('in this browser only', 'The roster is kept in this browser. Link a file to keep it on disk.');
}

async function reconnect(){
  if (!(await files.askPermission(handle))) return;
  connect(handle);
  await loadFromFile();
}

/* First visit: ask for the file before anything else. */
function askForFile(){
  fill(modal, h('div.box', {},
    h('h2', 'Where is the roster?'),
    h('p', 'The roster is kept in a file on disk, so it survives this browser and can sit in a folder that is backed up. Open the file the shop already has, or save the roster shown behind this box into a new one.'),
    h('div.choices', {},
      h('button.primary', { onclick: async () => { if (await openSavedFile()) modal.hidden = true; } }, 'Open the saved roster file…'),
      h('button.quiet', { onclick: async () => { if (await saveToNewFile()) modal.hidden = true; } }, 'Save this roster to a new file…'),
      h('button.quiet', { onclick: () => { modal.hidden = true; } }, 'Not now — keep it in this browser only'))));
  modal.hidden = false;
}

async function initFile(){
  if (!files.supported){ setStatus('in this browser only', 'This browser cannot write files; use Export to keep a copy.'); return; }
  const stored = await files.storedHandle();
  if (!stored){ setStatus('in this browser only', 'Link a roster file from the ⋯ menu to keep it on disk.'); askForFile(); return; }
  handle = stored;
  if (await files.hasPermission(handle)){ connect(handle); await loadFromFile(); return; }
  setStatus('file needs permission', handle.name);
  fill(banner,
    `The roster file ${handle.name} is linked, but the browser wants a click before it may be read or written. `,
    h('button.small.primary', { onclick: reconnect }, 'Reconnect ' + handle.name),
    ' ', h('button.small', { onclick: unlinkFile }, 'Unlink'));
  banner.hidden = false;
}

/* ---- more menu -------------------------------------------------------- */
function download(name, text){
  const a = h('a', { href: 'data:application/json;charset=utf-8,' + encodeURIComponent(text), download: name });
  document.body.append(a); a.click(); a.remove();
}
function importFile(){
  const inp = h('input', { type: 'file', accept: '.json,application/json' });
  inp.addEventListener('change', () => {
    const f = inp.files[0]; if (!f) return;
    f.text().then(txt => {
      const next = migrate(JSON.parse(txt));
      if (!next) { alert('That file is not a shift-planner roster.'); return; }
      store.replace(next);
    }).catch(err => alert('Could not read that file: ' + err.message));
  });
  inp.click();
}
$('more').addEventListener('click', e => {
  const r = e.currentTarget.getBoundingClientRect();
  const s = store.state, prev = previousWeek(s);
  showMenu(r.right - 280, r.bottom + 4, [
    { label: 'Copy the previous week into this one', onclick: () => {
      if (!s.weeks[prev]){ alert('There is nothing saved for the week of ' + fmtDay(fromISO(prev)) + '.'); return; }
      if (Object.keys(s.cells).length && !confirm('Replace this week\'s shifts with last week\'s?')) return;
      store.update(x => copyWeekFrom(x, prev), { label: 'copy-week' });
    } },
    { label: 'Clear every shift this week', onclick: () => confirm('Clear all shifts for this week? (Undo can bring them back.)') && store.update(clearWeek, { label: 'clear' }) },
    'sep',
    ...(files.supported ? [
      { label: 'Open a saved roster file…', onclick: openSavedFile },
      { label: 'Save this roster to a new file…', onclick: saveToNewFile },
      ...(handle ? [{ label: 'Unlink the roster file (' + handle.name + ')', onclick: unlinkFile }] : [])
    ] : [{ label: 'Autosave to a file needs Chrome or Edge' }]),
    'sep',
    { label: 'Export a copy (.json)', onclick: () => download('roster-' + s.weekStart + '.json', serialize(s)) },
    { label: 'Import a copy (.json)…', onclick: importFile },
    'sep',
    { label: 'Load the sample roster', onclick: () => confirm('Replace everything with the sample roster from the old spreadsheet?') && store.replace(freshState()) }
  ]);
});

/* ---- print ----------------------------------------------------------- */
const printRoot = $('print-root');
let printStyle = 'byday';
function buildPrint(){
  clear(printRoot);
  printRoot.innerHTML = rosterPages(store.state, printStyle).join('\n');
}
function doPrint(style){ printStyle = style; buildPrint(); window.print(); }
$('print-day').addEventListener('click', () => doPrint('byday'));
$('print-staff').addEventListener('click', () => doPrint('bystaff'));
window.addEventListener('beforeprint', buildPrint);
window.addEventListener('afterprint', () => clear(printRoot));

/* ---- side panel ------------------------------------------------------ */
const side = mountSide($('side'), ctx);

/* ---- render loop ----------------------------------------------------- */
function renderShell(state){
  const now = state.weekStart === thisMonday();
  weekBtn.textContent = weekLabel(state) + (now ? ' · this week' : state.weekStart === nextWeek({ weekStart: thisMonday() }) ? ' · next week' : '');
  $('undo').disabled = !store.canUndo;
  $('redo').disabled = !store.canRedo;
}

store.subscribe((state, meta) => {
  renderShell(state);
  active && active.render(state, meta);
  side.render(state, meta);
  if (saver && meta.label !== 'file') saver.touch();
});

renderShell(store.state);
side.render(store.state, { label: 'mount' });
/* #view=rotation opens a tab directly — handy for a screenshot or a bookmark */
const hashView = (location.hash.match(/view=(\w+)/) || [])[1];
showView(hashView || store.state.ui.view);
initFile();

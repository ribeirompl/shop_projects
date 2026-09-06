/* ==========================================================================
   filesync.js — keep the roster in a real file on disk.

   The browser cannot write to disk on its own; the File System Access API
   (Chrome and Edge) lets the user pick a file once and then lets the page
   keep writing to it. The handle is remembered in IndexedDB, so the next
   time the tool opens it can ask for that same file — the browser insists
   on one click of permission per visit, which is what the banner is for.

   Point the file at a folder that already syncs (the shop's Google Drive,
   OneDrive) and the roster is backed up without anyone thinking about it.
   Browsers without the API still have Export / Import.
   ========================================================================== */

export const supported = typeof window !== 'undefined' && 'showSaveFilePicker' in window && 'indexedDB' in window;

const DB = 'shift-planner', STORE = 'handles', KEY = 'roster';
const TYPES = [{ description: 'Shift roster', accept: { 'application/json': ['.json'] } }];

function db(){
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function idb(mode, fn){
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE, mode);
    const r = fn(tx.objectStore(STORE));
    tx.oncomplete = () => res(r && r.result);
    tx.onerror = () => rej(tx.error);
  });
}

export const storedHandle = () => supported ? idb('readonly', s => s.get(KEY)).catch(() => null) : Promise.resolve(null);
const remember = handle => idb('readwrite', s => s.put(handle, KEY));
export const forget = () => supported ? idb('readwrite', s => s.delete(KEY)).catch(() => {}) : Promise.resolve();

/* Pick a new file to keep the roster in. The caller writes the roster it
   already has into it — nothing is emptied here. */
export async function saveAsFile(){
  const handle = await window.showSaveFilePicker({ suggestedName: 'shift-roster.json', types: TYPES });
  await remember(handle);
  return handle;
}

export async function openFile(){
  const [handle] = await window.showOpenFilePicker({ types: TYPES, multiple: false });
  await remember(handle);
  return handle;
}

export const hasPermission = async handle => (await handle.queryPermission({ mode: 'readwrite' })) === 'granted';
export const askPermission = async handle => (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';

export async function readFile(handle){
  const f = await handle.getFile();
  return f.text();
}

export async function writeFile(handle, text){
  const w = await handle.createWritable();
  await w.write(text);
  await w.close();
}

/* A writer that coalesces bursts of updates into one write. */
export function autosaver(handle, serialize, onStatus){
  let timer = null, pending = false, writing = false;
  async function flush(){
    timer = null;
    if (writing){ pending = true; return; }
    writing = true;
    try { await writeFile(handle, serialize()); onStatus({ ok: true, at: new Date() }); }
    catch (err) { onStatus({ ok: false, error: err.message }); }
    writing = false;
    if (pending){ pending = false; flush(); }
  }
  return {
    touch(){ clearTimeout(timer); timer = setTimeout(flush, 600); },
    flush
  };
}

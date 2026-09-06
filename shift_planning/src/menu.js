/* ==========================================================================
   menu.js — one popup menu for the whole app, and the colour picker built
   on it. Views call showMenu(x, y, items) with items like
     { label, onclick, swatch:'#hex', checked:true }  or  'sep'
   ========================================================================== */

import { h, clear } from './dom.js';

let root;
const el = () => root || (root = document.getElementById('menu'));

export function hideMenu(){
  const m = el(); if (!m) return;
  m.hidden = true; clear(m);
}

export function showMenu(x, y, items){
  const m = el();
  clear(m);
  for (const it of items){
    if (it === 'sep'){ m.append(h('hr')); continue; }
    m.append(h('button', { type: 'button', onclick: () => { hideMenu(); it.onclick && it.onclick(); } },
      it.swatch ? h('span.swatch', { style: { background: it.swatch } }) : null,
      it.label,
      it.checked ? h('span.spacer') : null,
      it.checked ? '✓' : null));
  }
  m.hidden = false;
  /* keep it on screen */
  const w = m.offsetWidth, hgt = m.offsetHeight;
  m.style.left = Math.min(x, window.innerWidth  - w - 8) + 'px';
  m.style.top  = Math.min(y, window.innerHeight - hgt - 8) + 'px';
}

/* The legend as a menu. onPick(tagId|null). */
export function showTagMenu(state, x, y, current, onPick, extra = []){
  showMenu(x, y, [
    { label: 'No colour', swatch: '#fff', checked: !current, onclick: () => onPick(null) },
    ...state.tags.map(t => ({ label: t.label, swatch: t.color, checked: current === t.id, onclick: () => onPick(t.id) })),
    ...(extra.length ? ['sep', ...extra] : [])
  ]);
}

document.addEventListener('pointerdown', e => { if (root && !root.hidden && !root.contains(e.target)) hideMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideMenu(); });
window.addEventListener('blur', hideMenu);

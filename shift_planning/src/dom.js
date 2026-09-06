/* ==========================================================================
   dom.js — the one element builder every view uses.

     h('div.row.active', { onclick, title, dataset:{id} }, 'text', childEl, [more])

   Class shorthand in the tag; `on*` props become listeners; `style` may be
   an object; `dataset` sets data-* attributes; `html` sets innerHTML;
   everything else is setAttribute. Falsy children are skipped.
   ========================================================================== */

export function h(tag, attrs, ...children){
  if (attrs && (attrs instanceof Node || typeof attrs !== 'object' || Array.isArray(attrs))){
    children.unshift(attrs); attrs = null;
  }
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs || {})){
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k in el && typeof el[k] !== 'object' && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

export function append(el, children){
  for (const c of children){
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function clear(el){ while (el.firstChild) el.removeChild(el.firstChild); return el; }

/* Empty an element and refill it through append() above. Never write
   clear(el).append(list): that is the native append, which turns an array
   into "[object HTMLElement],…" and null into the word "null". */
export function fill(el, ...children){ return append(clear(el), children); }

/* SVG elements need the namespace; same call shape as h(). */
export function svg(tag, attrs, ...children){
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs || {})){
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Formatting for engine text and the shared term tooltip.
// Engine strings link a phrase to TIPS with a {{label|id}} token. fmt() is the only way engine
// text becomes HTML: it escapes first, then turns tokens into tooltip buttons. Nothing here
// touches the DOM at import time, so node tests can import it.
import { TIPS } from '../engine/explain.js';

const TOKEN = /\{\{([^|{}]+)\|([^|{}]+)\}\}/g;

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** HTML for body text: escaped, with known tokens as tooltip buttons and unknown ones as their label. */
export const fmt = (s) => esc(s).replace(TOKEN, (_, label, id) =>
  (Object.hasOwn(TIPS, id) ? `<button type="button" class="tip" data-tip="${id}">${label}</button>` : label));

/** Plain text with tokens reduced to their labels (not escaped): for headings, textContent and attributes. */
export const plain = (s) => String(s).replace(TOKEN, '$1');

// ---------- tooltip popup ----------
// One shared popup and listeners delegated to document, so terms keep working when the UI
// replaces innerHTML. Mouse hover opens after a short delay; a click or tap pins it open
// until an outside click, Escape, or the next render.
let pop = null, anchor = null, mode = null, openTimer = 0, closeTimer = 0, refocusing = false;

const inside = (el, root) => !!(root && el instanceof Node && root.contains(el));
const tipOf = (el) => (el instanceof Element ? el.closest('.tip') : null);

function show(id) {
  pop.innerHTML = TIPS[id].split('\n\n').map((p) => `<p>${fmt(p)}</p>`).join('');
  place();
}

function open(el, how) {
  const id = el.dataset.tip;
  if (!Object.hasOwn(TIPS, id)) return;
  clearTimeout(openTimer); clearTimeout(closeTimer);
  if (anchor && anchor !== el) anchor.removeAttribute('aria-describedby');
  anchor = el; mode = how;
  el.setAttribute('aria-describedby', 'tip');
  pop.hidden = false;
  show(id);
}

export function closeTip() {
  clearTimeout(openTimer); clearTimeout(closeTimer);
  if (!pop || !anchor) return;
  anchor.removeAttribute('aria-describedby');
  anchor = null; mode = null;
  pop.hidden = true;
}

function place() {
  if (!anchor) return;
  if (!anchor.isConnected) { closeTip(); return; }
  // Measure at the origin: a fixed box left at its old position shrinks to fit the space beside it.
  pop.style.left = '0px'; pop.style.top = '0px';
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight; // excludes scrollbars
  const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight, gap = 6, m = 8;
  let top = r.bottom + gap;
  if (top + h > vh - m && r.top - gap - h >= m) top = r.top - gap - h;
  top = Math.max(m, Math.min(top, vh - h - m)); // fits neither above nor below: keep it on screen
  pop.style.top = `${top}px`;
  pop.style.left = `${Math.max(m, Math.min(r.left, vw - w - m))}px`;
}

export function initTips() {
  if (pop) return;
  pop = document.createElement('div');
  pop.id = 'tip'; pop.className = 'tip-pop'; pop.setAttribute('role', 'tooltip'); pop.hidden = true;
  document.body.append(pop);

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (inside(e.target, pop)) { clearTimeout(closeTimer); return; }
    const t = tipOf(e.target);
    if (!t) return;
    clearTimeout(closeTimer);
    if (t !== anchor) { clearTimeout(openTimer); openTimer = setTimeout(() => open(t, 'hover'), 150); }
  });
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType !== 'mouse') return;
    const from = tipOf(e.target);
    if (from && from !== anchor && !inside(from, pop)) clearTimeout(openTimer);
    if (!anchor || mode !== 'hover') return;
    if (!(inside(e.target, anchor) || inside(e.target, pop))) return;
    if (inside(e.relatedTarget, anchor) || inside(e.relatedTarget, pop)) return;
    closeTimer = setTimeout(closeTip, 100);
  });
  document.addEventListener('click', (e) => {
    const t = tipOf(e.target);
    if (t && inside(t, pop)) { if (Object.hasOwn(TIPS, t.dataset.tip)) show(t.dataset.tip); return; }
    if (t) {
      if (t === anchor && mode === 'hover') mode = 'pinned';
      else if (t === anchor) closeTip();
      else open(t, 'pinned');
      return;
    }
    if (anchor && !inside(e.target, pop)) closeTip();
  });
  document.addEventListener('focusin', (e) => {
    const t = tipOf(e.target);
    if (t && !refocusing && !inside(t, pop) && t !== anchor && t.matches(':focus-visible')) open(t, 'focus');
  });
  document.addEventListener('focusout', (e) => {
    if (mode !== 'focus') return;
    if (inside(e.relatedTarget, anchor) || inside(e.relatedTarget, pop)) return;
    closeTip();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !anchor) return;
    const a = anchor;
    closeTip();
    refocusing = true; a.focus(); refocusing = false; // returning focus must not reopen it
  });
  addEventListener('scroll', place, true);
  addEventListener('resize', place);
}

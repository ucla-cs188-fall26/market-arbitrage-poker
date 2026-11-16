// "Set up your own hand" dialog: board, stacks, ranges (text + paintable grid), bet sizes, your hand.
import { parseRange, formatRange, CLASS_LABELS } from '../engine/range.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const BLANK = {
  board: '', pot: 20, stack: 80,
  ranges: ['', ''],
  betSizes: ['33, 75', '33, 75'],
  raiseSizes: '75', allIn: true, maxRaises: 2,
};

export function openEditor({ config, hero, onSolve }) {
  const dlg = document.getElementById('editor');
  const form = document.getElementById('editor-form');
  const c = structuredClone(config || BLANK);
  const h = { ...(hero || { player: 0, hand: '' }) };
  const paintW = [1, 1];

  form.innerHTML = `
    <div class="foot-row"><h2>Set up your own hand</h2><button type="button" class="btn" data-close>Close</button></div>
    <p class="hint" style="margin:-8px 0 0">Enter the river as it happened. Ranges are the hands each player could have at this point; edit the text or paint the grid.</p>
    <div class="row">
      <label>Board (5 cards)<input type="text" name="board" value="${esc(c.board)}" placeholder="Ks 8s 4d 5c 2h" autocomplete="off"></label>
      <label>Pot at the river<input type="number" name="pot" min="1" step="0.5" value="${esc(c.pot)}"></label>
      <label>Effective stack behind<input type="number" name="stack" min="1" step="0.5" value="${esc(c.stack)}"></label>
      <label>Your seat<select name="heroPlayer"><option value="0" ${h.player === 0 ? 'selected' : ''}>OOP (acts first)</option><option value="1" ${h.player === 1 ? 'selected' : ''}>IP (acts last)</option></select></label>
      <label>Your hand<input type="text" name="heroHand" value="${esc(h.hand)}" placeholder="Kh Jd" autocomplete="off"></label>
    </div>
    <div class="ranges">
      ${[0, 1].map((p) => `
      <div class="range-box">
        <label>${p === 0 ? 'OOP' : 'IP'} range<textarea name="range${p}" spellcheck="false">${esc(c.ranges[p])}</textarea></label>
        <div class="paint" data-p="${p}">Paint:
          <button type="button" data-w="1" class="on">100%</button><button type="button" data-w="0.5">50%</button>
          <button type="button" data-w="0.25">25%</button><button type="button" data-w="0">Erase</button>
          <button type="button" data-clear>Clear all</button>
        </div>
        <div class="mini-grid" data-p="${p}"></div>
      </div>`).join('')}
    </div>
    <div class="row">
      <label>OOP bet sizes (% pot)<input type="text" name="bet0" value="${esc(c.betSizes[0])}"></label>
      <label>IP bet sizes (% pot)<input type="text" name="bet1" value="${esc(c.betSizes[1])}"></label>
      <label>Raise sizes (% pot)<input type="text" name="raise" value="${esc(c.raiseSizes)}"></label>
      <label>Raises allowed<select name="maxRaises">${[0, 1, 2, 3].map((k) => `<option ${Number(c.maxRaises) === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label style="align-content:end"><span><input type="checkbox" name="allIn" ${c.allIn ? 'checked' : ''}> Allow all-in</span></label>
    </div>
    <div class="err" id="editor-err" role="alert"></div>
    <div class="foot-row">
      <span class="hint">Notation: AA, TT+, 22-55, AKs, ATo+, K9s-K6s, AhKh, QJo:0.5 (weight). More sizes = slower solve.</span>
      <button type="submit" class="btn primary">Solve this spot</button>
    </div>`;

  const mini = [0, 1].map((p) => form.querySelector(`.mini-grid[data-p="${p}"]`));
  const area = [0, 1].map((p) => form.querySelector(`textarea[name=range${p}]`));
  const weights = [0, 1].map((p) => { try { return parseRange(area[p].value).classes; } catch { return new Float64Array(169); } });

  // Cells are built once and restyled in place: replacing the button under the pointer
  // mid-press makes the browser drop the pointerup, leaving the grid stuck in paint mode.
  [0, 1].forEach((p) => {
    mini[p].innerHTML = CLASS_LABELS.map((l, i) => `<button type="button" data-i="${i}">${l}</button>`).join('');
  });
  function paintGrid(p) {
    mini[p].querySelectorAll('button').forEach((b, i) => {
      const w = weights[p][i];
      b.style.background = w > 0 ? `linear-gradient(to top, #4fa477 ${w * 100}%, #eef1ec ${w * 100}%)` : '';
      b.title = `${CLASS_LABELS[i]} ${Math.round(w * 100)}%`;
    });
  }
  [0, 1].forEach((p) => {
    paintGrid(p);
    let down = false;
    const apply = (t) => {
      const i = t?.dataset?.i;
      if (i == null) return;
      weights[p][i] = paintW[p];
      // keep specific combos typed in text (e.g. AhKh) by appending them
      const combosOnly = area[p].value.split(/[\s,]+/).filter((tok) => /^[2-9TJQKA][cdhs][2-9TJQKA][cdhs](:.*)?$/i.test(tok));
      area[p].value = [formatRange(weights[p]), ...combosOnly].filter(Boolean).join(', ');
      paintGrid(p);
    };
    mini[p].addEventListener('pointerdown', (e) => { down = true; apply(e.target); });
    // Also require the primary button to still be held, so a missed release can't strand paint mode.
    mini[p].addEventListener('pointerover', (e) => { if (down && (e.buttons & 1)) apply(e.target); else down = false; });
    const stop = () => { down = false; };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    area[p].addEventListener('input', () => {
      try { weights[p].set(parseRange(area[p].value).classes); paintGrid(p); form.querySelector('#editor-err').textContent = ''; } catch (e) { form.querySelector('#editor-err').textContent = `${p === 0 ? 'OOP' : 'IP'} range: ${e.message}`; }
    });
    form.querySelector(`.paint[data-p="${p}"]`).addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-clear')) { weights[p].fill(0); area[p].value = ''; paintGrid(p); return; }
      paintW[p] = Number(b.dataset.w);
      b.parentElement.querySelectorAll('button[data-w]').forEach((x) => x.classList.toggle('on', x === b));
    });
  });

  form.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const cfg = {
      board: fd.get('board'),
      pot: Number(fd.get('pot')),
      stack: Number(fd.get('stack')),
      ranges: [fd.get('range0'), fd.get('range1')],
      betSizes: [fd.get('bet0'), fd.get('bet1')],
      raiseSizes: fd.get('raise'),
      allIn: fd.get('allIn') === 'on',
      maxRaises: Number(fd.get('maxRaises')),
    };
    const heroIn = { player: Number(fd.get('heroPlayer')), hand: fd.get('heroHand') };
    dlg.close();
    const res = await onSolve(cfg, heroIn);
    if (res?.error) {
      openEditor({ config: cfg, hero: heroIn, onSolve });
      document.getElementById('editor-err').textContent = res.error;
    }
  };
  dlg.showModal();
}

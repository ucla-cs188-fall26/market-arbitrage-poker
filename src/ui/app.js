import { Spot } from '../engine/spot.js';
import { Solver } from '../engine/solver.js';
import { explainHand, nodeSummary, GLOSSARY, PLAYER_NAMES, strategyOf } from '../engine/explain.js';
import { CLASS_LABELS, classIndexOfCombo } from '../engine/range.js';
import { normalizeCombo, parseCard, rankOf, suitOf, RANKS, SUITS, SUIT_SYMBOLS } from '../engine/cards.js';
import { PRESETS } from '../presets.js';
import { openEditor } from './editor.js';

const TARGET_EXPLOITABILITY = 0.05; // % of pot
const MAX_ITERS = 4000;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x, d = 0) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '–');
const chips = (x) => (Number.isFinite(x) ? (Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2)) : '–');

const state = {
  preset: null,
  config: null,
  hero: null,     // { player, hand }
  title: '', blurb: '',
  spot: null,
  path: [],
  selClass: null,
  selIndex: null,
  openTerms: new Set(),
  beginner: true,
};

// ---------- cards ----------
export function cardHTML(str, size = '') {
  const c = parseCard(str);
  const r = RANKS[rankOf(c)], s = SUITS[suitOf(c)];
  const red = s === 'h' || s === 'd';
  return `<span class="card ${size} ${red ? 'red' : ''}" aria-label="${r}${s}">${r === 'T' ? '10' : r}<span class="s">${SUIT_SYMBOLS[s]}</span></span>`;
}
const comboCards = (key, size = 'sm') => cardHTML(key.slice(0, 2), size) + cardHTML(key.slice(2, 4), size);

// ---------- action colours ----------
function actionColors(node) {
  const ramp = ['var(--a-bet1)', 'var(--a-bet2)', 'var(--a-bet3)'];
  let k = 0;
  return node.actions.map((a) => {
    if (a.kind === 'fold') return 'var(--a-fold)';
    if (a.kind === 'check' || a.kind === 'call') return 'var(--a-check)';
    if (a.kind === 'allin') return 'var(--a-allin)';
    return ramp[Math.min(k++, ramp.length - 1)];
  });
}
const mixBar = (freqs, colors) => freqs.map((f, a) => (f > 0.001 ? `<i style="width:${(f * 100).toFixed(2)}%;background:${colors[a]}"></i>` : '')).join('');

// ---------- solving ----------
async function solve(config, hero, meta = {}) {
  let spot;
  try {
    spot = new Spot(config);
  } catch (e) {
    return { error: e.message };
  }
  let heroKey;
  try { heroKey = normalizeCombo(hero.hand); } catch (e) { return { error: `Your hand: ${e.message}` }; }
  if (!spot.keyIndex[hero.player].has(heroKey)) {
    const clash = [heroKey.slice(0, 2), heroKey.slice(2)].some((c) => spot.board.includes(parseCard(c)));
    return { error: clash ? `Your hand ${heroKey} uses a card that is on the board.` : `Your hand ${heroKey} is not in the ${PLAYER_NAMES[hero.player]} range. Add it to the range (for example "${heroKey}") or change the hand.` };
  }
  const solver = new Solver(spot);
  const overlay = $('solving');
  overlay.hidden = false;
  $('solving-text').textContent = `Solving ${spot.n[0]} vs ${spot.n[1]} hand combos…`;
  let expl = Infinity;
  const t0 = performance.now();
  while (solver.iter < MAX_ITERS) {
    solver.run(25);
    if (solver.iter % 50 === 0) {
      expl = solver.exploitability();
      const progress = Math.min(1, Math.log(Math.max(expl, TARGET_EXPLOITABILITY) / 50) / Math.log(TARGET_EXPLOITABILITY / 50));
      $('solving-bar').style.width = `${Math.max(5, progress * 100)}%`;
      $('solving-sub').textContent = `${solver.iter} iterations · ${expl.toFixed(2)}% of pot from perfect play`;
      await new Promise((r) => setTimeout(r, 0));
      if (expl <= TARGET_EXPLOITABILITY) break;
    }
  }
  const summary = solver.analyze();
  summary.ms = performance.now() - t0;
  spot.summary = summary;
  overlay.hidden = true;

  state.spot = spot;
  state.config = config;
  state.hero = { player: hero.player, hand: heroKey };
  state.title = meta.title || 'Your hand';
  state.blurb = meta.blurb || '';
  state.path = [spot.tree.root];
  for (const label of meta.line || []) {
    const cur = state.path[state.path.length - 1];
    const k = cur.actions?.findIndex((a) => a.label === label);
    if (k == null || k < 0) break;
    state.path.push(cur.children[k]);
  }
  onNodeChange();
  return { ok: true };
}

const current = () => state.path[state.path.length - 1];
const heroIndex = () => state.spot.keyIndex[state.hero.player].get(state.hero.hand);

function onNodeChange() {
  const node = current();
  state.selClass = null;
  state.selIndex = null;
  if (node.type === 'action' && node.player === state.hero.player) {
    const i = heroIndex();
    state.selIndex = i;
    const h = state.spot.hands[node.player][i];
    state.selClass = classIndexOfCombo(h.c1, h.c2);
  }
  render();
}

// ---------- rendering ----------
function render() {
  renderFelt();
  renderActionBar();
  renderGrid();
  renderCombos();
  renderSummary();
  renderExplain();
  renderFoot();
}

function renderFelt() {
  const spot = state.spot, node = current();
  const P = spot.pot + node.contrib[0] + node.contrib[1];
  const crumbs = state.path.map((n, k) => {
    if (k === 0) return `<button class="crumb ${state.path.length === 1 ? 'current' : ''}" data-depth="0">River starts</button>`;
    const prev = state.path[k - 1];
    const label = `${PLAYER_NAMES[prev.player]} ${n.path[n.path.length - 1].toLowerCase()}`;
    return `<span class="crumb-sep">›</span><button class="crumb ${k === state.path.length - 1 ? 'current' : ''}" data-depth="${k}">${esc(label)}</button>`;
  }).join('');
  $('felt').innerHTML = `
    <div class="board">${spot.boardStr.split(' ').map((c) => cardHTML(c)).join('')}</div>
    <div>
      <div class="spot-title">${esc(state.title)}</div>
      ${state.blurb ? `<p class="spot-blurb">${esc(state.blurb)}</p>` : ''}
      <div class="line">${crumbs}</div>
    </div>
    <div class="chips">
      <div>Pot <b>${chips(P)}</b></div>
      <div>Behind <b>${chips(spot.stack - Math.max(...node.contrib))}</b></div>
      <div>You (${PLAYER_NAMES[state.hero.player]}) <span style="display:inline-flex;gap:3px;vertical-align:middle">${comboCards(state.hero.hand)}</span></div>
    </div>`;
  $('felt').querySelectorAll('.crumb').forEach((b) => b.addEventListener('click', () => {
    const d = Number(b.dataset.depth);
    if (d === state.path.length - 1) return;
    state.path = state.path.slice(0, d + 1);
    onNodeChange();
  }));
}

function renderActionBar() {
  const spot = state.spot, node = current();
  const el = $('action-bar');
  if (node.type !== 'action') {
    const P = spot.pot + node.contrib[0] + node.contrib[1];
    const msg = node.type === 'fold'
      ? `${PLAYER_NAMES[node.folder]} folds. ${PLAYER_NAMES[1 - node.folder]} wins the ${chips(P)} pot.`
      : `Showdown for a ${chips(P)} pot.`;
    const hi = heroIndex();
    let heroLine = '';
    if (node.type === 'showdown') {
      const opp = 1 - state.hero.player;
      const eq = spot.equities(state.hero.player, node.reach[opp])[hi];
      heroLine = Number.isFinite(eq)
        ? ` Your ${state.hero.hand} wins ${pct(eq)} against the hands ${PLAYER_NAMES[opp]} gets here with.`
        : ` ${PLAYER_NAMES[opp]} never reaches this showdown with the solved strategy.`;
    }
    el.innerHTML = `<div class="who"><h2>Hand over</h2></div><p class="terminal">${esc(msg + heroLine)}</p>
      <button class="btn" id="back">Back one step</button>`;
    $('back').addEventListener('click', () => { state.path.pop(); onNodeChange(); });
    return;
  }
  const p = node.player, np = spot.n[p];
  const ns = nodeSummary(spot, node);
  state.summaryCache = ns;
  const colors = actionColors(node);
  const P = ns.potNow, facing = ns.facing;
  const isHero = p === state.hero.player;
  el.innerHTML = `
    <div class="who">
      <h2>${PLAYER_NAMES[p]} to act <span>· ${isHero ? 'you' : 'opponent'}</span></h2>
      <span class="muted small">${facing > 0 ? `Facing ${chips(facing)} into ${chips(P - facing)}` : `Pot ${chips(P)}`} · tap an action to play it</span>
    </div>
    <div class="actions">
      ${node.actions.map((a, k) => `
        <button class="act" data-a="${k}" title="Play ${esc(a.label)} and see what happens next">
          <span class="lbl"><span class="dot" style="background:${colors[k]}"></span>${esc(a.label)}</span>
          <span class="f">${pct(ns.freq[k])} of range</span>
          <span class="bar"><i style="width:${(ns.freq[k] * 100).toFixed(1)}%;background:${colors[k]}"></i></span>
        </button>`).join('')}
    </div>`;
  el.querySelectorAll('.act').forEach((b) => b.addEventListener('click', () => {
    state.path.push(node.children[Number(b.dataset.a)]);
    onNodeChange();
  }));
  $('legend').innerHTML = node.actions.map((a, k) => `<span><i style="background:${colors[k]}"></i>${esc(a.label)}</span>`).join('');
  void np;
}

function classGroups(p) {
  const spot = state.spot;
  spot._groups ??= [null, null];
  if (!spot._groups[p]) {
    const g = Array.from({ length: 169 }, () => []);
    spot.hands[p].forEach((h, i) => g[classIndexOfCombo(h.c1, h.c2)].push(i));
    spot._groups[p] = g;
  }
  return spot._groups[p];
}

function renderGrid() {
  const spot = state.spot, node = current();
  const grid = $('grid');
  if (node.type !== 'action') {
    grid.innerHTML = '';
    $('grid-title').textContent = 'No decision here';
    $('legend').innerHTML = '';
    return;
  }
  const p = node.player, np = spot.n[p], m = node.actions.length;
  const colors = actionColors(node);
  const groups = classGroups(p);
  const reach = node.reach[p];
  const heroCls = p === state.hero.player ? (() => { const h = spot.hands[p][heroIndex()]; return classIndexOfCombo(h.c1, h.c2); })() : -1;
  $('grid-title').textContent = `${PLAYER_NAMES[p]}'s strategy for every hand${p === state.hero.player ? ' (yours is outlined)' : ''}`;
  grid.innerHTML = CLASS_LABELS.map((label, ci) => {
    const idx = groups[ci];
    let w = 0;
    const mix = new Array(m).fill(0);
    for (const i of idx) { w += reach[i]; for (let a = 0; a < m; a++) mix[a] += reach[i] * node.avg[a * np + i]; }
    const full = idx.length; // initial weight 1 per combo on this board
    const share = full ? Math.min(1, w / full) : 0;
    const cls = ['cell'];
    if (w <= 1e-6) cls.push('empty');
    if (ci === state.selClass) cls.push('sel');
    if (ci === heroCls) cls.push('hero');
    const freqs = mix.map((x) => (w > 0 ? x / w : 0));
    const tip = w > 1e-6 ? `${label}: ${node.actions.map((a, k) => `${a.label} ${pct(freqs[k])}`).join(', ')}` : `${label}: not in range here`;
    return `<button class="${cls.join(' ')}" data-c="${ci}" title="${esc(tip)}" ${w <= 1e-6 ? 'tabindex="-1"' : ''}>
      ${w > 1e-6 ? `<span class="fill" style="height:${Math.max(18, share * 100)}%">${mixBar(freqs, colors)}</span>` : ''}
      <span class="t">${label}</span></button>`;
  }).join('');
  grid.querySelectorAll('.cell:not(.empty)').forEach((b) => b.addEventListener('click', () => {
    const ci = Number(b.dataset.c);
    state.selClass = ci;
    const idx = groups[ci].filter((i) => reach[i] > 1e-9);
    const hi = p === state.hero.player ? heroIndex() : -1;
    state.selIndex = idx.includes(hi) ? hi : idx.sort((a, b2) => reach[b2] - reach[a])[0] ?? null;
    renderGrid(); renderCombos(); renderExplain();
  }));
}

function renderCombos() {
  const spot = state.spot, node = current();
  const el = $('combos');
  if (node.type !== 'action' || state.selClass == null) {
    el.innerHTML = node.type === 'action' ? '<p class="muted small">Tap a hand in the grid to see each suit combination and why it is played that way.</p>' : '';
    return;
  }
  const p = node.player, np = spot.n[p];
  const colors = actionColors(node);
  const idx = classGroups(p)[state.selClass];
  const reach = node.reach[p];
  const hi = p === state.hero.player ? heroIndex() : -1;
  el.innerHTML = `
    <div class="head"><h3>${CLASS_LABELS[state.selClass]} combos</h3><span class="muted small">Faded combos never get here</span></div>
    <div class="combo-list">
      ${idx.map((i) => {
        const h = spot.hands[p][i];
        const f = strategyOf(spot, node, i);
        const top = f.indexOf(Math.max(...f));
        const cls = ['combo'];
        if (i === state.selIndex) cls.push('sel');
        if (i === hi) cls.push('hero');
        if (reach[i] <= 1e-9) cls.push('blocked');
        return `<button class="${cls.join(' ')}" data-i="${i}">
          <span class="cards">${comboCards(h.key)}</span>
          <span class="mix">${mixBar(f, colors)}</span>
          <span class="meta">${i === hi ? 'Your hand · ' : ''}${esc(node.actions[top].label)} ${pct(f[top])}</span>
        </button>`;
      }).join('')}
    </div>`;
  el.querySelectorAll('.combo').forEach((b) => b.addEventListener('click', () => {
    state.selIndex = Number(b.dataset.i);
    renderCombos(); renderExplain();
  }));
}

function renderSummary() {
  const spot = state.spot, node = current();
  const el = $('summary');
  if (node.type !== 'action') { el.innerHTML = ''; el.hidden = true; return; }
  el.hidden = false;
  const ns = state.summaryCache ?? nodeSummary(spot, node);
  const colors = actionColors(node);
  const name = PLAYER_NAMES[node.player];
  el.innerHTML = `
    <h2>What ${name} does with each kind of hand</h2>
    <p class="muted small" style="margin:4px 0 0">Hands grouped by equity against ${PLAYER_NAMES[1 - node.player]}'s range at this point. Bar colours match the actions above.</p>
    <div class="buckets">
      ${ns.buckets.map((b) => `
        <div class="bucket" title="${esc(b.name)}: ${pct(b.share)} of range">
          <span>${b.name}</span><span class="share">${pct(b.share)}</span>
          <span class="mix">${b.weight > 0 ? mixBar(b.mix, colors) : ''}</span>
        </div>`).join('')}
    </div>
    <ul>${ns.lines.map((l) => `<li>${esc(l.text)}</li>`).join('')}</ul>`;
}

function termHTML(concept, key) {
  if (!concept || !GLOSSARY[concept]) return '';
  const g = GLOSSARY[concept];
  const open = state.beginner || state.openTerms.has(key);
  return open
    ? `<div class="def"><b>${esc(g.term)}:</b> ${esc(g.text)}</div>`
    : `<button class="term" data-term="${esc(key)}">What is ${esc(g.term.toLowerCase())}?</button>`;
}

function renderExplain() {
  const spot = state.spot, node = current();
  const el = $('explain');
  if (node.type !== 'action') {
    el.innerHTML = `<h2>Hand over</h2><p class="empty-state">Use the path above to step back to any decision.</p>`;
    return;
  }
  const p = node.player;
  if (state.selIndex == null) {
    const opp = 1 - p;
    const hp = state.hero.player;
    let extra = '';
    if (hp === opp) {
      const hi = heroIndex();
      const eq = spot.equities(hp, node.reach[p])[hi];
      extra = `<p>Right now your ${comboCards(state.hero.hand)} has <b>${pct(eq)}</b> equity against the hands ${PLAYER_NAMES[p]} can have.</p>`;
    }
    el.innerHTML = `<h2>${PLAYER_NAMES[p]} is deciding</h2>
      <p class="empty-state">Tap any hand in the grid to see why ${PLAYER_NAMES[p]} plays it that way, or tap an action to continue the hand.</p>${extra}`;
    return;
  }
  const ex = explainHand(spot, node, state.selIndex);
  const colors = actionColors(node);
  const isHero = p === state.hero.player && state.selIndex === heroIndex();
  const best = ex.actions.reduce((b, a, k) => (a.ev > ex.actions[b].ev ? k : b), 0);
  el.innerHTML = `
    <div class="hand-head">
      <div class="cards">${comboCards(ex.hand, '')}</div>
      <div>
        <div class="desc">${esc(ex.description)}</div>
        <div class="sub">${isHero ? 'Your hand' : `${PLAYER_NAMES[p]} holding ${ex.handClass}`} · ${pct(ex.equity)} equity · beats ${pct(ex.percentile)} of own range</div>
      </div>
    </div>
    <div class="verdict">
      <div class="k">${isHero ? (ex.mixed ? 'Best play: mix these two' : 'Best play') : `What ${PLAYER_NAMES[p]} does${ex.mixed ? ' (a mix)' : ''}`}</div>
      <div class="v">${esc(ex.verdict)}</div>
      <div class="mix">${mixBar(ex.actions.map((a) => a.freq), colors)}</div>
    </div>
    <table class="ev">
      <thead><tr><th>Action</th><th class="num">Played</th><th class="num">EV</th><th class="num">vs best</th></tr></thead>
      <tbody>${ex.actions.map((a, k) => `
        <tr class="${k === best ? 'best' : ''}">
          <td><span class="dot" style="background:${colors[k]}"></span>${esc(a.label)}</td>
          <td class="num">${pct(a.freq)}</td>
          <td class="num">${chips(a.ev)}</td>
          <td class="num ${a.lossPct > 0.005 ? 'loss' : ''}">${k === best ? 'best' : a.loss < 0.005 ? 'same' : `−${chips(a.loss)}`}</td>
        </tr>`).join('')}</tbody>
    </table>
    <p class="muted small" style="margin:0">EV is the average number of chips this hand wins from here, counting only money still to go in.</p>
    <h3 style="margin-top:16px">Why</h3>
    <ol class="reasons">
      ${ex.reasons.map((r, k) => `
        <li class="reason ${r.tag === 'verdict' ? 'verdict-r' : r.tag}">
          <span class="rail"></span>
          <div><h4>${esc(r.title)}</h4><p>${esc(r.text)}</p>${termHTML(r.concept, `${node.id}-${k}`)}</div>
        </li>`).join('')}
    </ol>
    <p class="ask">${esc(ex.summaryLine)}${p !== state.hero.player ? ` You are looking at ${PLAYER_NAMES[p]}'s strategy, which shows how your opponent should play.` : ''}</p>`;
  el.querySelectorAll('.term').forEach((b) => b.addEventListener('click', () => {
    state.openTerms.add(b.dataset.term);
    renderExplain();
  }));
}

function renderFoot() {
  const s = state.spot.summary;
  $('foot').innerHTML = `Solved in ${(s.ms / 1000).toFixed(1)}s (${s.iterations} CFR+ iterations). The strategy is within ${s.exploitability.toFixed(2)}% of the pot of perfect play.
    Expected share of the ${chips(state.spot.pot)} pot: OOP ${chips(s.ev[0])}, IP ${chips(s.ev[1])}. Ranges are estimates; change them with “Set up your own hand”.`;
}

// ---------- boot ----------
function initPresets() {
  const sel = $('preset');
  sel.innerHTML = PRESETS.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join('') + '<option value="custom" disabled>Your own hand</option>';
  sel.addEventListener('change', () => loadPreset(sel.value));
}

async function loadPreset(id) {
  const pr = PRESETS.find((p) => p.id === id);
  if (!pr) return;
  state.preset = id;
  $('preset').value = id;
  const res = await solve(structuredClone(pr.config), pr.hero, { title: pr.title, blurb: pr.blurb, line: pr.line });
  if (res.error) alert(res.error);
}

$('beginner').addEventListener('change', (e) => { state.beginner = e.target.checked; if (state.spot) renderExplain(); });
$('edit-spot').addEventListener('click', () => {
  openEditor({
    config: state.config,
    hero: state.hero,
    onSolve: async (config, hero) => {
      const res = await solve(config, hero, { title: 'Your hand', blurb: '' });
      if (res.ok) { $('preset').value = 'custom'; }
      return res;
    },
  });
});

initPresets();
loadPreset(PRESETS[0].id);

// exposed for automated checks
window.__rationale = { state, solve };

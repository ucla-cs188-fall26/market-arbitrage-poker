// Range notation parsing / formatting and expansion into weighted combos.
import { RANKS, parseCard, rankOf, suitOf, comboStr } from './cards.js';

/** Grid layout: row/col 0 = Ace. Upper-right = suited, lower-left = offsuit. */
export function classLabel(row, col) {
  const r1 = 12 - row, r2 = 12 - col;
  if (row === col) return RANKS[r1] + RANKS[r1];
  if (row < col) return RANKS[r1] + RANKS[r2] + 's';
  return RANKS[r2] + RANKS[r1] + 'o';
}

export const CLASS_LABELS = [];
export const CLASS_INDEX = new Map();
for (let row = 0; row < 13; row++) for (let col = 0; col < 13; col++) {
  const l = classLabel(row, col);
  CLASS_INDEX.set(l, CLASS_LABELS.length);
  CLASS_LABELS.push(l);
}

function classIdx(hi, lo, kind) {
  // hi, lo are rank numbers (0..12). kind: 'p' | 's' | 'o'
  const rowHi = 12 - hi, rowLo = 12 - lo;
  if (kind === 'p') return rowHi * 13 + rowHi;
  if (kind === 's') return rowHi * 13 + rowLo;
  return rowLo * 13 + rowHi;
}

function parseWeight(w) {
  if (w == null || w === '') return 1;
  let x = parseFloat(w);
  if (Number.isNaN(x)) throw new Error(`Bad weight "${w}"`);
  if (w.endsWith('%') || x > 1) x /= 100;
  return Math.max(0, Math.min(1, x));
}

/**
 * Parse range notation into { classes: Float64Array(169), combos: Map<comboStr, weight> }.
 * Supports: AA, AKs, AKo, AK, TT+, ATs+, A9o+, KT+, 22-66, A2s-A5s, K9o-K6o, AhKh,
 * optional weight suffix ":0.5" or ":50" / ":50%".
 */
export function parseRange(text) {
  const classes = new Float64Array(169);
  const combos = new Map();
  const tokens = (text || '').split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);
  for (const tok of tokens) {
    const [body, wStr] = tok.split(':');
    const w = parseWeight(wStr);
    const set = (idx) => { classes[idx] = w; };
    // Specific combo: AhKh
    if (/^[2-9TJQKA][cdhs][2-9TJQKA][cdhs]$/i.test(body)) {
      const c1 = parseCard(body.slice(0, 2)), c2 = parseCard(body.slice(2, 4));
      if (c1 === c2) throw new Error(`Bad combo "${body}"`);
      combos.set(comboStr(c1, c2), w);
      continue;
    }
    const m = /^([2-9TJQKA])([2-9TJQKA])([so]?)(\+?)(?:-([2-9TJQKA])([2-9TJQKA])([so]?))?$/i.exec(body);
    if (!m) throw new Error(`Can't read "${tok}"`);
    let r1 = RANKS.indexOf(m[1].toUpperCase()), r2 = RANKS.indexOf(m[2].toUpperCase());
    const suff = m[3].toLowerCase(), plus = m[4] === '+';
    if (r1 < r2) [r1, r2] = [r2, r1];
    const kinds = r1 === r2 ? ['p'] : suff ? [suff] : ['s', 'o'];
    if (r1 === r2 && suff) throw new Error(`Pairs can't be suited/offsuit: "${tok}"`);
    if (m[5]) {
      let e1 = RANKS.indexOf(m[5].toUpperCase()), e2 = RANKS.indexOf(m[6].toUpperCase());
      if (e1 < e2) [e1, e2] = [e2, e1];
      if (r1 === r2) {
        if (e1 !== e2) throw new Error(`Bad pair range "${tok}"`);
        for (let r = Math.min(r1, e1); r <= Math.max(r1, e1); r++) set(classIdx(r, r, 'p'));
      } else {
        if (e1 !== r1) throw new Error(`Range "${tok}" must keep the same top card`);
        for (let k = Math.min(r2, e2); k <= Math.max(r2, e2); k++) for (const kd of kinds) set(classIdx(r1, k, kd));
      }
      continue;
    }
    if (plus) {
      if (r1 === r2) for (let r = r1; r <= 12; r++) set(classIdx(r, r, 'p'));
      else for (let k = r2; k < r1; k++) for (const kd of kinds) set(classIdx(r1, k, kd));
      continue;
    }
    for (const kd of kinds) set(classIdx(r1, r2, kd));
  }
  return { classes, combos };
}

/** All combos of a 169 class index as [c1, c2] pairs. */
export function classCombos(idx) {
  const row = Math.floor(idx / 13), col = idx % 13;
  const out = [];
  if (row === col) {
    const r = 12 - row;
    for (let s1 = 0; s1 < 4; s1++) for (let s2 = s1 + 1; s2 < 4; s2++) out.push([r * 4 + s1, r * 4 + s2]);
  } else if (row < col) {
    const hi = 12 - row, lo = 12 - col;
    for (let s = 0; s < 4; s++) out.push([hi * 4 + s, lo * 4 + s]);
  } else {
    const hi = 12 - col, lo = 12 - row;
    for (let s1 = 0; s1 < 4; s1++) for (let s2 = 0; s2 < 4; s2++) if (s1 !== s2) out.push([hi * 4 + s1, lo * 4 + s2]);
  }
  return out;
}

export function classIndexOfCombo(c1, c2) {
  let hi = rankOf(c1), lo = rankOf(c2);
  if (hi < lo) [hi, lo] = [lo, hi];
  if (hi === lo) return classIdx(hi, hi, 'p');
  return classIdx(hi, lo, suitOf(c1) === suitOf(c2) ? 's' : 'o');
}

/** Expand a parsed range into weighted combos, dropping those that use dead cards. */
export function expandRange(parsed, dead = []) {
  const deadSet = new Set(dead);
  const out = new Map();
  for (let i = 0; i < 169; i++) {
    if (parsed.classes[i] <= 0) continue;
    for (const [a, b] of classCombos(i)) out.set(comboStr(a, b), { c1: Math.max(a, b), c2: Math.min(a, b), w: parsed.classes[i] });
  }
  for (const [key, w] of parsed.combos) {
    const c1 = parseCard(key.slice(0, 2)), c2 = parseCard(key.slice(2, 4));
    out.set(key, { c1, c2, w });
  }
  return [...out.values()].filter((h) => h.w > 0 && !deadSet.has(h.c1) && !deadSet.has(h.c2));
}

/** Compact a 169-class weight array back to notation. */
export function formatRange(classes) {
  const parts = [];
  const wSuffix = (w) => (w >= 0.999 ? '' : `:${Math.round(w * 100) / 100}`);
  // pairs
  let r = 12;
  while (r >= 0) {
    const w = classes[classIdx(r, r, 'p')];
    if (w <= 0) { r--; continue; }
    let e = r;
    while (e - 1 >= 0 && classes[classIdx(e - 1, e - 1, 'p')] === w) e--;
    const top = RANKS[r] + RANKS[r], bot = RANKS[e] + RANKS[e];
    if (r === 12 && e !== r) parts.push(bot + '+' + wSuffix(w));
    else parts.push((e === r ? top : `${top}-${bot}`) + wSuffix(w));
    r = e - 1;
  }
  for (const kind of ['s', 'o']) {
    for (let hi = 12; hi >= 1; hi--) {
      let k = hi - 1;
      while (k >= 0) {
        const w = classes[classIdx(hi, k, kind)];
        if (w <= 0) { k--; continue; }
        let e = k;
        while (e - 1 >= 0 && classes[classIdx(hi, e - 1, kind)] === w) e--;
        const top = RANKS[hi] + RANKS[k] + kind, bot = RANKS[hi] + RANKS[e] + kind;
        if (k === hi - 1 && e !== k) parts.push(bot + '+' + wSuffix(w));
        else parts.push((e === k ? top : `${top}-${bot}`) + wSuffix(w));
        k = e - 1;
      }
    }
  }
  return parts.join(', ');
}

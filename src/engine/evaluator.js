// 5-to-7 card hand evaluator. Returns an integer where bigger = better hand.
import { rankOf, suitOf, RANK_NAMES, RANK_PLURALS } from './cards.js';

export const CATEGORIES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
const B = 13;
const CAT_BASE = B ** 5;

function encode(cat, kickers) {
  let v = 0;
  for (let i = 0; i < 5; i++) v = v * B + (kickers[i] ?? 0);
  return cat * CAT_BASE + v;
}

function straightHigh(mask) {
  for (let hi = 12; hi >= 4; hi--) {
    const m = 0b11111 << (hi - 4);
    if ((mask & m) === m) return hi;
  }
  // wheel A-2-3-4-5
  if ((mask & 0b1000000001111) === 0b1000000001111) return 3;
  return -1;
}

function topBits(mask, n, exclude = []) {
  const out = [];
  for (let r = 12; r >= 0 && out.length < n; r--) if (mask & (1 << r) && !exclude.includes(r)) out.push(r);
  return out;
}

export function evaluate(cards) {
  const counts = new Array(13).fill(0);
  const suitMask = [0, 0, 0, 0];
  const suitCount = [0, 0, 0, 0];
  let mask = 0;
  for (const c of cards) {
    const r = rankOf(c), s = suitOf(c);
    counts[r]++;
    suitMask[s] |= 1 << r;
    suitCount[s]++;
    mask |= 1 << r;
  }
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (suitCount[s] >= 5) flushSuit = s;
  if (flushSuit >= 0) {
    const sh = straightHigh(suitMask[flushSuit]);
    if (sh >= 0) return encode(8, [sh]);
  }
  const quads = [], trips = [], pairs = [];
  for (let r = 12; r >= 0; r--) {
    if (counts[r] === 4) quads.push(r);
    else if (counts[r] === 3) trips.push(r);
    else if (counts[r] === 2) pairs.push(r);
  }
  if (quads.length) return encode(7, [quads[0], topBits(mask, 1, [quads[0]])[0]]);
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const pairRank = Math.max(trips[1] ?? -1, pairs[0] ?? -1);
    return encode(6, [trips[0], pairRank]);
  }
  if (flushSuit >= 0) return encode(5, topBits(suitMask[flushSuit], 5));
  const sh = straightHigh(mask);
  if (sh >= 0) return encode(4, [sh]);
  if (trips.length) return encode(3, [trips[0], ...topBits(mask, 2, [trips[0]])]);
  if (pairs.length >= 2) return encode(2, [pairs[0], pairs[1], topBits(mask, 1, [pairs[0], pairs[1]])[0]]);
  if (pairs.length === 1) return encode(1, [pairs[0], ...topBits(mask, 3, [pairs[0]])]);
  return encode(0, topBits(mask, 5));
}

export function categoryOf(value) {
  return Math.floor(value / CAT_BASE);
}

function kickersOf(value) {
  let v = value % CAT_BASE;
  const k = [];
  for (let i = 0; i < 5; i++) { k.unshift(v % B); v = Math.floor(v / B); }
  return k;
}

/** Human readable description, e.g. "Two pair, kings and nines". */
export function describe(value) {
  const cat = categoryOf(value);
  const k = kickersOf(value);
  switch (cat) {
    case 8: return k[0] === 12 ? 'Royal flush' : `Straight flush, ${RANK_NAMES[k[0]]}-high`;
    case 7: return `Four ${RANK_PLURALS[k[0]]}`;
    case 6: return `Full house, ${RANK_PLURALS[k[0]]} full of ${RANK_PLURALS[k[1]]}`;
    case 5: return `Flush, ${RANK_NAMES[k[0]]}-high`;
    case 4: return `Straight, ${RANK_NAMES[k[0]]}-high`;
    case 3: return `Three ${RANK_PLURALS[k[0]]}`;
    case 2: return `Two pair, ${RANK_PLURALS[k[0]]} and ${RANK_PLURALS[k[1]]}`;
    case 1: return `Pair of ${RANK_PLURALS[k[0]]}`;
    default: return `${RANK_NAMES[k[0]][0].toUpperCase() + RANK_NAMES[k[0]].slice(1)}-high`;
  }
}

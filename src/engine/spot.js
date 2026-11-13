// A river "spot": board, both ranges as weighted combos, plus fast card-removal-aware helpers.
import { parseCards, comboStr, cardStr } from './cards.js';
import { evaluate } from './evaluator.js';
import { parseRange, expandRange } from './range.js';
import { buildTree } from './tree.js';

export function parseSizes(str) {
  return String(str || '')
    .split(/[\s,]+/).filter(Boolean)
    .map((s) => parseFloat(s) / 100)
    .filter((x) => x > 0 && Number.isFinite(x));
}

export class Spot {
  /**
   * config: { board, ranges:[oopText, ipText], pot, stack, betSizes:[oopStr, ipStr], raiseSizes, allIn, maxRaises }
   */
  constructor(config) {
    this.config = config;
    this.board = parseCards(config.board);
    if (this.board.length !== 5) throw new Error('The river solver needs exactly 5 board cards');
    this.pot = Number(config.pot);
    this.stack = Number(config.stack);
    if (!(this.pot > 0)) throw new Error('Pot must be positive');
    if (!(this.stack > 0)) throw new Error('Stack must be positive');

    this.hands = [0, 1].map((p) => {
      const list = expandRange(parseRange(config.ranges[p]), this.board);
      if (!list.length) throw new Error(`${p === 0 ? 'OOP' : 'IP'} range is empty on this board`);
      return list.map((h) => ({ ...h, key: comboStr(h.c1, h.c2), rank: evaluate([h.c1, h.c2, ...this.board]) }));
    });
    this.n = this.hands.map((h) => h.length);
    this.weights = this.hands.map((hs) => Float64Array.from(hs, (h) => h.w));
    this.rank = this.hands.map((hs) => Int32Array.from(hs, (h) => h.rank));
    this.order = this.hands.map((hs) => {
      const idx = hs.map((_, i) => i);
      idx.sort((a, b) => hs[a].rank - hs[b].rank);
      return Int32Array.from(idx);
    });
    this.keyIndex = this.hands.map((hs) => new Map(hs.map((h, i) => [h.key, i])));
    // same[p][i] = index of identical combo in the other player's list, or -1
    this.same = [0, 1].map((p) => Int32Array.from(this.hands[p], (h) => this.keyIndex[1 - p].get(h.key) ?? -1));
    this.cs = new Float64Array(52);

    this.tree = buildTree({
      pot: this.pot,
      stack: this.stack,
      betSizes: [parseSizes(config.betSizes[0]), parseSizes(config.betSizes[1])],
      raiseSizes: parseSizes(config.raiseSizes),
      allIn: !!config.allIn,
      maxRaises: config.maxRaises ?? 2,
    });
    this.boardStr = this.board.map(cardStr).join(' ');
  }

  /** For each of p's hands: total opponent reach that doesn't share a card. */
  compat(p, reachO, out = new Float64Array(this.n[p])) {
    const O = this.hands[1 - p], cs = this.cs;
    cs.fill(0);
    let tot = 0;
    for (let j = 0; j < O.length; j++) {
      const w = reachO[j];
      if (w === 0) continue;
      tot += w; cs[O[j].c1] += w; cs[O[j].c2] += w;
    }
    const H = this.hands[p], same = this.same[p];
    for (let i = 0; i < H.length; i++) {
      out[i] = tot - cs[H[i].c1] - cs[H[i].c2] + (same[i] >= 0 ? reachO[same[i]] : 0);
    }
    return out;
  }

  /** Reach-weighted opponent mass that p's hand beats (W) and loses to (L). */
  winLose(p, reachO, W, L) {
    const H = this.hands[p], O = this.hands[1 - p];
    const rT = this.rank[p], rO = this.rank[1 - p];
    const oT = this.order[p], oO = this.order[1 - p];
    const cs = this.cs;
    const nT = H.length, nO = O.length;
    cs.fill(0);
    let tot = 0, j = 0;
    for (let k = 0; k < nT; k++) {
      const i = oT[k], r = rT[i];
      while (j < nO && rO[oO[j]] < r) {
        const o = oO[j], w = reachO[o];
        tot += w; cs[O[o].c1] += w; cs[O[o].c2] += w; j++;
      }
      W[i] = tot - cs[H[i].c1] - cs[H[i].c2];
    }
    cs.fill(0); tot = 0; j = nO - 1;
    for (let k = nT - 1; k >= 0; k--) {
      const i = oT[k], r = rT[i];
      while (j >= 0 && rO[oO[j]] > r) {
        const o = oO[j], w = reachO[o];
        tot += w; cs[O[o].c1] += w; cs[O[o].c2] += w; j--;
      }
      L[i] = tot - cs[H[i].c1] - cs[H[i].c2];
    }
  }

  /** Showdown equity of each of p's hands vs opponent reach. NaN if no compatible opponent hands. */
  equities(p, reachO) {
    const n = this.n[p];
    const W = new Float64Array(n), L = new Float64Array(n), C = this.compat(p, reachO);
    this.winLose(p, reachO, W, L);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = C[i] > 1e-12 ? (W[i] + 0.5 * (C[i] - W[i] - L[i])) / C[i] : NaN;
    return out;
  }

  conflicts(p, i, q, j) {
    const a = this.hands[p][i], b = this.hands[q][j];
    return a.c1 === b.c1 || a.c1 === b.c2 || a.c2 === b.c1 || a.c2 === b.c2;
  }
}

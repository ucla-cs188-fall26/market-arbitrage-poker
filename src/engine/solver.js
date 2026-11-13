// Vectorised CFR+ for a heads-up river subgame (alternating updates, linear averaging).
// Utilities are chips won from the start of the river: winning a showdown nets pot + own contribution.

export class Solver {
  constructor(spot) {
    this.spot = spot;
    this.tree = spot.tree;
    this.iter = 0;
    const n = spot.n;
    for (const node of this.tree.nodes) {
      if (node.type !== 'action') continue;
      const m = node.actions.length, np = n[node.player];
      node.regret = new Float64Array(m * np);
      node.stratSum = new Float64Array(m * np);
      node.cur = new Float64Array(m * np);
      // per-traverser scratch buffers
      node.vals = [0, 1].map((p) => Array.from({ length: m }, () => new Float64Array(n[p])));
      node.out = [0, 1].map((p) => new Float64Array(n[p]));
      node.reachBuf = [0, 1].map((p) => Array.from({ length: m }, () => new Float64Array(n[p])));
    }
    for (const node of this.tree.nodes) {
      if (node.type === 'action') continue;
      node.out = [0, 1].map((p) => new Float64Array(n[p]));
      node.W = [0, 1].map((p) => new Float64Array(n[p]));
      node.L = [0, 1].map((p) => new Float64Array(n[p]));
      node.C = [0, 1].map((p) => new Float64Array(n[p]));
    }
    // Normaliser: total joint weight of compatible (oop, ip) hand pairs.
    const C = spot.compat(0, spot.weights[1]);
    this.Z = spot.weights[0].reduce((s, w, i) => s + w * C[i], 0);
    if (this.Z <= 0) throw new Error('Ranges have no compatible hand pairs');
  }

  currentStrategy(node, out = node.cur) {
    const m = node.actions.length, np = this.spot.n[node.player], R = node.regret;
    for (let i = 0; i < np; i++) {
      let s = 0;
      for (let a = 0; a < m; a++) { const r = R[a * np + i]; if (r > 0) s += r; }
      for (let a = 0; a < m; a++) {
        const r = R[a * np + i];
        out[a * np + i] = s > 0 ? (r > 0 ? r / s : 0) : 1 / m;
      }
    }
    return out;
  }

  averageStrategy(node) {
    const m = node.actions.length, np = this.spot.n[node.player], S = node.stratSum;
    const out = new Float64Array(m * np);
    for (let i = 0; i < np; i++) {
      let s = 0;
      for (let a = 0; a < m; a++) s += S[a * np + i];
      for (let a = 0; a < m; a++) out[a * np + i] = s > 0 ? S[a * np + i] / s : 1 / m;
    }
    return out;
  }

  terminal(node, p, reachO) {
    const spot = this.spot, out = node.out[p], n = spot.n[p], P = spot.pot;
    if (node.type === 'fold') {
      const C = spot.compat(p, reachO, node.C[p]);
      const pay = node.folder === p ? -node.contrib[p] : P + node.contrib[node.folder];
      for (let i = 0; i < n; i++) out[i] = pay * C[i];
      return out;
    }
    const c = node.contrib[0];
    const W = node.W[p], L = node.L[p], C = spot.compat(p, reachO, node.C[p]);
    spot.winLose(p, reachO, W, L);
    const win = P + c, lose = -c, tie = P / 2;
    for (let i = 0; i < n; i++) out[i] = win * W[i] + lose * L[i] + tie * (C[i] - W[i] - L[i]);
    return out;
  }

  // Counterfactual values for traverser p. mode: 'cfr' | 'avg' | 'br'
  cfv(node, p, reachP, reachO, mode) {
    if (node.type !== 'action') return this.terminal(node, p, reachO);
    const spot = this.spot, m = node.actions.length, out = node.out[p];
    const acting = node.player, np = spot.n[acting];
    const strat = mode === 'cfr' ? this.currentStrategy(node) : (node.avg ??= this.averageStrategy(node));
    const n = spot.n[p];
    if (acting === p) {
      const vals = node.vals[p];
      for (let a = 0; a < m; a++) {
        const rb = node.reachBuf[p][a];
        for (let i = 0; i < n; i++) rb[i] = reachP[i] * strat[a * np + i];
        const v = this.cfv(node.children[a], p, rb, reachO, mode);
        vals[a].set(v);
      }
      if (mode === 'br') {
        for (let i = 0; i < n; i++) {
          let best = -Infinity;
          for (let a = 0; a < m; a++) if (vals[a][i] > best) best = vals[a][i];
          out[i] = best;
        }
        return out;
      }
      out.fill(0);
      for (let a = 0; a < m; a++) for (let i = 0; i < n; i++) out[i] += strat[a * np + i] * vals[a][i];
      if (mode === 'cfr') {
        const R = node.regret, S = node.stratSum, t = this.iter;
        for (let a = 0; a < m; a++) {
          const va = vals[a];
          for (let i = 0; i < n; i++) {
            const k = a * np + i;
            const r = R[k] + va[i] - out[i];
            R[k] = r > 0 ? r : 0;
            S[k] += t * reachP[i] * strat[k];
          }
        }
      }
      return out;
    }
    // opponent acts
    const no = spot.n[acting];
    const acc = new Float64Array(n);
    for (let a = 0; a < m; a++) {
      const rb = node.reachBuf[acting][a];
      for (let j = 0; j < no; j++) rb[j] = reachO[j] * strat[a * np + j];
      const v = this.cfv(node.children[a], p, reachP, rb, mode);
      for (let i = 0; i < n; i++) acc[i] += v[i];
    }
    out.set(acc);
    return out;
  }

  run(iterations) {
    const w = this.spot.weights, root = this.tree.root;
    for (let k = 0; k < iterations; k++) {
      this.iter++;
      for (const node of this.tree.nodes) if (node.type === 'action') node.avg = null;
      this.cfv(root, 0, w[0], w[1], 'cfr');
      this.cfv(root, 1, w[1], w[0], 'cfr');
    }
    for (const node of this.tree.nodes) if (node.type === 'action') node.avg = null;
  }

  /** Value (chips) for player p at the root, under avg strategies or best response. */
  rootValue(p, mode) {
    const w = this.spot.weights;
    const v = this.cfv(this.tree.root, p, w[p], w[1 - p], mode);
    let s = 0;
    for (let i = 0; i < v.length; i++) s += w[p][i] * v[i];
    return s / this.Z;
  }

  /** Exploitability as % of the starting pot (average of both players' best-response gains). */
  exploitability() {
    const br0 = this.rootValue(0, 'br'), br1 = this.rootValue(1, 'br');
    return ((br0 + br1 - this.spot.pot) / 2 / this.spot.pot) * 100;
  }

  /**
   * Final analysis under average strategies: per action node the average strategy, both players'
   * reach vectors, and the acting player's EV per action per hand (chips, from start of river).
   */
  analyze() {
    const spot = this.spot, nodes = this.tree.nodes;
    for (const node of nodes) if (node.type === 'action') node.avg = this.averageStrategy(node);
    // top-down reaches
    const setReach = (node, r0, r1) => {
      node.reach = [Float64Array.from(r0), Float64Array.from(r1)];
      if (node.type !== 'action') return;
      const np = spot.n[node.player];
      node.children.forEach((ch, a) => {
        const r = [r0, r1].map((x) => Float64Array.from(x));
        for (let i = 0; i < np; i++) r[node.player][i] *= node.avg[a * np + i];
        setReach(ch, r[0], r[1]);
      });
    };
    setReach(this.tree.root, spot.weights[0], spot.weights[1]);
    // EVs per action for acting player
    for (const node of nodes) {
      if (node.type !== 'action') continue;
      const p = node.player, m = node.actions.length, np = spot.n[p];
      const reachO = node.reach[1 - p];
      const C = spot.compat(p, reachO);
      const ev = new Float64Array(m * np);
      for (let a = 0; a < m; a++) {
        const ones = new Float64Array(np).fill(1);
        const v = this.cfv(node.children[a], p, ones, reachO, 'avg');
        for (let i = 0; i < np; i++) ev[a * np + i] = C[i] > 1e-12 ? v[i] / C[i] : NaN;
      }
      node.ev = ev;
    }
    const ev0 = this.rootValue(0, 'avg'), ev1 = this.rootValue(1, 'avg');
    return { ev: [ev0, ev1], exploitability: this.exploitability(), iterations: this.iter };
  }
}

/** Serialisable result for posting from a worker. */
export function exportResult(spot, summary) {
  return {
    summary,
    nodes: spot.tree.nodes.map((n) => (n.type === 'action'
      ? { id: n.id, avg: n.avg, ev: n.ev, reach: n.reach }
      : { id: n.id, reach: n.reach })),
  };
}

/** Attach an exported result onto a freshly-built spot's tree. */
export function importResult(spot, result) {
  for (const r of result.nodes) Object.assign(spot.tree.nodes[r.id], r);
  spot.summary = result.summary;
}

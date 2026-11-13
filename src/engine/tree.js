// River betting tree. Player 0 = OOP (acts first), player 1 = IP.

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * @param {object} o
 * @param {number} o.pot  pot at start of river
 * @param {number} o.stack effective stack behind at start of river
 * @param {number[][]} o.betSizes  [oopFractions, ipFractions] of pot, e.g. [[0.33,0.75],[0.5,1]]
 * @param {number[]} o.raiseSizes fractions of pot-after-call, e.g. [0.75]
 * @param {boolean} o.allIn include an all-in option
 * @param {number} o.maxRaises raises allowed after the first bet
 */
export function buildTree(o) {
  const { pot, stack } = o;
  const maxRaises = o.maxRaises ?? 2;
  const nodes = [];
  const add = (n) => { n.id = nodes.length; nodes.push(n); return n; };
  const potNow = (c) => pot + c[0] + c[1];

  function terminalShowdown(contrib, path) {
    return add({ type: 'showdown', contrib, path });
  }
  function terminalFold(folder, contrib, path) {
    return add({ type: 'fold', folder, contrib, path });
  }

  function betOptions(player, contrib) {
    const opts = [];
    const p = potNow(contrib);
    for (const f of o.betSizes[player]) {
      let amt = round2(f * p);
      if (amt <= 0) continue;
      if (amt >= stack * 0.9) amt = stack;
      opts.push(amt);
    }
    if (o.allIn) opts.push(stack);
    return [...new Set(opts.map((a) => Math.min(a, stack)))].sort((a, b) => a - b);
  }

  function raiseOptions(player, contrib) {
    const opp = 1 - player;
    const cOpp = contrib[opp], cMe = contrib[player];
    if (cOpp >= stack) return [];
    const minTo = cOpp + (cOpp - cMe);
    const opts = [];
    for (const f of o.raiseSizes) {
      let to = round2(cOpp + f * (pot + 2 * cOpp));
      to = Math.max(to, minTo);
      if (to >= stack * 0.9) to = stack;
      opts.push(to);
    }
    if (o.allIn) opts.push(stack);
    return [...new Set(opts.map((a) => Math.min(a, stack)))].filter((t) => t > cOpp).sort((a, b) => a - b);
  }

  const pct = (amt, base) => `${Math.round((amt / base) * 100)}%`;

  // player to act; facing = whether there is a bet to call; raises made so far
  function decision(player, contrib, raises, path, afterCheck) {
    const node = add({ type: 'action', player, contrib, path, actions: [], children: [] });
    const opp = 1 - player;
    const facing = contrib[opp] > contrib[player];
    const p = potNow(contrib);
    const push = (action, child) => { node.actions.push(action); node.children.push(child); };
    if (!facing) {
      // check
      const checkPath = [...path, 'Check'];
      push({ kind: 'check', label: 'Check', amount: 0 },
        afterCheck ? terminalShowdown(contrib, checkPath) : null);
      for (const amt of betOptions(player, contrib)) {
        const c = [...contrib]; c[player] = amt;
        const label = amt >= stack ? `All-in ${amt}` : `Bet ${amt} (${pct(amt, p)})`;
        push({ kind: amt >= stack ? 'allin' : 'bet', label, amount: amt, potFraction: amt / p }, null);
      }
      // build children after listing so ids are breadth-ish ordered per node
      node.actions.forEach((a, i) => {
        if (node.children[i]) return;
        const childPath = [...path, a.label];
        if (a.kind === 'check') node.children[i] = decision(opp, contrib, raises, childPath, true);
        else {
          const c = [...contrib]; c[player] = a.amount;
          node.children[i] = decision(opp, c, raises, childPath, false);
        }
      });
    } else {
      const callAmt = contrib[opp] - contrib[player];
      const c = [...contrib]; c[player] = contrib[opp];
      push({ kind: 'fold', label: 'Fold', amount: 0 }, terminalFold(player, contrib, [...path, 'Fold']));
      push({ kind: 'call', label: `Call ${round2(callAmt)}`, amount: callAmt }, terminalShowdown(c, [...path, `Call ${round2(callAmt)}`]));
      if (raises < maxRaises && contrib[player] < stack) {
        for (const to of raiseOptions(player, contrib)) {
          const label = to >= stack ? `All-in ${to}` : `Raise to ${to}`;
          const rc = [...contrib]; rc[player] = to;
          const childPath = [...path, label];
          push({ kind: to >= stack ? 'allin' : 'raise', label, amount: to - contrib[player], raiseTo: to }, null);
          node.children[node.children.length - 1] = decision(opp, rc, raises + 1, childPath, false);
        }
      }
    }
    return node;
  }

  const root = decision(0, [0, 0], 0, [], false);
  return { root, nodes, pot, stack };
}

export function potAt(tree, node) {
  return tree.pot + node.contrib[0] + node.contrib[1];
}

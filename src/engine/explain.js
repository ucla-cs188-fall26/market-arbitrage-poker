// Turns solver output into plain-language reasons. Every number shown is computed from the
// solved strategies; nothing here is hand-tuned advice.
import { comboClass, cardStr } from './cards.js';
import { describe, categoryOf } from './evaluator.js';

export const PLAYER_NAMES = ['OOP', 'IP'];

export const GLOSSARY = {
  equity: { term: 'Equity', text: 'How often your hand wins at showdown against the hands your opponent can have right now (ties count half).' },
  potOdds: { term: 'Pot odds', text: 'The share of the final pot you must put in to call. If you need to call 10 to win a pot that will be 40, you need to win at least 25% of the time.' },
  mdf: { term: 'Minimum defence frequency (MDF)', text: 'How much of your range you must continue with so that a bluff with any two cards does not automatically profit. For a bet b into a pot p it is p / (p + b).' },
  blockers: { term: 'Blockers', text: 'Cards in your hand that your opponent therefore cannot hold. Holding an ace of the flush suit means the opponent has fewer nut flushes.' },
  valueBet: { term: 'Value bet', text: 'A bet that wants a call because, when called, you win more than half the time.' },
  bluff: { term: 'Bluff', text: 'A bet with a hand that usually loses when called, made because the opponent folds often enough.' },
  bluffCatcher: { term: 'Bluff-catcher', text: 'A hand that beats only bluffs. Whether to call depends on how many bluffs the opponent has, not on how strong your hand looks.' },
  polarized: { term: 'Polarized range', text: 'A betting range made of very strong hands and bluffs, with the medium hands checked.' },
  mixed: { term: 'Mixed strategy', text: 'When two actions earn almost the same, the solver plays both at set frequencies so the opponent cannot predict or exploit you.' },
  rangeAdvantage: { term: 'Nut advantage', text: 'Which player holds more of the very strongest hands. The player with more nuts can bet more and bigger.' },
  showdownValue: { term: 'Showdown value', text: 'A hand that often wins if the hand checks down, but that worse hands will not call a bet with.' },
  trap: { term: 'Trapping', text: 'Checking a strong hand so your checks are not all weak, and to let the opponent bluff.' },
  breakEven: { term: 'Break-even fold rate', text: 'A pure bluff of b into a pot p profits if the opponent folds more than b / (p + b) of the time.' },
};

const pct = (x, d = 0) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '–');
const chips = (x) => (Number.isFinite(x) ? (Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2)) : '–');
const r2 = (x) => Math.round(x * 100) / 100;

function potNow(spot, node) { return spot.pot + node.contrib[0] + node.contrib[1]; }

export function strategyOf(spot, node, i) {
  const np = spot.n[node.player];
  return node.actions.map((_, a) => node.avg[a * np + i]);
}

/** Opponent mass split by whether it beats hand i of player p. With removal = respects i's cards. */
function composition(spot, p, i, reachO, removal = true) {
  const H = spot.hands[p][i], O = spot.hands[1 - p], rO = spot.rank[1 - p];
  let beats = 0, loses = 0, ties = 0;
  for (let j = 0; j < O.length; j++) {
    const w = reachO[j];
    if (!w) continue;
    if (removal && spot.conflicts(p, i, 1 - p, j)) continue;
    if (rO[j] > H.rank) beats += w; else if (rO[j] < H.rank) loses += w; else ties += w;
  }
  const total = beats + loses + ties;
  return { beats, loses, ties, total, equity: total > 0 ? (loses + ties / 2) / total : NaN };
}

/** Top opponent hand classes (by weight) among combos selected by pick(j) -> weight. */
function topClasses(spot, p, i, pick, k = 3) {
  const O = spot.hands[1 - p];
  const by = new Map();
  for (let j = 0; j < O.length; j++) {
    if (spot.conflicts(p, i, 1 - p, j)) continue;
    const w = pick(j);
    if (w > 1e-9) by.set(comboClass(O[j].c1, O[j].c2), (by.get(comboClass(O[j].c1, O[j].c2)) || 0) + w);
  }
  return [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map((e) => e[0]);
}

function percentileInRange(spot, p, i, reachP) {
  const r = spot.rank[p][i];
  let below = 0, tie = 0, tot = 0;
  for (let k = 0; k < spot.n[p]; k++) {
    const w = reachP[k];
    if (!w) continue;
    tot += w;
    if (spot.rank[p][k] < r) below += w; else if (spot.rank[p][k] === r) tie += w;
  }
  return tot > 0 ? (below + tie / 2) / tot : NaN;
}

/** Response of the opponent (at child) to our action, from hand i's perspective. */
function responseStats(spot, p, i, node, a, removal = true) {
  const child = node.children[a];
  const opp = 1 - p;
  if (child.type !== 'action' || child.player !== opp) return null;
  const no = spot.n[opp];
  const foldIdx = child.actions.findIndex((x) => x.kind === 'fold');
  const reachO = node.reach[opp];
  const H = spot.hands[p][i], rO = spot.rank[opp];
  let tot = 0, fold = 0, contBeats = 0, contLoses = 0, contTies = 0, raise = 0;
  for (let j = 0; j < no; j++) {
    const w = reachO[j];
    if (!w) continue;
    if (removal && spot.conflicts(p, i, opp, j)) continue;
    tot += w;
    const f = foldIdx >= 0 ? child.avg[foldIdx * no + j] : 0;
    fold += w * f;
    const cont = w * (1 - f);
    if (rO[j] > H.rank) contBeats += cont; else if (rO[j] < H.rank) contLoses += cont; else contTies += cont;
    child.actions.forEach((x, b) => { if (x.kind === 'raise' || x.kind === 'allin') raise += w * child.avg[b * no + j]; });
  }
  const cont = contBeats + contLoses + contTies;
  return {
    total: tot,
    foldRate: tot > 0 ? fold / tot : NaN,
    raiseRate: tot > 0 ? raise / tot : NaN,
    equityWhenCalled: cont > 0 ? (contLoses + contTies / 2) / cont : NaN,
    contBeats, contLoses, cont,
    child, foldIdx,
  };
}

/** How much opponent weight each of our cards removes, split into hands that beat us / we beat. */
function cardRemoval(spot, p, i, reachO, weightFn) {
  const H = spot.hands[p][i], O = spot.hands[1 - p], rO = spot.rank[1 - p];
  return [H.c1, H.c2].map((c) => {
    let beats = 0, loses = 0;
    for (let j = 0; j < O.length; j++) {
      if (O[j].c1 !== c && O[j].c2 !== c) continue;
      const w = (reachO[j] || 0) * (weightFn ? weightFn(j) : 1);
      if (!w) continue;
      if (rO[j] > H.rank) beats += w; else if (rO[j] < H.rank) loses += w;
    }
    return { card: cardStr(c), beats, loses };
  });
}

function actionPhrase(a) {
  if (a.kind === 'bet') return `bet ${r2(a.amount)}`;
  if (a.kind === 'raise') return `raise to ${r2(a.raiseTo)}`;
  if (a.kind === 'allin') return 'go all-in';
  return a.kind;
}

/**
 * Explain the solver's play for hand i of the acting player at `node`.
 */
export function explainHand(spot, node, i) {
  const p = node.player, opp = 1 - p;
  const hand = spot.hands[p][i];
  const np = spot.n[p];
  const P = potNow(spot, node);
  const reachP = node.reach[p], reachO = node.reach[opp];
  const freqs = strategyOf(spot, node, i);
  const evs = node.actions.map((_, a) => node.ev[a * np + i] + node.contrib[p]);
  const bestEvIdx = evs.reduce((b, v, a) => (v > evs[b] ? a : b), 0);
  const order = freqs.map((f, a) => a).sort((a, b) => freqs[b] - freqs[a]);
  const top = order[0];
  const second = order[1];
  const mixed = second != null && freqs[second] >= 0.15;
  const facing = node.contrib[opp] - node.contrib[p];
  const comp = composition(spot, p, i, reachO);
  const pctl = percentileInRange(spot, p, i, reachP);
  const reasons = [];
  const name = PLAYER_NAMES[p], oname = PLAYER_NAMES[opp];
  const handDesc = describe(hand.rank);

  const actions = node.actions.map((a, k) => ({
    label: a.label, kind: a.kind, freq: freqs[k], ev: evs[k], loss: evs[bestEvIdx] - evs[k], lossPct: (evs[bestEvIdx] - evs[k]) / P,
  }));

  const inRange = reachP[i] > 1e-9;
  if (!inRange) {
    reasons.push({
      tag: 'note', title: 'This hand never reaches this spot',
      text: `With the solved strategy, ${name} never plays ${hand.key} this way on earlier streets of this river. The numbers below show what it would do if it did.`,
    });
  }

  // 1. How strong is the hand here?
  const strength = comp.equity;
  reasons.push({
    tag: 'strength', concept: 'equity', title: `${handDesc} — ${pct(strength)} equity`,
    text: `Against the ${oname} hands that get here, you win ${pct(comp.loses / comp.total)} and lose ${pct(comp.beats / comp.total)}${comp.ties > 0 ? `, tie ${pct(comp.ties / comp.total)}` : ''}. `
      + `Within your own range here this hand is stronger than ${pct(pctl)} of your combos.`
      + (comp.beats > 0 ? ` Hands that beat you include ${topClasses(spot, p, i, (j) => (spot.rank[opp][j] > hand.rank ? reachO[j] : 0)).join(', ')}.` : ' Nothing they can have beats you.'),
  });

  {
    const alt = order.slice(1).sort((a, b) => evs[b] - evs[a])[0];
    if (alt != null) {
      const d = evs[top] - evs[alt];
      reasons.unshift({
        tag: 'verdict', concept: d < 0.01 * P ? 'mixed' : null,
        title: d < 0.01 * P
          ? `${node.actions[top].label} and ${node.actions[alt].label} are worth about the same`
          : `${node.actions[top].label} earns ${chips(d)} more than ${node.actions[alt].label}`,
        text: `Expected value from here: ${node.actions[top].label} ${chips(evs[top])}, ${node.actions[alt].label} ${chips(evs[alt])} chips (${pct(Math.abs(d) / P, 1)} of the pot). The reasons below explain where that gap comes from.`,
      });
    }
  }

  if (facing > 0) {
    // ---- Facing a bet or raise ----
    const callIdx = node.actions.findIndex((a) => a.kind === 'call');
    const need = facing / (P + facing);
    const mdf = (P - facing) / P;
    const foldIdx = node.actions.findIndex((a) => a.kind === 'fold');
    let contRange = 0, totRange = 0;
    for (let k = 0; k < np; k++) { totRange += reachP[k]; contRange += reachP[k] * (1 - node.avg[foldIdx * np + k]); }
    const callEdge = strength - need;
    reasons.push({
      tag: callEdge >= 0 ? 'good' : 'bad', concept: 'potOdds',
      title: `Pot odds: you need ${pct(need, 1)}, you have ${pct(strength, 1)}`,
      text: `Calling ${chips(facing)} to win a pot of ${chips(P)} means you must win at least ${pct(need, 1)} of the time. `
        + (callEdge >= 0
          ? `You are ${pct(callEdge, 1)} above that line, so calling makes money against this betting range.`
          : `You are ${pct(-callEdge, 1)} short, so calling loses money against this betting range.`),
    });
    const valueShare = comp.beats / comp.total;
    const isCatcher = comp.loses > 0 && comp.beats > 0;
    if (isCatcher) {
      reasons.push({
        tag: 'info', concept: 'bluffCatcher',
        title: `${oname}'s range here is ${pct(valueShare)} value, ${pct(comp.loses / comp.total)} bluffs`,
        text: `Your hand only beats their bluffs. The ${oname} hands that bet this way and beat you are mostly ${topClasses(spot, p, i, (j) => (spot.rank[opp][j] > hand.rank ? reachO[j] : 0)).join(', ')}; `
          + `the ones you beat are mostly ${topClasses(spot, p, i, (j) => (spot.rank[opp][j] < hand.rank ? reachO[j] : 0)).join(', ')}.`,
      });
    }
    // blockers
    const unblocked = composition(spot, p, i, reachO, false);
    const shift = valueShare - unblocked.beats / unblocked.total;
    const rem = cardRemoval(spot, p, i, reachO);
    if (Math.abs(shift) >= 0.02) {
      const helps = shift < 0;
      const key = rem.slice().sort((a, b) => (helps ? (b.beats - b.loses) - (a.beats - a.loses) : (b.loses - b.beats) - (a.loses - a.beats)))[0];
      reasons.push({
        tag: helps ? 'good' : 'bad', concept: 'blockers',
        title: helps ? `Good blockers: your ${key.card} removes value hands` : `Bad blockers: your ${key.card} removes bluffs`,
        text: `Without your cards, ${pct(unblocked.beats / unblocked.total)} of ${oname}'s range would beat you. Because you hold ${hand.key}, it is ${pct(valueShare)}. `
          + `Your ${key.card} alone takes away ${chips(key.beats)} combos that beat you and ${chips(key.loses)} that you beat.`,
      });
    }
    reasons.push({
      tag: 'info', concept: 'mdf',
      title: `Your range must defend about ${pct(mdf)}; the solver continues ${pct(contRange / totRange)}`,
      text: `Your hand is stronger than ${pct(pctl)} of your range here. `
        + (freqs[foldIdx] > 0.5
          ? 'It sits below the cut-off, so it is one of the hands that gives up.'
          : 'It is above the cut-off, so it is one of the hands that continues.')
        + ' Folding more than this would let them bluff with anything.',
    });
    // raising
    node.actions.forEach((a, k) => {
      if ((a.kind !== 'raise' && a.kind !== 'allin') || freqs[k] < 0.05) return;
      const rs = responseStats(spot, p, i, node, k);
      if (!rs) return;
      const valueRaise = rs.equityWhenCalled >= 0.5;
      reasons.push({
        tag: 'info', concept: valueRaise ? 'valueBet' : 'bluff',
        title: valueRaise ? `Raise for value: you win ${pct(rs.equityWhenCalled)} when they continue` : `Raise as a bluff: they fold ${pct(rs.foldRate)}`,
        text: valueRaise
          ? `If you ${actionPhrase(a)}, ${oname} still continues with ${pct(1 - rs.foldRate)} of their range, mostly ${topClasses(spot, p, i, (j) => rs.child.avg[rs.foldIdx * spot.n[opp] + j] < 1 ? reachO[j] * (1 - rs.child.avg[rs.foldIdx * spot.n[opp] + j]) : 0).join(', ')}, and you beat most of those.`
          : `If you ${actionPhrase(a)}, ${oname} folds ${pct(rs.foldRate)} of the time. Your hand has little showdown value, so turning it into a bluff earns more than folding.`,
      });
    });
  } else {
    // ---- First to act or checked to ----
    const checkIdx = node.actions.findIndex((a) => a.kind === 'check');
    // hands in our range that bet as bluffs here (low equity, high bet frequency)
    const eqAll = spot.equities(p, reachO);
    const bluffBy = new Map();
    for (let k = 0; k < np; k++) {
      if (!reachP[k] || !(eqAll[k] < 0.25)) continue;
      const b = 1 - node.avg[checkIdx * np + k];
      const cl = comboClass(spot.hands[p][k].c1, spot.hands[p][k].c2);
      const cur = bluffBy.get(cl) || [0, 0];
      bluffBy.set(cl, [cur[0] + reachP[k] * b, cur[1] + reachP[k]]);
    }
    const chosenBluffs = [...bluffBy.entries()].filter(([, v]) => v[0] / v[1] > 0.5).sort((x, y) => y[1][0] - x[1][0]).slice(0, 4).map(([c, v]) => `${c} (${pct(v[0] / v[1])})`);
    const lastToAct = node.children[checkIdx].type === 'showdown';
    node.actions.forEach((a, k) => {
      if (a.kind === 'check') return;
      if (freqs[k] < 0.05 && k !== bestEvIdx && !(k === order.find((x) => node.actions[x].kind !== 'check'))) return;
      const rs = responseStats(spot, p, i, node, k);
      if (!rs) return;
      const be = a.amount / (P + a.amount);
      const value = rs.equityWhenCalled >= 0.5;
      const chosen = freqs[k] >= 0.05;
      if (value) {
        const worse = topClasses(spot, p, i, (j) => (spot.rank[opp][j] < hand.rank ? reachO[j] * (1 - (rs.foldIdx >= 0 ? rs.child.avg[rs.foldIdx * spot.n[opp] + j] : 0)) : 0));
        reasons.push({
          tag: chosen ? 'good' : 'info', concept: 'valueBet',
          title: `${a.label}: a value bet — called by worse ${pct(rs.equityWhenCalled)} of the time`,
          text: `${oname} folds ${pct(rs.foldRate)} and continues with the rest. When they continue you are ahead ${pct(rs.equityWhenCalled)}, so a call pays you. `
            + (worse.length ? `Worse hands that pay you off: ${worse.join(', ')}.` : '')
            + (rs.raiseRate > 0.03 ? ` They raise ${pct(rs.raiseRate)} of the time, which is the risk of betting.` : '')
            + (evs[k] < evs[checkIdx] - 0.005 * P ? ` Even so it earns ${chips(evs[k])} versus ${chips(evs[checkIdx])} for checking${rs.raiseRate > 0.03 ? ', mainly because of those raises' : ', because they only call with hands that are close to yours'}.` : ''),
        });
      } else {
        const unb = responseStats(spot, p, i, node, k, false);
        const blockShift = rs.foldRate - unb.foldRate;
        const good = rs.foldRate > be;
        reasons.push({
          tag: chosen ? (good ? 'good' : 'info') : 'bad', concept: 'breakEven',
          title: `${a.label}: works as a bluff only if they fold ${pct(be)}; they fold ${pct(rs.foldRate)}`,
          text: `When called you are ahead just ${pct(rs.equityWhenCalled)}, so this bet is a bluff. Risking ${chips(a.amount)} to win ${chips(P)} needs ${pct(be)} folds. `
            + (good
              ? (evs[k] < evs[checkIdx] - 0.005 * P
                ? `They fold more than that, so the bluff makes money (${chips(evs[k])}), but checking earns more (${chips(evs[checkIdx])}) because your hand still wins some showdowns.`
                : `They fold more than that, so the bluff makes money on its own (${chips(evs[k])} vs ${chips(evs[checkIdx])} for checking).`)
              : `They fold less than that, so the bet earns ${chips(evs[k])} versus ${chips(evs[checkIdx])} for checking.`)
            + (Math.abs(blockShift) >= 0.02
              ? ` Your cards ${blockShift > 0 ? 'raise' : 'lower'} their fold rate by ${pct(Math.abs(blockShift), 1)} — ${blockShift > 0 ? 'you block hands that would call' : 'you block hands that would fold'}.`
              : ''),
        });
        if (Math.abs(blockShift) >= 0.02) {
          const callW = (j) => 1 - (rs.foldIdx >= 0 ? rs.child.avg[rs.foldIdx * spot.n[opp] + j] : 0);
          const rem = cardRemoval(spot, p, i, reachO, callW);
          const key = rem.slice().sort((x, y) => (y.beats + y.loses) - (x.beats + x.loses))[0];
          reasons.push({
            tag: blockShift > 0 ? 'good' : 'bad', concept: 'blockers',
            title: blockShift > 0 ? `Your ${key.card} is a good blocker for bluffing` : `Your ${key.card} blocks their folds`,
            text: `${key.card} removes ${chips(key.beats + key.loses)} combos of the hands that would call a ${chips(a.amount)} bet.`,
          });
        }
      }
    });
    if (freqs[checkIdx] >= 0.05) {
      const best = order.find((x) => node.actions[x].kind !== 'check');
      const rsB = best != null ? responseStats(spot, p, i, node, best) : null;
      if (lastToAct) {
        reasons.push({
          tag: 'info', concept: strength >= 0.5 ? 'showdownValue' : 'bluff',
          title: `Checking back wins ${pct(strength)} at showdown`,
          text: strength >= 0.35 && rsB && rsB.equityWhenCalled < 0.5
            ? `Betting folds out the hands you beat and gets called by the hands that beat you (you'd be ahead only ${pct(rsB.equityWhenCalled)} when called). Checking keeps your showdown value.`
            : strength < 0.35
              ? `The hand rarely wins at showdown, so checking is "giving up".${chosenBluffs.length ? ` The bluffs the solver picks instead: ${chosenBluffs.join(', ')}.` : ''}`
              : 'Checking realises your equity without risking a raise.',
        });
      } else {
        const after = node.children[checkIdx];
        const no = spot.n[opp];
        let bet = 0, tot = 0;
        for (let j = 0; j < no; j++) {
          if (!reachO[j] || spot.conflicts(p, i, opp, j)) continue;
          tot += reachO[j];
          after.actions.forEach((x, b) => { if (x.kind !== 'check') bet += reachO[j] * after.avg[b * no + j]; });
        }
        const strong = strength >= 0.7;
        reasons.push({
          tag: 'info', concept: strong ? 'trap' : 'showdownValue',
          title: strong ? `Checking a strong hand: ${oname} bets ${pct(bet / tot)} after a check` : `Checking: ${oname} bets ${pct(bet / tot)} of the time after you check`,
          text: strong
            ? 'Strong hands in your checking range stop them from betting freely when you check, and they let them bluff into you.'
            : rsB && rsB.equityWhenCalled < 0.5 && strength >= 0.35
              ? `If you bet, worse hands mostly fold and better hands call (ahead only ${pct(rsB.equityWhenCalled)} when called), so the hand prefers to check and see a showdown.`
              : 'The hand is not strong enough to bet for value, and other hands make better bluffs.',
        });
      }
    }
  }

  // Mixed strategy / EV gaps
  if (mixed) {
    const gap = Math.abs(evs[top] - evs[second]);
    reasons.push({
      tag: 'info', concept: 'mixed',
      title: `Mixed: ${node.actions[top].label} ${pct(freqs[top])} / ${node.actions[second].label} ${pct(freqs[second])}`,
      text: `Both earn almost the same (gap ${chips(gap)} chips, ${pct(gap / P, 1)} of the pot). `
        + `The solver plays both so ${oname} can't tell which you have; always picking one would let them adjust.`,
    });
  }

  const loss = actions.filter((a, k) => k !== bestEvIdx && a.lossPct > 0.005).map((a) => `${a.label} loses ${chips(a.loss)}`);
  const short = (a) => node.actions[a].label.replace(/\s*\(\d+%\)$/, '');
  const verdict = mixed
    ? `${short(top)} ${pct(freqs[top])}, ${short(second).toLowerCase()} ${pct(freqs[second])}`
    : `${short(top)}${freqs[top] < 0.995 ? ` ${pct(freqs[top])}` : ''}`;

  return {
    player: p, hand: hand.key, handClass: comboClass(hand.c1, hand.c2), description: handDesc,
    category: categoryOf(hand.rank), equity: strength, percentile: pctl, potNow: P, facing,
    actions, best: top, verdict, mixed, inRange, reasons,
    summaryLine: loss.length ? `Compared with the best play: ${loss.join(', ')} chips on average.` : 'All shown actions are within 0.5% of the pot of each other.',
  };
}

export const BUCKETS = [
  { name: 'Nutted', min: 0.85 }, { name: 'Strong', min: 0.65 }, { name: 'Medium', min: 0.4 }, { name: 'Weak', min: 0.15 }, { name: 'Air', min: -1 },
];

/** Range-level summary of what the acting player does at `node` and why. */
export function nodeSummary(spot, node) {
  const p = node.player, opp = 1 - p, np = spot.n[p], m = node.actions.length;
  const reachP = node.reach[p], reachO = node.reach[opp];
  const eq = spot.equities(p, reachO);
  const eqO = spot.equities(opp, reachP);
  const P = potNow(spot, node);
  const total = reachP.reduce((s, w) => s + w, 0);
  const freq = new Array(m).fill(0);
  const buckets = BUCKETS.map((b) => ({ ...b, weight: 0, mix: new Array(m).fill(0) }));
  for (let i = 0; i < np; i++) {
    const w = reachP[i];
    if (!w) continue;
    const b = buckets.find((x) => (Number.isFinite(eq[i]) ? eq[i] : 0) >= x.min);
    b.weight += w;
    for (let a = 0; a < m; a++) { const x = w * node.avg[a * np + i]; freq[a] += x; b.mix[a] += x; }
  }
  for (const b of buckets) { b.share = total ? b.weight / total : 0; b.mix = b.mix.map((x) => (b.weight ? x / b.weight : 0)); }
  for (let a = 0; a < m; a++) freq[a] = total ? freq[a] / total : 0;
  const totO = reachO.reduce((s, w) => s + w, 0);
  let nutsP = 0, nutsO = 0;
  for (let i = 0; i < np; i++) if (eq[i] >= 0.85) nutsP += reachP[i];
  for (let j = 0; j < spot.n[opp]; j++) if (eqO[j] >= 0.85) nutsO += reachO[j];
  const name = PLAYER_NAMES[p], oname = PLAYER_NAMES[opp];
  const facing = node.contrib[opp] - node.contrib[p];
  const lines = [];
  const aggressive = node.actions.map((a, k) => (['bet', 'raise', 'allin'].includes(a.kind) ? k : -1)).filter((k) => k >= 0);
  const aggr = (mix) => aggressive.reduce((s, k) => s + mix[k], 0);
  const by = Object.fromEntries(buckets.map((b) => [b.name, b]));
  const strongB = (by.Nutted.weight + by.Strong.weight) ? (by.Nutted.weight * aggr(by.Nutted.mix) + by.Strong.weight * aggr(by.Strong.mix)) / (by.Nutted.weight + by.Strong.weight) : 0;
  const weakB = (by.Weak.weight + by.Air.weight) ? (by.Weak.weight * aggr(by.Weak.mix) + by.Air.weight * aggr(by.Air.mix)) / (by.Weak.weight + by.Air.weight) : 0;
  const medB = aggr(by.Medium.mix);
  const shareP = total ? nutsP / total : 0, shareO = totO ? nutsO / totO : 0;
  lines.push({
    concept: 'rangeAdvantage',
    text: `${pct(shareP)} of ${name}'s range is nutted here (85%+ equity) versus ${pct(shareO)} of ${oname}'s. `
      + (shareP > shareO * 1.3 + 0.02 ? `${name} has the nut advantage, which lets them bet.` : shareO > shareP * 1.3 + 0.02 ? `${oname} has the nut advantage, so ${name} has to be careful.` : 'Neither side has a clear nut advantage.'),
  });
  if (facing > 0) {
    const foldIdx = node.actions.findIndex((a) => a.kind === 'fold');
    const mdf = (P - facing) / P;
    lines.push({ concept: 'mdf', text: `Facing ${chips(facing)} into ${chips(P - facing)}, MDF is ${pct(mdf)}. ${name} continues with ${pct(1 - freq[foldIdx])} of their range.` });
  } else {
    const a = aggr(freq);
    if (a < 0.05) lines.push({ concept: 'rangeAdvantage', text: `${name} checks almost everything: betting would get called by better and fold out worse too often.` });
    else if (strongB > medB + 0.25 && weakB > medB + 0.1) lines.push({ concept: 'polarized', text: `Betting is polarized: ${name} bets ${pct(strongB)} of strong hands and ${pct(weakB)} of weak ones, but only ${pct(medB)} of medium hands, which prefer to check and show down.` });
    else if (strongB > medB && medB > weakB) lines.push({ concept: 'valueBet', text: `Betting is value-heavy: the stronger the hand, the more it bets (${pct(strongB)} strong, ${pct(medB)} medium, ${pct(weakB)} weak).` });
    else lines.push({ concept: 'mixed', text: `${name} bets ${pct(a)} overall: ${pct(strongB)} of strong hands, ${pct(medB)} of medium, ${pct(weakB)} of weak.` });
  }
  return { player: p, freq, buckets, lines, potNow: P, facing, comboCount: total };
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards, normalizeCombo } from '../src/engine/cards.js';
import { evaluate, describe, categoryOf } from '../src/engine/evaluator.js';
import { parseRange, expandRange, formatRange, CLASS_INDEX } from '../src/engine/range.js';
import { Spot } from '../src/engine/spot.js';
import { Solver } from '../src/engine/solver.js';
import { explainHand, nodeSummary } from '../src/engine/explain.js';
import { PRESETS } from '../src/presets.js';

const ev = (s) => evaluate(parseCards(s));

test('hand categories', () => {
  assert.equal(categoryOf(ev('AhKhQhJhTh2c3d')), 8);
  assert.equal(categoryOf(ev('9c9d9h9s2c3d4h')), 7);
  assert.equal(categoryOf(ev('9c9d9hKsKc3d4h')), 6);
  assert.equal(categoryOf(ev('Ah9h5h3h2hKcKd')), 5);
  assert.equal(categoryOf(ev('Ah2c3d4h5s9c9d')), 4); // wheel
  assert.equal(categoryOf(ev('7c7d7h2s3c9dKh')), 3);
  assert.equal(categoryOf(ev('7c7dKhKs3c9d2h')), 2);
  assert.equal(categoryOf(ev('7c7dKhQs3c9d2h')), 1);
  assert.equal(categoryOf(ev('AcJdKhQs3c9d2h')), 0);
});

test('hand ordering and kickers', () => {
  assert.ok(ev('AsKd Ks8s4d5c2h') > ev('KhJd Ks8s4d5c2h'));     // kicker
  assert.ok(ev('6s3c Ks8s4d5c2h') > ev('AsAd Ks8s4d5c2h'));     // straight > pair
  assert.ok(ev('6s7c 8s9dTc2h3h') > ev('Ah2c 3d4h5s9cKd'));     // ten-high straight beats the wheel
  assert.equal(ev('2c3d AhKhQhJhTh'), ev('4c5d AhKhQhJhTh'));   // both play the board
  assert.equal(describe(ev('7c7dKhKs3c9d2h')), 'Two pair, kings and sevens');
  assert.equal(describe(ev('AhKhQhJhTh2c3d')), 'Royal flush');
});

test('range parsing', () => {
  const r = parseRange('TT+, ATs+, KQo, 22-44:0.5, AhKh');
  assert.equal(r.classes[CLASS_INDEX.get('TT')], 1);
  assert.equal(r.classes[CLASS_INDEX.get('99')], 0);
  assert.equal(r.classes[CLASS_INDEX.get('AKs')], 1);
  assert.equal(r.classes[CLASS_INDEX.get('A9s')], 0);
  assert.equal(r.classes[CLASS_INDEX.get('33')], 0.5);
  assert.equal(expandRange(parseRange('AKo')).length, 12);
  assert.equal(expandRange(parseRange('AA'), parseCards('As')).length, 3);
  assert.equal(formatRange(parseRange('TT+, ATs+, 22-44').classes), 'TT+, 44-22, ATs+');
  assert.throws(() => parseRange('AKx'));
  assert.equal(normalizeCombo('jc JH'), 'JhJc');
});

test('toy polarized river matches theory', () => {
  // IP has 6 combos of nuts (AA) and 4 of air (65s); OOP holds a pure bluff-catcher (QQ).
  // Pot-size all-in: IP should bluff 3 combos (1/3 of the betting range), OOP should call 50%.
  const spot = new Spot({ board: 'Ks 9d 4c 7h 2s', ranges: ['QQ', 'AA,65s'], pot: 10, stack: 10, betSizes: ['', ''], raiseSizes: '', allIn: true, maxRaises: 0 });
  const s = new Solver(spot);
  s.run(3000);
  const res = s.analyze();
  assert.ok(res.exploitability < 0.1, `exploitability ${res.exploitability}`);
  const ipNode = spot.tree.root.children[0];
  const n1 = spot.n[1];
  const bluffFreq = spot.hands[1].filter((h) => h.key.startsWith('6')).map((h) => ipNode.avg[1 * n1 + spot.keyIndex[1].get(h.key)]);
  for (const f of bluffFreq) assert.ok(Math.abs(f - 0.75) < 0.03, `bluff freq ${f}`);
  const callNode = ipNode.children[1];
  const n0 = spot.n[0];
  const callFreq = spot.hands[0].reduce((t, _, i) => t + callNode.avg[1 * n0 + i], 0) / n0;
  assert.ok(Math.abs(callFreq - 0.5) < 0.03, `call freq ${callFreq}`);
  assert.ok(Math.abs(res.ev[0] - 1) < 0.05 && Math.abs(res.ev[1] - 9) < 0.05);
});

test('presets solve and produce explanations', () => {
  for (const pr of PRESETS) {
    const spot = new Spot(pr.config);
    const s = new Solver(spot);
    s.run(400);
    const res = s.analyze();
    assert.ok(res.exploitability < 0.5, `${pr.id} exploitability ${res.exploitability}`);
    let node = spot.tree.root;
    for (const l of pr.line) node = node.children[node.actions.findIndex((a) => a.label === l)];
    assert.equal(node.player, pr.hero.player);
    const i = spot.keyIndex[node.player].get(normalizeCombo(pr.hero.hand));
    assert.ok(i != null, `${pr.id} hero hand in range`);
    const ex = explainHand(spot, node, i);
    assert.ok(ex.reasons.length >= 3);
    const sumFreq = ex.actions.reduce((t, a) => t + a.freq, 0);
    assert.ok(Math.abs(sumFreq - 1) < 1e-9);
    const ns = nodeSummary(spot, node);
    assert.ok(Math.abs(ns.freq.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  }
});

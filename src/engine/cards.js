// Card representation: id = rank * 4 + suit, rank 0..12 (2..A), suit 0..3 (c,d,h,s).

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';
export const SUIT_SYMBOLS = { c: '♣', d: '♦', h: '♥', s: '♠' };
export const RANK_NAMES = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king', 'ace'];
export const RANK_PLURALS = ['twos', 'threes', 'fours', 'fives', 'sixes', 'sevens', 'eights', 'nines', 'tens', 'jacks', 'queens', 'kings', 'aces'];

export const rankOf = (c) => c >> 2;
export const suitOf = (c) => c & 3;

export function parseCard(str) {
  if (typeof str !== 'string' || str.length !== 2) throw new Error(`Bad card "${str}"`);
  const r = RANKS.indexOf(str[0].toUpperCase());
  const s = SUITS.indexOf(str[1].toLowerCase());
  if (r < 0 || s < 0) throw new Error(`Bad card "${str}"`);
  return r * 4 + s;
}

export function cardStr(c) {
  return RANKS[rankOf(c)] + SUITS[suitOf(c)];
}

/** Parse "Ks9d4c" or "Ks 9d 4c" or "Ks,9d" into card ids. */
export function parseCards(str) {
  const clean = (str || '').replace(/[\s,]+/g, '');
  if (clean.length % 2 !== 0) throw new Error(`Cards "${str}" are malformed`);
  const out = [];
  for (let i = 0; i < clean.length; i += 2) out.push(parseCard(clean.slice(i, i + 2)));
  const seen = new Set();
  for (const c of out) {
    if (seen.has(c)) throw new Error(`Card ${cardStr(c)} appears twice`);
    seen.add(c);
  }
  return out;
}

/** Canonical combo string, higher card first: "AhKd". */
export function comboStr(c1, c2) {
  return c1 > c2 ? cardStr(c1) + cardStr(c2) : cardStr(c2) + cardStr(c1);
}

/** 169-class label of a combo: "AKs", "AKo", "QQ". */
export function comboClass(c1, c2) {
  let r1 = rankOf(c1), r2 = rankOf(c2);
  if (r1 < r2) [r1, r2] = [r2, r1];
  if (r1 === r2) return RANKS[r1] + RANKS[r2];
  return RANKS[r1] + RANKS[r2] + (suitOf(c1) === suitOf(c2) ? 's' : 'o');
}

/** "jcJH" / "Jc Jh" -> canonical "JhJc". Throws on bad input. */
export function normalizeCombo(str) {
  const cs = parseCards(str);
  if (cs.length !== 2) throw new Error('A hand is exactly two cards, e.g. "Ah Kd"');
  return comboStr(cs[0], cs[1]);
}

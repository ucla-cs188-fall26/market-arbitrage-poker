// Example river spots. Ranges are simplified estimates of how each player arrives at the river.
export const PRESETS = [
  {
    id: 'bluffcatch',
    title: 'Call or fold? Top pair facing a big bet',
    blurb: 'Single-raised pot, BB vs BTN. You check top pair; BTN fires a third barrel. Is it a call?',
    hero: { player: 0, hand: 'KhJd' },
    line: ['Check', 'Bet 15 (75%)'],
    config: {
      board: 'Ks8s 4d5c 2h',
      pot: 20,
      stack: 60,
      ranges: [
        // BB: check-called flop and turn
        'KJo-K9o, KJs-K9s, K7s-K6s, 88, 55, 44, 22, A8s, 98s, T8s, 87s, J8s, 76s, 65s, A5s, A4s, 63s, AsQs, AsJs, AsTs, Js9s, Ts9s, Qs9s, 9s7s, 99-JJ:0.5',
        // BTN: bet flop and turn
        'AA, KK, 88:0.5, 55:0.5, 44:0.5, AK, KQ, KTs, 76s, A3s, 63s, AsQs, AsJs, AsTs, AsTs, QsJs, QsTs, JsTs, Ts9s, Js9s, 9s7s, 7s6s, QJo:0.25, JTo:0.2, T9s:0.4',
      ],
      betSizes: ['33, 75', '33, 75, 125'],
      raiseSizes: '75',
      allIn: true,
      maxRaises: 2,
    },
  },
  {
    id: 'thinvalue',
    title: 'Thin value or check back?',
    blurb: 'BTN vs BB. BB checks the river to you and you hold jacks under the queen. Bet small, bet big or show down?',
    hero: { player: 1, hand: 'JcJh' },
    line: ['Check'],
    config: {
      board: 'Qh9c 5d3s 2c',
      pot: 16,
      stack: 80,
      ranges: [
        // BB: check-called flop, checked turn through, checks river
        'Q9s-Q2s, QTo-Q8o, 99:0.5, 55, 33, 22, A9s, K9s, T9s, J9s, 98s, 97s, 87s, 76s, A5s, 65s, 54s, 64s, TT:0.6, 88-66, JTs, KJs, A4s, A3s',
        // BTN: bet flop, checked back turn
        'QQ:0.3, 99:0.3, 55:0.3, AQ, KQ, QJs, QTs, A9s, K9s, J9s, T9s, JJ-TT, 88-66, AJs-ATs, KJs, KTs, JTs, 87s, 76s, A5s, A4s, KJo, A9o',
      ],
      betSizes: ['50', '33, 75, 150'],
      raiseSizes: '75',
      allIn: true,
      maxRaises: 2,
    },
  },
  {
    id: 'bluff',
    title: 'Which missed draw should bluff?',
    blurb: 'The heart draw missed and OOP checks to you. You have A♠J♠: ace-high, no pair. Bluff or give up? Compare it with A♥5♥.',
    hero: { player: 1, hand: 'AsJs' },
    line: ['Check'],
    config: {
      board: 'Th9h 4c2s Kd',
      pot: 24,
      stack: 76,
      ranges: [
        // OOP: check-called flop and turn
        'KTs, K9s, T9s, 99:0.4, 44, 22, AT, KJs, QTs, JTs, T8s, 98s, 97s, 87s, A9s, Q9s, J9s, 9h8h, TT:0.3, KhQh, KhJh, JhTh',
        // IP: bet flop and turn
        'KK:0.5, TT:0.4, 99:0.4, AK, KT, QJs, J8s, Ah5h, Ah4h, Ah3h, AhJh, AsJs, AhQh, QhJh, 8h7h, 7h6h, 6h5h, AT, QTs, JTs, T8s, AJs:0.5, 87s:0.6',
      ],
      betSizes: ['50', '50, 100'],
      raiseSizes: '75',
      allIn: true,
      maxRaises: 2,
    },
  },
];

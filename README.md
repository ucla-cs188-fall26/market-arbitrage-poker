# Rationale — a river poker solver that explains itself

Most solvers give you a grid of colours and a number. Rationale solves a heads-up no-limit
hold'em **river** spot to near-equilibrium (GTO) and then tells you, in plain language and with
numbers drawn from the solution, **why** each hand plays the way it does: pot odds versus your
equity, what your opponent's range is made of, how your blockers change it, whether a bet is
value or a bluff, and when two actions are close enough that the solver mixes them.

CS 188 (HCI), Fall 2026 · Woyu Wang, King Bi, Kaveh Malekzadeh

## Core scenario

1. Pick an example spot (or **Set up your own hand**: board, pot, stack, both ranges, bet sizes, your hand).
2. The app solves the river in about a second in your browser.
3. It jumps to your decision and shows the best play, the EV of every option, and a list of reasons.
4. Tap any action to play it and see the opponent's response, or tap any hand in the grid to see why
   that hand (yours or the opponent's) is played that way. Toggle **Explain terms** for beginner definitions.

## Install and run

Requirements: [Node.js](https://nodejs.org) 18 or newer and a modern browser (Chrome, Firefox, Safari, Edge).
There are no dependencies to install.

```bash
git clone https://github.com/ucla-cs188-fall26/market-arbitrage-poker.git
cd market-arbitrage-poker
npm start            # serves the app at http://localhost:5173
```

Open http://localhost:5173 in your browser. (Any static server works too, e.g. `python3 -m http.server 5173`.
Opening `index.html` directly from disk will not work because browsers block ES modules on `file://`.)

Run the tests:

```bash
npm test
```

The tests check the hand evaluator, range parser, that the solver reproduces the textbook answer for a
polarized toy game (bluff 1/3 of a pot-size bet, defend 50%), and that every preset solves and explains.

## Walkthrough of the example spots

| Spot | Your hand | What it teaches |
| --- | --- | --- |
| Call or fold? Top pair facing a big bet | K♥J♦ (OOP) | Pot odds, bluff-catching, bad blockers, MDF, mixed strategies |
| Thin value or check back? | J♥J♣ (IP) | Why a hand ahead 64% when called still checks: check-raises |
| Which missed draw should bluff? | A♠J♠ (IP) | Break-even fold rate, blockers, which bluffs the solver picks |

## How it works

```
src/engine/
  cards.js      card ids, parsing
  evaluator.js  7-card hand evaluator + plain-English hand names
  range.js      range notation (AA, TT+, ATs+, 22-55, AhKh, KQo:0.5) <-> 13x13 grid <-> combos
  tree.js       river betting tree from bet / raise sizes
  spot.js       board + ranges -> weighted combos; O(n) card-removal-aware showdown sums
  solver.js     vectorised CFR+ (alternating updates, linear averaging), exploitability, EV per action
  explain.js    reasons per hand and range-level summaries, all computed from the solution
src/ui/         plain JavaScript UI (no framework), range editor dialog
src/presets.js  example spots
```

* **Solver.** CFR+ over the whole range at once (one regret per hand per action). Terminal values use
  sorted-sweep tricks so each showdown is O(n) in the number of combos while still respecting card removal.
  It stops at 0.05% of the pot exploitability (or 4,000 iterations), which takes well under a second for
  ranges of a few hundred combos.
* **Explanations.** For the selected hand the engine computes: equity against the opponent's range at this
  node, its percentile in your own range, pot odds and MDF when facing a bet, the value / bluff split of the
  betting range and how your specific cards shift it (blockers), and for each bet size the opponent's fold
  rate, how often you are ahead when called, and the break-even fold rate. Reasons are picked and worded
  from those numbers; nothing is hand-written advice.

## Limits (prototype)

* River only. Turn and flop spots need chance nodes and are planned next.
* Ranges in the presets are estimates of how players arrive at the river, not solved preflop ranges.
* Bet sizes are limited to the ones you enter (more sizes make the tree bigger and slower).

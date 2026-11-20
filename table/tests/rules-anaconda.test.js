"use strict";

// Anaconda's hi-lo showdown states both the winning high AND low hands
// (previously computed locally and discarded by the engine -- see
// CLAUDE.md's "audit-driven implementation pass" / holistic-review
// entries).

const { load } = require("./harness");
const { makeChecker } = require("./check");

function run() {
  const { check, summary } = makeChecker();
  const { RulesAnaconda } = load(
    ["deck.js", "hand-evaluator.js", "chip-economy.js", "betting-engine.js", "rules-anaconda.js"],
    ["RulesAnaconda"]
  );
  const settings = { anteDollars: 0.5, raiseIncrementDollars: 0.25, maxBetDollars: 2 };

  const players = [
    { id: "p0", name: "Kevin", isHuman: true, wallet: { chips: 10000 } },
    { id: "p1", name: "Marisol", isHuman: false, wallet: { chips: 10000 } },
    { id: "p2", name: "Kai", isHuman: false, wallet: { chips: 10000 } },
  ];
  // createHandState(players, dealerIndex, settings, carriedPotChips, jokerCount, hiLo)
  const state = RulesAnaconda.createHandState(players, 0, settings, 0, 0, true);
  check("hiLo flag is set on state", state.hiLo === true);

  players[0].hand = [{ rank: "A", suit: "S" }, { rank: "A", suit: "H" }, { rank: "A", suit: "D" }, { rank: "2", suit: "C" }, { rank: "4", suit: "C" }];
  players[1].hand = [{ rank: "2", suit: "S" }, { rank: "3", suit: "H" }, { rank: "4", suit: "D" }, { rank: "5", suit: "S" }, { rank: "7", suit: "H" }];
  players[2].hand = [{ rank: "9", suit: "C" }, { rank: "9", suit: "D" }, { rank: "K", suit: "C" }, { rank: "Q", suit: "H" }, { rank: "J", suit: "D" }];
  RulesAnaconda.resolveShowdown(state);

  check("bestHighDescribed is set (trip Aces)", !!state.bestHighDescribed && state.bestHighDescribed.toLowerCase().includes("three of a kind"));
  check("bestLowDescribed is set (Marisol has the qualifying 2-3-4-5-7 low)", !!state.bestLowDescribed);
  check("the high-side log line includes the real description", state.log[state.log.length - 1].includes(state.bestHighDescribed));
  check("the high-side log line also includes the low description", state.log[state.log.length - 1].includes(state.bestLowDescribed));

  return summary("rules-anaconda");
}

if (require.main === module) process.exit(run());
module.exports = { run };

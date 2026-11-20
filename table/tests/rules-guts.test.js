"use strict";

// Deep or Double Screw (and the rest of the Guts family) showdown
// behavior: the winning hand gets described, not just the winner named
// (fixed after a direct user report -- see CLAUDE.md's "Guts family:
// state the winning hand..." entry).

const { load } = require("./harness");
const { makeChecker } = require("./check");

function run() {
  const { check, summary } = makeChecker();
  const { GutsRules, HandEvaluator, DEEP_OR_DOUBLE_SCREW_CONFIG } = load(
    ["deck.js", "hand-evaluator.js", "chip-economy.js", "betting-engine.js", "rules-guts.js", "game-configs-guts.js"],
    ["GutsRules", "HandEvaluator", "DEEP_OR_DOUBLE_SCREW_CONFIG"]
  );

  const players = [
    { id: "p0", name: "Kevin", isHuman: true, wallet: { chips: 10000 } },
    { id: "p1", name: "Marisol", isHuman: false, wallet: { chips: 10000 } },
    { id: "p2", name: "Kai", isHuman: false, wallet: { chips: 10000 } },
  ];
  const settings = { anteDollars: 0.5 };
  const cfg = Object.assign({}, DEEP_OR_DOUBLE_SCREW_CONFIG, { dummyHandEnabled: false, flipWildcardCount: 0 });
  const state = GutsRules.createRoundState(players, settings, cfg, 0);

  players[1].hand = [
    { rank: "A", suit: "S" }, { rank: "A", suit: "H" }, { rank: "A", suit: "D" },
    { rank: "4", suit: "C" }, { rank: "6", suit: "C" }, { rank: "8", suit: "C" }, { rank: "9", suit: "C" },
  ];
  players[0].hand = [
    { rank: "K", suit: "S" }, { rank: "Q", suit: "H" }, { rank: "J", suit: "D" },
    { rank: "8", suit: "S" }, { rank: "9", suit: "H" }, { rank: "4", suit: "D" }, { rank: "2", suit: "C" },
  ];
  players[2].hand = [
    { rank: "K", suit: "C" }, { rank: "Q", suit: "D" }, { rank: "7", suit: "D" },
    { rank: "9", suit: "S" }, { rank: "10", suit: "H" }, { rank: "5", suit: "C" }, { rank: "3", suit: "D" },
  ];
  state.players.forEach((p) => (state.stayDecisions[p.id] = true));
  GutsRules.resolveShowdown(state);

  check("Marisol is the winner", state.winnerId === "p1");
  const winnerHandDesc = HandEvaluator.describe(GutsRules.evaluateHand(state, players[1]));
  // lowestCardWild (Deep or Double Screw's always-on rule) turns her
  // lowest card (the 4) wild too, so trip Aces become quad Aces.
  check("winner's hand is boosted to Four of a Kind by the lowest-card-wild rule", winnerHandDesc.toLowerCase().includes("four of a kind"));
  check("showdown log line states the actual winning hand", state.log[state.log.length - 1].includes(winnerHandDesc));

  // Dummy hand: a lone stayer doesn't auto-win if the dummy beats them.
  const soloPlayers = [
    { id: "p0", name: "Kevin", isHuman: true, wallet: { chips: 10000 } },
    { id: "p1", name: "Marisol", isHuman: false, wallet: { chips: 10000 } },
  ];
  const soloCfg = Object.assign({}, DEEP_OR_DOUBLE_SCREW_CONFIG, { dummyHandEnabled: true, flipWildcardCount: 0 });
  const soloState = GutsRules.createRoundState(soloPlayers, settings, soloCfg, 0);
  if (soloState.dummyHand) {
    soloState.dummyHand.hand = [
      { rank: "K", suit: "S" }, { rank: "K", suit: "H" }, { rank: "K", suit: "D" }, { rank: "K", suit: "C" },
      { rank: "2", suit: "D" }, { rank: "3", suit: "C" }, { rank: "5", suit: "D" },
    ];
    soloPlayers[0].hand = [
      { rank: "7", suit: "S" }, { rank: "8", suit: "H" }, { rank: "9", suit: "D" },
      { rank: "10", suit: "S" }, { rank: "J", suit: "C" }, { rank: "4", suit: "D" }, { rank: "6", suit: "H" },
    ];
    soloState.stayDecisions["p0"] = true;
    soloState.stayDecisions["p1"] = false;
    GutsRules.resolveShowdown(soloState);
    check("a lone stayer who loses to the dummy hand does not auto-win", soloState.winnerId == null);
    check("the cycle continues when the dummy beats the lone stayer", soloState.cycleComplete === false);
  } else {
    check("dummy hand fits at this table size (2 players, 7-card deal)", false);
  }

  return summary("rules-guts");
}

if (require.main === module) process.exit(run());
module.exports = { run };

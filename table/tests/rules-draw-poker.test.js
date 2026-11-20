"use strict";

// Pair of Jacks, Trips to Win: a showdown states the actual winning
// hand, not the generic "Trips or better" qualifying threshold -- and a
// fold-out win (which never checked that threshold at all) states no
// hand description, rather than falsely implying Trips was checked.

const { load } = require("./harness");
const { makeChecker } = require("./check");

function run() {
  const { check, summary } = makeChecker();
  const { RulesDrawPoker } = load(
    ["deck.js", "hand-evaluator.js", "chip-economy.js", "betting-engine.js", "rules-draw-poker.js"],
    ["RulesDrawPoker"]
  );
  const settings = { anteDollars: 0.5, raiseIncrementDollars: 0.25, maxBetDollars: 2 };

  {
    const players = [
      { id: "p0", name: "Kevin", isHuman: true, wallet: { chips: 10000 } },
      { id: "p1", name: "Marisol", isHuman: false, wallet: { chips: 10000 } },
    ];
    const state = RulesDrawPoker.createHandState(players, 0, settings, 0);
    state.status = "finalBetting";
    players[0].hand = [{ rank: "K", suit: "S" }, { rank: "K", suit: "H" }, { rank: "K", suit: "D" }, { rank: "2", suit: "C" }, { rank: "4", suit: "C" }];
    players[1].hand = [{ rank: "3", suit: "S" }, { rank: "5", suit: "H" }, { rank: "7", suit: "D" }, { rank: "9", suit: "S" }, { rank: "J", suit: "H" }];
    RulesDrawPoker.advanceAfterFinalBetting(state);
    check("Kevin wins", state.winnerId === "p0");
    check("bestHandDescribed states Three of a Kind", state.bestHandDescribed && state.bestHandDescribed.toLowerCase().includes("three of a kind"));
    check("win log line includes the real hand description", state.log[state.log.length - 1].includes(state.bestHandDescribed));
  }

  {
    const players = [
      { id: "p0", name: "Kevin", isHuman: true, wallet: { chips: 10000 } },
      { id: "p1", name: "Marisol", isHuman: false, wallet: { chips: 10000 } },
    ];
    const state = RulesDrawPoker.createHandState(players, 0, settings, 0);
    state.status = "opening";
    players[0].hand = [{ rank: "J", suit: "S" }, { rank: "J", suit: "H" }, { rank: "2", suit: "C" }, { rank: "4", suit: "C" }, { rank: "6", suit: "D" }];
    RulesDrawPoker.submitBet(state, "p0", "raise", 0.25);
    RulesDrawPoker.submitBet(state, "p1", "fold", 0);
    check("fold-out win completes the hand", state.status === "complete");
    check(
      "fold-out win leaves bestHandDescribed null (the Trips-or-better bar was never actually checked)",
      state.bestHandDescribed == null
    );
  }

  return summary("rules-draw-poker");
}

if (require.main === module) process.exit(run());
module.exports = { run };

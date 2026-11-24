"use strict";

// 3-33's showdown: per-winner dollar split (payEvenSplit math) and the
// {lowResults, highResults} shape the UI relies on to show the actual
// winning low/high values, not just winner names (previously the most
// severe showdown-transparency gap in the app -- see CLAUDE.md).

const { load } = require("./harness");
const { makeChecker } = require("./check");

function run() {
  const { check, summary } = makeChecker();
  const { Rules333, ChipEconomy } = load(
    ["deck.js", "hand-evaluator.js", "chip-economy.js", "betting-engine.js", "target-sum-evaluator.js", "rules-333.js"],
    ["Rules333", "ChipEconomy"]
  );

  const settings = { anteDollars: 0.5, raiseIncrementDollars: 0.25, maxBetDollars: 2 };

  // Uneven 2-way high split: confirms the floor/remainder payout math
  // (one winner gets the extra odd chip) matches the reported scenario.
  {
    const players = [
      { id: "p0", name: "Kevin", isHuman: true, wallet: { chips: 10000 } },
      { id: "p1", name: "Kofi Boateng", isHuman: false, wallet: { chips: 10000 } },
      { id: "p2", name: "Kai Osei-Larsen", isHuman: false, wallet: { chips: 10000 } },
    ];
    const state = Rules333.createHandState(players, 0, settings, 0);
    state.pot = ChipEconomy.dollarsToChips(11.25);
    players[0].hand = [{ rank: "K", suit: "S" }, { rank: "Q", suit: "H" }, { rank: "3", suit: "D" }];
    players[1].hand = [{ rank: "3", suit: "C" }, { rank: "Q", suit: "D" }, { rank: "K", suit: "H" }];
    players[2].hand = [{ rank: "9", suit: "S" }, { rank: "9", suit: "H" }, { rank: "2", suit: "D" }];
    const beforeTotal = players.reduce((sum, p) => sum + p.wallet.chips, 0);
    Rules333.resolveShowdown(state);
    check("results carries a lowResults/highResults array per contender", Array.isArray(state.results.lowResults) && state.results.lowResults.length === 3);
    check("each result entry has {id, result:{value, distance}}", typeof state.results.lowResults[0].result.value === "number");
    const afterTotal = players.reduce((sum, p) => sum + p.wallet.chips, 0);
    check(
      "the full $11.25 pot was distributed into wallets (none left stuck in state.pot)",
      Math.abs(ChipEconomy.chipsToDollars(afterTotal - beforeTotal) - 11.25) < 0.001
    );
  }

  // A clean, known split so the exact winner-attribution and value shape
  // the UI reads (gvs.state.results.lowWinners/highWinners) is correct.
  {
    const players = [
      { id: "p0", name: "Kevin", isHuman: true, wallet: { chips: 10000 } },
      { id: "p1", name: "Marisol", isHuman: false, wallet: { chips: 10000 } },
    ];
    const state = Rules333.createHandState(players, 0, settings, 0);
    players[0].hand = [{ rank: "A", suit: "S" }, { rank: "A", suit: "H" }, { rank: "A", suit: "D" }]; // 3 low, 33 high
    players[1].hand = [{ rank: "K", suit: "S" }, { rank: "Q", suit: "H" }, { rank: "J", suit: "D" }]; // 30 both sides
    Rules333.resolveShowdown(state);
    check("Kevin wins both low and high with the triple-ace hand", state.results.lowWinners[0] === "p0" && state.results.highWinners[0] === "p0");
    const lowVal = state.results.lowResults.find((r) => r.id === "p0").result.value;
    const highVal = state.results.highResults.find((r) => r.id === "p0").result.value;
    check("low value is exactly 3 (aces low)", lowVal === 3);
    check("high value is exactly 33 (aces high)", highVal === 33);
  }

  // Real bug, reported directly after live play (2026-11-23): games.md
  // calls for a betting round after EACH of the 5 community reveals,
  // including the 5th -- this used to skip straight to showdown the
  // instant the 5th reveal happened, with no final betting round at all.
  {
    const players = [
      { id: "p0", name: "Kevin", isHuman: true, wallet: { chips: 10000 } },
      { id: "p1", name: "Marisol", isHuman: false, wallet: { chips: 10000 } },
      { id: "p2", name: "Nico", isHuman: false, wallet: { chips: 10000 } },
    ];
    const state = Rules333.createHandState(players, 0, settings, 0);
    // Deliberately avoid Ultima/matching-rank edge cases so every reveal
    // just opens a fresh betting round as expected.
    players.forEach((p) => (p.hand = [{ rank: "K", suit: "S" }, { rank: "Q", suit: "H" }, { rank: "J", suit: "D" }]));

    function closeBettingRound() {
      check("a betting round is open", state.status === "betting" && !!state.bettingRound);
      for (const p of players) {
        if (Rules333.getCurrentBettor(state) == null) break;
        Rules333.submitBet(state, Rules333.getCurrentBettor(state), "call", 0);
      }
      Rules333.advanceAfterBetting(state);
    }

    closeBettingRound(); // the deal's own opening round
    check("status moves to revealing after the opening round", state.status === "revealing");
    for (let i = 0; i < Rules333.TOTAL_ROUNDS; i++) {
      Rules333.revealNextCommunityCard(state);
      if (i < Rules333.TOTAL_ROUNDS - 1) {
        check(`reveal ${i + 1}: a betting round opens`, state.status === "betting");
        closeBettingRound();
        check(`reveal ${i + 1}: betting round closes back to revealing`, state.status === "revealing");
      } else {
        check("the 5th reveal also opens a betting round, not an immediate showdown", state.status === "betting" && state.results == null);
        closeBettingRound();
        check("showdown only happens once the 5th reveal's betting round closes", state.status === "complete" && state.results != null);
      }
    }
  }

  return summary("rules-333");
}

if (require.main === module) process.exit(run());
module.exports = { run };

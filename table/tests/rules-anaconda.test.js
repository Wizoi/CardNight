"use strict";

// Anaconda's hi-lo showdown states both the winning high AND low hands
// (previously computed locally and discarded by the engine -- see
// CLAUDE.md's "audit-driven implementation pass" / holistic-review
// entries).

const { load } = require("./harness");
const { makeChecker } = require("./check");

function run() {
  const { check, summary } = makeChecker();
  const { RulesAnaconda, HandEvaluator, Deck, AnacondaAIProfiles } = load(
    ["deck.js", "hand-evaluator.js", "chip-economy.js", "betting-engine.js", "ai-profiles.js", "rules-anaconda.js", "ai-anaconda-profiles.js"],
    ["RulesAnaconda", "HandEvaluator", "Deck", "AnacondaAIProfiles"]
  );
  const settings = { anteDollars: 0.5, raiseIncrementDollars: 0.25, maxBetDollars: 2 };

  // Real bug, reported directly after live play (2026-11-23): "I was passed
  // a joker, that is very unexpected." chooseDiscards' Joker-protection
  // comparator had its sign backwards, sorting a Joker to the FRONT of the
  // discard list (first to be passed away) instead of the back -- the
  // opposite of "never volunteer one ahead of a real card." Covers both
  // discard rounds (3 then 2) with a hand that has plenty of real,
  // ungrouped low cards a correct heuristic should prefer instead.
  {
    const hand = [
      { rank: "JOKER", suit: null },
      { rank: "2", suit: "C" },
      { rank: "4", suit: "D" },
      { rank: "7", suit: "H" },
      { rank: "K", suit: "S" },
      { rank: "K", suit: "H" },
      { rank: "9", suit: "D" },
    ];
    const discard1Idx = AnacondaAIProfiles.decideDiscard1({ hand });
    check("round 1's 3 discards never include the Joker", !discard1Idx.map((i) => hand[i].rank).includes("JOKER"));
    // decideDiscard2 always operates on a full 7-card hand in the real
    // game (the kept 4 PLUS 3 passed in from the right neighbor after
    // round 1's pass resolves, per games.md -- round 1 is a pass, not a
    // net discard, so hand size stays 7 until round 2's real discard).
    // Pad the kept 4 back up to 7 with plausible low, ungrouped cards
    // standing in for what a neighbor might pass, so this exercises the
    // same hand size decideDiscard2 is actually called with.
    const kept = hand.filter((_, i) => !discard1Idx.includes(i));
    const afterPass = kept.concat([
      { rank: "3", suit: "C" },
      { rank: "5", suit: "S" },
      { rank: "6", suit: "D" },
    ]);
    const discard2Idx = AnacondaAIProfiles.decideDiscard2({ hand: afterPass });
    check("round 2's 2 discards never include the Joker", !discard2Idx.map((i) => afterPass[i].rank).includes("JOKER"));
  }

  // Real bug, found during the 2026-11-23 archetype design review's
  // follow-up pass (not reported live, caught reading the code against
  // decideBet's own betting1 evaluation): chooseDiscards' rank-only
  // heuristic could discard the two cards that would have completed a
  // flush, settling for a lesser pair instead -- even though decideBet
  // had already bet the round on the flush that was about to be thrown
  // away. 7 cards 4h 5h 7h 9h Kh 2c 2d: the flush (4h 5h 7h 9h Kh) beats
  // any pair achievable by keeping the 2s, so a correct decideDiscard2
  // must discard the 2c/2d, not two of the hearts.
  {
    const hand = [
      { rank: "4", suit: "H" },
      { rank: "5", suit: "H" },
      { rank: "7", suit: "H" },
      { rank: "9", suit: "H" },
      { rank: "K", suit: "H" },
      { rank: "2", suit: "C" },
      { rank: "2", suit: "D" },
    ];
    const discard2Idx = AnacondaAIProfiles.decideDiscard2({ hand });
    const discardedRanks = discard2Idx.map((i) => hand[i].rank).sort();
    check("decideDiscard2 keeps the flush, discarding the pair of 2s instead of breaking it", discardedRanks.join(",") === "2,2");
    const kept = hand.filter((_, i) => !discard2Idx.includes(i));
    const keptEval = HandEvaluator.bestHand(kept.map((c) => ({ rank: c.rank, suit: c.suit, isWild: false })));
    check("the kept 5 cards actually score as a flush", keptEval.category === HandEvaluator.CATEGORY.FLUSH);
  }

  // presentationStyle (design review follow-up, 2026-11-24): Live Wire's
  // "flaunt" reverses the default conceal order; the Wall's "mask"
  // shuffles it randomly instead; a default profile keeps the original
  // conceal order unchanged.
  {
    const hand = [
      { rank: "2", suit: "C" },
      { rank: "7", suit: "D" },
      { rank: "K", suit: "S" },
      { rank: "K", suit: "H" },
      { rank: "JOKER", suit: null },
    ];
    const concealOrder = AnacondaAIProfiles.decideArrangeOrder({ hand }, null);
    check("with no profile, the order is the original conceal order (groups and Joker revealed last)", hand[concealOrder[concealOrder.length - 1]].rank === "JOKER");

    const liveWireProfile = { bluffSizing: "big" };
    const flauntOrder = AnacondaAIProfiles.decideArrangeOrder({ hand }, liveWireProfile);
    check("Live Wire's flaunt order is the exact reverse of the conceal order", flauntOrder.join(",") === concealOrder.slice().reverse().join(","));
    check("Live Wire's flaunt order reveals the Joker FIRST, not last", hand[flauntOrder[0]].rank === "JOKER");

    const wallProfile = { bluffSizing: "mirror" };
    const maskOrders = new Set();
    for (let i = 0; i < 40; i++) maskOrders.add(AnacondaAIProfiles.decideArrangeOrder({ hand }, wallProfile).join(","));
    check("the Wall's mask order produces more than one distinct ordering across trials (genuinely random, not a fixed reversal)", maskOrders.size > 1);

    const defaultProfile = {};
    check(
      "a profile with no bluffSizing (default 'small') keeps the original conceal order",
      AnacondaAIProfiles.decideArrangeOrder({ hand }, defaultProfile).join(",") === concealOrder.join(",")
    );
  }

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

  // Real design gap, raised directly by the user (2026-11-23): a betting
  // round after the 5th/last "roll your own" reveal has nothing left to
  // bet on, since every hand at the table is already fully face up by
  // then (and this engine's hi-lo split is fully automatic, with no
  // secret declare that could still be hidden). Reveals 1-4 still each
  // open a real betting round; only the 5th skips straight to showdown.
  {
    const revealState = RulesAnaconda.createHandState(players, 0, settings, 0, 0, false);
    revealState.status = "revealing";
    for (let round = 1; round <= 3; round++) {
      RulesAnaconda.resolveRevealRound(revealState);
      check(`reveal ${round}/5 opens a betting round`, revealState.status === "revealingBet" && !!revealState.bettingRound);
      revealState.status = "revealing"; // simulate the round closing (skip the actual bet calls, not the point of this check)
    }
    RulesAnaconda.resolveRevealRound(revealState); // reveal 4/5
    check("reveal 4/5 still opens a betting round", revealState.status === "revealingBet" && !!revealState.bettingRound);
    revealState.status = "revealing";
    RulesAnaconda.resolveRevealRound(revealState); // reveal 5/5
    check("reveal 5/5 (the last) skips betting and goes straight to showdown", revealState.status === "complete" && revealState.bettingRound === null);
    check("reveal 5/5 actually resolved a real winner, not a no-op", Array.isArray(revealState.winnerIds) && revealState.winnerIds.length > 0);
  }

  return summary("rules-anaconda");
}

if (require.main === module) process.exit(run());
module.exports = { run };

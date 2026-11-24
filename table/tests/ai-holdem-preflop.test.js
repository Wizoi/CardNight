"use strict";

// Real bug, reported directly after live play (2026-11-23): "2 folded
// before the flop!" against Omaha, confirmed by a screenshot -- two AI
// seats folded preflop facing a cheap $1 call with zero board cards shown.
// worthContinuing's fold gate used to scale by `streetsLeft` (a street
// COUNT: 3 preflop), badly under-crediting the flop's own jump of 3 new
// community cards at once -- see ai-holdem-profiles.js's cardsStillToReveal.

const { load } = require("./harness");
const { makeChecker } = require("./check");

function run() {
  const { check, summary } = makeChecker();
  const { HandEvaluator, HoldemAIProfiles } = load(
    ["deck.js", "hand-evaluator.js", "ai-profiles.js", "ai-holdem-profiles.js"],
    ["HandEvaluator", "HoldemAIProfiles"],
    {
      HoldemRules: {
        bestHighHand: () => ({ category: -1 }),
        maxRaiseDollars: () => 0,
      },
    }
  );

  // A tight-ish profile and a genuinely unpaired 4-card hand (the norm, not
  // the exception, for an Omaha-style deal) facing a small preflop bet.
  const profile = { name: "test", chancePerCard: 0.3, raiseWhenLeading: false, bluffFrequency: 0 };
  const player = { id: "p0", hand: [{ rank: "4", suit: "H" }, { rank: "6", suit: "H" }, { rank: "Q", suit: "C" }, { rank: "7", suit: "D" }] };
  const state = {
    streetIndex: 0, // preflop
    pot: 300,
    players: [player],
    bettingRound: { currentBetChips: 200, committed: { p0: 100 }, raiseCounts: {} },
    raiseIncrementDollars: 0.25,
  };

  const decision = HoldemAIProfiles.decideBet(player, state, profile);
  check("an unpaired hand no longer folds preflop facing a cheap call", decision.action !== "fold");

  // The same hand, same profile, on the river (nothing left to improve):
  // the fold gate should still bind normally once there's truly no more
  // information coming -- this fix only corrects preflop's own
  // under-credited jump, it doesn't disable folding altogether.
  const riverState = { ...state, streetIndex: 3 };
  const riverDecision = HoldemAIProfiles.decideBet(player, riverState, profile);
  check("the same still-unpaired hand folds on the river facing a bet", riverDecision.action === "fold");

  return summary("ai-holdem-preflop");
}

if (require.main === module) process.exit(run());
module.exports = { run };

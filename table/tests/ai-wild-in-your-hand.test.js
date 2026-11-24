"use strict";

// Real bug, reported directly after live play (2026-11-23): "hardly showed
// any flipups yet - why did everyone drop out???" -- a screenshot showed
// both AI seats folding at the very first pyramid row, before Row 2/3 (more
// wild ranks) ever revealed. decideRowBet used to apply the exact same bar
// as the final declare even though it's a cheap, informational 50c call,
// not the real money decision -- see ai-wild-in-your-hand-profiles.js.

const { load } = require("./harness");
const { makeChecker } = require("./check");

function run() {
  const { check, summary } = makeChecker();
  const { HandEvaluator } = load(["deck.js", "hand-evaluator.js"], ["HandEvaluator"]);

  // Stub WildInYourHandRules.evaluateHand so this test is self-contained --
  // the point here is the bar math in ai-wild-in-your-hand-profiles.js, not
  // the pyramid-wildness engine itself. A hand exactly 1 category above the
  // profile's declare bar: clears the loosened bar at Row 1 AND Row 2 (0
  // and 1 tiers of looseness), but falls back under the full, un-loosened
  // bar by Row 3 and at the real declare.
  const stubbedHand = { category: HandEvaluator.CATEGORY.TWO_PAIR, tiebreakers: [9] };
  const { WildInYourHandAIProfiles } = load(
    ["deck.js", "hand-evaluator.js", "chip-economy.js", "ai-profiles.js", "ai-wild-in-your-hand-profiles.js"],
    ["WildInYourHandAIProfiles"],
    { WildInYourHandRules: { evaluateHand: () => stubbedHand } }
  );

  // gutsPotRiskSensitivity: 0 and bluffFrequency: 0 keep this test focused
  // on the row-bet-vs-declare looseness it was originally written to cover
  // (2026-11-23, design review finding #5 added both fields to real
  // profiles' own potRiskShift/bluff-stay behavior -- see
  // ai-loss-aversion... ai-guts-pot-risk.test.js for THOSE checks).
  const profile = { name: "test", gutsMinCategoryToStay: HandEvaluator.CATEGORY.PAIR, gutsPotRiskSensitivity: 0, bluffFrequency: 0 };
  const gameConfig = { categoryShift: 2 };
  const player = { id: "p0", hand: [] };

  const state0 = { gameConfig, rowIndex: 0, anteDollars: 0.5, antePoolChips: 2 };
  const state1 = { gameConfig, rowIndex: 1, anteDollars: 0.5, antePoolChips: 2 };
  const state2 = { gameConfig, rowIndex: 2, anteDollars: 0.5, antePoolChips: 2 };

  check("Row 1 (2 rows still to come): worth the cheap call under the fully loosened bar", WildInYourHandAIProfiles.decideRowBet(player, state0, profile) === true);
  check("Row 2 (1 row still to come): still worth it, partially loosened", WildInYourHandAIProfiles.decideRowBet(player, state1, profile) === true);
  check("Row 3 (nothing left to reveal): back to the full, un-loosened bar -- folds", WildInYourHandAIProfiles.decideRowBet(player, state2, profile) === false);
  check("decideDeclare always uses the full bar regardless of rowIndex", WildInYourHandAIProfiles.decideDeclare(player, state0, profile) === false);

  return summary("ai-wild-in-your-hand");
}

if (require.main === module) process.exit(run());
module.exports = { run };

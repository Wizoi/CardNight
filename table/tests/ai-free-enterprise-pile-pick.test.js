"use strict";

// Free Enterprise's Enterprise-pile AI pick (design review follow-up,
// 2026-11-24). Real bug: the old code's own comment claimed it "picks
// the CHEAPEST pile position that actually improves the hand... ties
// broken toward cheaper," but it actually picked the single STRONGEST
// result regardless of price, and counted a kicker-only improvement
// (same category, better tiebreaker) as worth buying at any price.
//
// Fixed by reusing two existing fields: buyWildOnlyOnCategoryGain skips
// a kicker-only candidate; lossAversion >= 0.75 makes a profile buy the
// CHEAPEST position among those reaching the best achievable CATEGORY
// (not necessarily the single best overall result) -- a deliberate
// trade-off of marginal tiebreaker strength for cost. Profiles below
// that threshold still buy the single strongest result regardless of
// price, matching the original (if mis-described) behavior.

const { load } = require("./harness");
const { makeChecker } = require("./check");

function run() {
  const { check, summary } = makeChecker();
  const { AIProfiles, StudAIProfiles, StudRules, ChipEconomy } = load(
    [
      "deck.js", "hand-evaluator.js", "chip-economy.js", "target-sum-evaluator.js", "betting-engine.js",
      "ai-profiles.js", "baseball-family-wildcards.js", "rules-stud.js", "ai-stud-profiles.js",
    ],
    ["AIProfiles", "StudAIProfiles", "StudRules", "ChipEconomy"]
  );

  function makeState(enterprisePile) {
    return {
      gameConfig: { enterprisePile: { priceScheduleDollars: [1, 2, 3], finalRoundMultiplier: 2 } },
      streetIndex: 0,
      streets: [1, 2, 3, 4], // length 4, streetIndex 0 is not the final street
      enterprisePile,
    };
  }

  function makePlayer(hand, walletDollars) {
    return { hand, wallet: { chips: ChipEconomy.dollarsToChips(walletDollars) } };
  }

  // --- Price-conscious (lossAversion >= 0.75) buys the cheapest position
  // among those reaching the best achievable CATEGORY, even when a
  // pricier position would make a strictly stronger hand of the same
  // category. ---
  {
    const hand = [{ rank: "4", suit: "C" }, { rank: "7", suit: "H" }]; // unpaired 2-card starting hand
    const pile = [
      { rank: "4", suit: "D" }, // position 0 ($1): pairs the 4s -> PAIR[4,7]
      { rank: "7", suit: "D" }, // position 1 ($2): pairs the 7s -> PAIR[7,4], strictly better than position 0
      { rank: "2", suit: "S" }, // position 2 ($3): no pair at all -> HIGH_CARD, a weaker category
    ];
    const state = makeState(pile);

    const balanced = AIProfiles.profileFor("balanced");
    check("balanced has lossAversion >= 0.75 (price-conscious)", balanced.lossAversion >= 0.75);
    const balancedDecision = StudAIProfiles.decideEnterpriseChoice(makePlayer(hand.slice(), 10), state, balanced);
    check("price-conscious balanced buys the CHEAPEST pair (position 0), not the stronger/pricier one", balancedDecision.action === "buy" && balancedDecision.position === 0);

    const liveWire = AIProfiles.profileFor("live-wire");
    check("live-wire has lossAversion 0 (not price-conscious)", liveWire.lossAversion === 0);
    const liveWireDecision = StudAIProfiles.decideEnterpriseChoice(makePlayer(hand.slice(), 10), state, liveWire);
    check("non-price-conscious live-wire buys the STRONGEST pair (position 1) regardless of price", liveWireDecision.action === "buy" && liveWireDecision.position === 1);
  }

  // --- buyWildOnlyOnCategoryGain skips a kicker-only improvement, buying
  // the one position that's a genuine category jump instead. ---
  {
    const hand = [{ rank: "4", suit: "C" }, { rank: "4", suit: "D" }]; // pair of 4s
    const pile = [
      { rank: "5", suit: "D" }, // position 0 ($1): kicker only -- still PAIR, just a better kicker
      { rank: "4", suit: "S" }, // position 1 ($2): a real category jump -- TRIPS
      { rank: "9", suit: "H" }, // position 2 ($3): kicker only, an even better kicker than position 0
    ];
    const state = makeState(pile);

    const calculator = AIProfiles.profileFor("the-calculator");
    check("the Calculator profile resolves and has buyWildOnlyOnCategoryGain", !!calculator && !!calculator.buyWildOnlyOnCategoryGain);
    const decision = StudAIProfiles.decideEnterpriseChoice(makePlayer(hand.slice(), 10), state, calculator);
    check("buyWildOnlyOnCategoryGain skips both kicker-only positions, buying the real category jump (position 1, TRIPS)", decision.action === "buy" && decision.position === 1);

    const liveWire = AIProfiles.profileFor("live-wire");
    const liveWireDecision = StudAIProfiles.decideEnterpriseChoice(makePlayer(hand.slice(), 10), state, liveWire);
    check("a profile without buyWildOnlyOnCategoryGain still takes a kicker-only improvement when it's the strongest available", liveWireDecision.action === "buy");
  }

  // --- Affordability: a candidate the player can't afford is skipped
  // entirely, even if it would otherwise be picked. ---
  {
    const hand = [{ rank: "4", suit: "C" }, { rank: "4", suit: "D" }];
    const pile = [
      { rank: "9", suit: "H" }, // position 0 ($1): a real improvement, affordable
      { rank: "4", suit: "S" }, // position 1 ($2): the real category jump (TRIPS), but priced above the wallet below
      { rank: "2", suit: "S" }, // position 2 ($3): also unaffordable
    ];
    const state = makeState(pile);
    const balanced = AIProfiles.profileFor("balanced");
    const decision = StudAIProfiles.decideEnterpriseChoice(makePlayer(hand.slice(), 1), state, balanced); // only $1 in the wallet
    check("a candidate priced above the wallet is excluded, falling back to the one affordable improvement", decision.action === "buy" && decision.position === 0);
  }

  return summary("ai-free-enterprise-pile-pick");
}

if (require.main === module) process.exit(run());
module.exports = { run };

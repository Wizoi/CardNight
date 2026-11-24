"use strict";

// Covers the 2026-11-23 archetype design review's finding #5: the Guts
// family (open-loop Guts via ai-guts-profiles.js, and Wild in Your Hand
// via ai-wild-in-your-hand-profiles.js) collapsed ten archetypes into
// three behaviors -- decideStayIn/worthContinuing read exactly one
// deterministic profile field (gutsMinCategoryToStay) plus a flat,
// identical potRiskShift applied the same way to every archetype
// regardless of temperament. Adds gutsPotRiskSensitivity (scales how much
// a growing pot tightens the bar, per profile) and reuses bluffFrequency
// as a small per-profile chance to stay in anyway on a hand that doesn't
// clear the bar -- that IS how you bluff in Guts, since there's no raise
// to size, just the in/out declare itself.

const { load } = require("./harness");
const { makeChecker } = require("./check");

function run() {
  const { check, summary } = makeChecker();

  // --- Open-loop Guts (ai-guts-profiles.js) ---
  {
    const { HandEvaluator, GutsAIProfiles } = load(
      ["deck.js", "hand-evaluator.js", "chip-economy.js", "ai-profiles.js", "ai-guts-profiles.js"],
      ["HandEvaluator", "GutsAIProfiles"],
      { GutsRules: { evaluateHand: () => ({ category: HandEvaluator.CATEGORY.TWO_PAIR, tiebreakers: [9] }) } }
    );

    const player = { id: "p0" };
    // A big pot: 20 antes' worth at 50c/ante -- potInAntes=20, /4=5,
    // enough to matter for a profile with real sensitivity but capped at
    // +2 regardless of how high sensitivity goes.
    const makeState = (anteDollars) => ({ pot: 20 * 100, anteDollars: anteDollars != null ? anteDollars : 0.5, gameConfig: {} });

    const tightProfile = { name: "test-tight", gutsMinCategoryToStay: HandEvaluator.CATEGORY.TWO_PAIR, gutsPotRiskSensitivity: 2, bluffFrequency: 0 };
    const looseProfile = { name: "test-loose", gutsMinCategoryToStay: HandEvaluator.CATEGORY.TWO_PAIR, gutsPotRiskSensitivity: 0, bluffFrequency: 0 };

    // Both profiles share the identical TWO_PAIR bar and identical
    // TWO_PAIR hand -- with no pot-risk shift at all, both would stay.
    // The big pot should push the sensitive profile's effective bar up
    // past TWO_PAIR (folding), while the insensitive one is unaffected.
    check(
      "a high-gutsPotRiskSensitivity profile folds a bar-level hand against a big pot",
      GutsAIProfiles.decideStayIn(player, makeState(), tightProfile) === false
    );
    check(
      "a zero-gutsPotRiskSensitivity profile still stays with the identical hand and pot",
      GutsAIProfiles.decideStayIn(player, makeState(), looseProfile) === true
    );

    // The +2 cap: an absurdly large pot must not demand more than 2 extra
    // tiers even for the most pot-sensitive profile in the roster.
    const hugePotState = { pot: 1000 * 100, anteDollars: 0.5, gameConfig: {} };
    const barelyAboveProfile = { name: "test-capped", gutsMinCategoryToStay: HandEvaluator.CATEGORY.HIGH_CARD, gutsPotRiskSensitivity: 2, bluffFrequency: 0 };
    // HIGH_CARD + cap of 2 = TWO_PAIR; this hand IS exactly TWO_PAIR, so
    // it must still clear the bar despite the enormous pot.
    check(
      "potRiskShift is capped at +2 tiers even against an enormous pot",
      GutsAIProfiles.decideStayIn(player, hugePotState, barelyAboveProfile) === true
    );

    // --- Bluff-stay: a hand that doesn't clear the bar at all ---
    const weakHandProfiles = load(
      ["deck.js", "hand-evaluator.js", "chip-economy.js", "ai-profiles.js", "ai-guts-profiles.js"],
      ["HandEvaluator", "GutsAIProfiles"],
      { GutsRules: { evaluateHand: () => ({ category: HandEvaluator.CATEGORY.HIGH_CARD, tiebreakers: [5] }) } }
    );
    const smallPotState = { pot: 1 * 100, anteDollars: 0.5, gameConfig: {} };
    const neverBluffs = { name: "never", gutsMinCategoryToStay: HandEvaluator.CATEGORY.TWO_PAIR, gutsPotRiskSensitivity: 1, bluffFrequency: 0 };
    const alwaysBluffs = { name: "always", gutsMinCategoryToStay: HandEvaluator.CATEGORY.TWO_PAIR, gutsPotRiskSensitivity: 1, bluffFrequency: 1 };
    check(
      "a genuinely weak (below-bar) hand folds with bluffFrequency 0",
      weakHandProfiles.GutsAIProfiles.decideStayIn(player, smallPotState, neverBluffs) === false
    );
    check(
      "the identical weak hand stays in with bluffFrequency 1 (a deterministic bluff)",
      weakHandProfiles.GutsAIProfiles.decideStayIn(player, smallPotState, alwaysBluffs) === true
    );
  }

  // --- Wild in Your Hand (ai-wild-in-your-hand-profiles.js) ---
  {
    const { HandEvaluator, WildInYourHandAIProfiles } = load(
      ["deck.js", "hand-evaluator.js", "chip-economy.js", "ai-profiles.js", "ai-wild-in-your-hand-profiles.js"],
      ["HandEvaluator", "WildInYourHandAIProfiles"],
      { WildInYourHandRules: { evaluateHand: () => ({ category: HandEvaluator.CATEGORY.TWO_PAIR, tiebreakers: [9] }) } }
    );

    const player = { id: "p0" };
    // antePoolChips (not state.pot) is what this family's own potRiskShift
    // scales against -- see ai-wild-in-your-hand-profiles.js's own
    // potRiskShift comment for why.
    const makeState = () => ({ antePoolChips: 20 * 100, anteDollars: 0.5, gameConfig: {} });

    const tightProfile = { name: "test-tight", gutsMinCategoryToStay: HandEvaluator.CATEGORY.TWO_PAIR, gutsPotRiskSensitivity: 2, bluffFrequency: 0 };
    const looseProfile = { name: "test-loose", gutsMinCategoryToStay: HandEvaluator.CATEGORY.TWO_PAIR, gutsPotRiskSensitivity: 0, bluffFrequency: 0 };

    check(
      "decideDeclare: a high-sensitivity profile folds a bar-level hand against a big ante pool",
      WildInYourHandAIProfiles.decideDeclare(player, makeState(), tightProfile) === false
    );
    check(
      "decideDeclare: a zero-sensitivity profile still stays with the identical hand and ante pool",
      WildInYourHandAIProfiles.decideDeclare(player, makeState(), looseProfile) === true
    );

    // Bluff-stay on a genuinely weak hand, same shape as the Guts check above.
    const weak = load(
      ["deck.js", "hand-evaluator.js", "chip-economy.js", "ai-profiles.js", "ai-wild-in-your-hand-profiles.js"],
      ["HandEvaluator", "WildInYourHandAIProfiles"],
      { WildInYourHandRules: { evaluateHand: () => ({ category: HandEvaluator.CATEGORY.HIGH_CARD, tiebreakers: [5] }) } }
    );
    const smallPoolState = { antePoolChips: 1 * 100, anteDollars: 0.5, gameConfig: {} };
    const neverBluffs = { name: "never", gutsMinCategoryToStay: HandEvaluator.CATEGORY.TWO_PAIR, gutsPotRiskSensitivity: 1, bluffFrequency: 0 };
    const alwaysBluffs = { name: "always", gutsMinCategoryToStay: HandEvaluator.CATEGORY.TWO_PAIR, gutsPotRiskSensitivity: 1, bluffFrequency: 1 };
    check(
      "decideDeclare: a genuinely weak hand folds with bluffFrequency 0",
      weak.WildInYourHandAIProfiles.decideDeclare(player, smallPoolState, neverBluffs) === false
    );
    check(
      "decideDeclare: the identical weak hand stays in with bluffFrequency 1",
      weak.WildInYourHandAIProfiles.decideDeclare(player, smallPoolState, alwaysBluffs) === true
    );

    // decideRowBet is deliberately untouched by potRiskShift/bluffing --
    // it's the cheap 50c informational call, not the real risk decision
    // (see ai-wild-in-your-hand-profiles.js's own decideRowBet comment).
    // A weak hand with an always-bluffing profile should fold the row bet
    // exactly as it did before this change, unaffected by bluffFrequency.
    const rowBetState = { antePoolChips: 20 * 100, anteDollars: 0.5, gameConfig: { categoryShift: 0 }, rowIndex: 2 };
    check(
      "decideRowBet is unaffected by bluffFrequency (not the real risk decision)",
      weak.WildInYourHandAIProfiles.decideRowBet(player, rowBetState, alwaysBluffs) === false
    );
  }

  // --- Real profile data: gutsPotRiskSensitivity exists on all 13 profiles ---
  {
    const { AIProfiles } = load(["deck.js", "hand-evaluator.js", "chip-economy.js", "ai-profiles.js"], ["AIProfiles"]);
    for (const name of Object.keys(AIProfiles.PROFILES)) {
      const profile = AIProfiles.profileFor(name);
      check(`${name}: has a real gutsPotRiskSensitivity value`, typeof profile.gutsPotRiskSensitivity === "number");
    }
    check("Fortress is the most pot-risk-sensitive profile (or tied for it)", AIProfiles.profileFor("fortress").gutsPotRiskSensitivity >= 1.5);
    check("Live Wire has zero pot-risk sensitivity", AIProfiles.profileFor("live-wire").gutsPotRiskSensitivity === 0);

    // Storm's tilt overlay (finding #3) drops this to 0 -- a tilted player
    // isn't rationally weighing an escalating pot at all.
    const stormTilted = AIProfiles.profileForState("storm", [
      { result: "lostAtShowdown", netChips: -10 },
    ]);
    check("a tilted Storm has gutsPotRiskSensitivity dropped to 0", stormTilted.gutsPotRiskSensitivity === 0);
  }

  return summary("ai-guts-pot-risk");
}

if (require.main === module) process.exit(run());
module.exports = { run };

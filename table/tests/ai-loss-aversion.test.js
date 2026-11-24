"use strict";

// Covers the 2026-11-23 archetype design review's finding #4: no family's
// fold decision scaled with the size of the bet, so the tightest archetype
// (Fortress, lossAversion ~2) played like a calling station facing an
// unlimited hold'em bet with any lone pair, exactly like the loosest
// (Live Wire, lossAversion 0). AIProfiles.callWorthyCategoryFor raises the
// call-worthy bar by floor(lossAversion * toCall / potBeforeCall) tiers,
// wired into hold'em, community stud, Game of Life, and Anaconda's shared
// worthContinuing-shaped fold checks. Also covers the incidental mechanics
// bug fixed alongside it: Anaconda's own hand is fully fixed from the
// second discard onward (the 5 reveal rounds after that only change what
// OPPONENTS see), so crediting "reveals left" as chances to improve a
// fixed hand was never correct there, regardless of archetype.

const { load } = require("./harness");
const { makeChecker } = require("./check");

function run() {
  const { check, summary } = makeChecker();

  const fortress = { name: "fortress", chancePerCard: 0.3, lossAversion: 2, raiseWhenLeading: false, bluffFrequency: 0 };
  const liveWire = { name: "live-wire", chancePerCard: 1.8, lossAversion: 0, raiseWhenLeading: true, bluffFrequency: 0, raiseMinCategory: 0 };

  // Pot-sized bet: toCall === pot. Fortress's lossAversion=2 shifts the
  // PAIR bar up 2 tiers to TRIPS (floor(2*200/200)=2); Live Wire's
  // lossAversion=0 leaves the bar at PAIR untouched.
  const potSizedBet = { toCallChips: 200, pot: 200 };

  // --- Hold'em ---
  {
    const { HandEvaluator, HoldemAIProfiles } = load(["deck.js", "hand-evaluator.js", "ai-profiles.js", "ai-holdem-profiles.js"], ["HandEvaluator", "HoldemAIProfiles"], {
      HoldemRules: { bestHighHand: () => ({ category: HandEvaluator.CATEGORY.PAIR }), maxRaiseDollars: () => 0 },
    });
    const player = { id: "p0", hand: [] };
    const makeState = () => ({
      streetIndex: 0,
      pot: potSizedBet.pot,
      players: [player],
      bettingRound: { currentBetChips: potSizedBet.toCallChips, committed: { p0: 0 }, raiseCounts: {} },
      raiseIncrementDollars: 0.25,
    });
    const fortressDecision = HoldemAIProfiles.decideBet(player, makeState(), fortress);
    check("hold'em: Fortress folds a lone pair to a pot-sized bet", fortressDecision.action === "fold");
    const liveWireDecision = HoldemAIProfiles.decideBet(player, makeState(), liveWire);
    check("hold'em: Live Wire does NOT fold the same lone pair to the same bet", liveWireDecision.action !== "fold");
  }

  // --- Community stud (Cincinnati/Criss Cross) ---
  {
    const { HandEvaluator, CommunityStudAIProfiles } = load(["deck.js", "hand-evaluator.js", "ai-profiles.js", "ai-community-stud-profiles.js"], ["HandEvaluator", "CommunityStudAIProfiles"], {
      CommunityStudRules: { evaluateBestHand: () => ({ category: HandEvaluator.CATEGORY.PAIR }), maxRaiseDollars: () => 0 },
    });
    const player = { id: "p0" };
    const makeState = () => ({
      pot: potSizedBet.pot,
      players: [player],
      bettingRound: { currentBetChips: potSizedBet.toCallChips, committed: { p0: 0 }, raiseCounts: {} },
      communityCards: [1, 2, 3, 4, 5],
      revealIndex: 3, // 2 reveals left -- enough runway that the tightened bar, not a bare 0-left auto-fold, is what's being tested
      gameConfig: {},
      raiseIncrementDollars: 0.25,
    });
    const fortressDecision = CommunityStudAIProfiles.decideBet(player, makeState(), fortress);
    check("community stud: Fortress folds a lone pair to a pot-sized bet", fortressDecision.action === "fold");
    const liveWireDecision = CommunityStudAIProfiles.decideBet(player, makeState(), liveWire);
    check("community stud: Live Wire does NOT fold the same lone pair to the same bet", liveWireDecision.action !== "fold");
  }

  // --- Game of Life ---
  {
    const { HandEvaluator, GameOfLifeAIProfiles } = load(["deck.js", "hand-evaluator.js", "ai-profiles.js", "ai-game-of-life-profiles.js"], ["HandEvaluator", "GameOfLifeAIProfiles"], {
      RulesGameOfLife: { evaluatePlayerHand: () => ({ category: HandEvaluator.CATEGORY.PAIR }), maxRaiseDollars: () => 0 },
    });
    const player = { id: "p0" };
    const makeState = () => ({
      pot: potSizedBet.pot,
      players: [player],
      bettingRound: { currentBetChips: potSizedBet.toCallChips, committed: { p0: 0 }, raiseCounts: {} },
      flipsDone: 4, // 6 flips left -- enough runway, same reasoning as community stud above
      raiseIncrementDollars: 0.25,
    });
    const fortressDecision = GameOfLifeAIProfiles.decideBet(player, makeState(), fortress);
    check("Game of Life: Fortress folds a lone pair to a pot-sized bet", fortressDecision.action === "fold");
    const liveWireDecision = GameOfLifeAIProfiles.decideBet(player, makeState(), liveWire);
    check("Game of Life: Live Wire does NOT fold the same lone pair to the same bet", liveWireDecision.action !== "fold");
  }

  // --- Anaconda ---
  {
    const { HandEvaluator, Deck, AnacondaAIProfiles } = load(["deck.js", "hand-evaluator.js", "ai-profiles.js", "ai-anaconda-profiles.js"], ["HandEvaluator", "Deck", "AnacondaAIProfiles"], {
      RulesAnaconda: { maxRaiseDollars: () => 0 },
    });
    // A genuine lone pair, no wildcards -- 2H/2D paired, 3 unrelated kickers.
    const lonePairHand = [
      { rank: "2", suit: "H" },
      { rank: "2", suit: "D" },
      { rank: "5", suit: "C" },
      { rank: "9", suit: "S" },
      { rank: "K", suit: "H" },
    ];
    const player = { id: "p0", hand: lonePairHand };
    const makeState = (status) => ({
      status,
      pot: potSizedBet.pot,
      players: [player],
      bettingRound: { currentBetChips: potSizedBet.toCallChips, committed: { p0: 0 }, raiseCounts: {} },
      revealsDone: 2, // revealingBet: 3 "reveals left" that must NOT be credited as chances to improve
      raiseIncrementDollars: 0.25,
    });

    const fortressDecision = AnacondaAIProfiles.decideBet(player, makeState("revealingBet"), fortress);
    check("Anaconda: Fortress folds a lone pair to a pot-sized bet once the hand is fixed (revealingBet)", fortressDecision.action === "fold");
    const liveWireDecision = AnacondaAIProfiles.decideBet(player, makeState("revealingBet"), liveWire);
    check("Anaconda: Live Wire does NOT fold the same lone pair to the same bet", liveWireDecision.action !== "fold");

    // Incidental fix check, isolated from lossAversion: a profile with NO
    // loss aversion (so the bar stays at plain PAIR, gap=0, myHand already
    // clears it) would never even reach the revealsLeft credit -- so to
    // actually exercise the "reveals left is credited" vs. "it isn't"
    // difference, use a genuinely sub-PAIR hand (no pair at all) with a
    // profile whose chancePerCard would have been enough to cover the gap
    // if reveals were (wrongly) still credited once the hand is fixed.
    const highCardHand = [
      { rank: "2", suit: "H" },
      { rank: "5", suit: "C" },
      { rank: "9", suit: "S" },
      { rank: "J", suit: "D" },
      { rank: "K", suit: "H" },
    ];
    const highCardPlayer = { id: "p0", hand: highCardHand };
    const genericProfile = { name: "test", chancePerCard: 1, lossAversion: 0, raiseWhenLeading: false, bluffFrequency: 0 };
    const stateBetting1 = { ...makeState("betting1"), players: [highCardPlayer] };
    const stateBetting2 = { ...makeState("betting2"), players: [highCardPlayer] };
    const decisionBetting1 = AnacondaAIProfiles.decideBet(highCardPlayer, stateBetting1, genericProfile);
    check(
      "Anaconda: before the second discard, 'reveals left' still credits a real high-card hand enough to call",
      decisionBetting1.action !== "fold"
    );
    const decisionBetting2 = AnacondaAIProfiles.decideBet(highCardPlayer, stateBetting2, genericProfile);
    check(
      "Anaconda: once the hand is fixed (betting2), the same high-card hand with the same profile folds -- 'reveals left' no longer wrongly credited",
      decisionBetting2.action === "fold"
    );
  }

  return summary("ai-loss-aversion");
}

if (require.main === module) process.exit(run());
module.exports = { run };

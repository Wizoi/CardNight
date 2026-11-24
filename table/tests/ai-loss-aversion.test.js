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
      // streetIndex 2 (turn, 1 card still to come) rather than preflop --
      // a follow-up review found the lossAversion shift applied in full
      // even on the very first preflop action, where toCall/pot is always
      // lopsided purely from the blind mechanic, folding the tightest
      // archetypes out of literally every unpaired preflop hand. The fix
      // halves the shift while 3+ cards/streets are still unknown; this
      // test is specifically about a late, closer-to-fully-informed
      // decision, so it deliberately stays past that threshold.
      streetIndex: 2,
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
      // 2 flips left -- a late decision, past the lossAversion shift's own
      // early-street discount threshold (see the hold'em block above for
      // why that threshold exists).
      flipsDone: 8,
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
    // loss aversion (so the bar stays at plain PAIR) facing a genuinely
    // sub-PAIR hand (no pair at all, gap=1). A follow-up review (2026-11-23)
    // found the original version of this fix only half-corrected the bug:
    // scoping the "reveals left" credit to "betting1" alone assumed a real
    // discard-driven cut was still ahead at that point, but `myHand` is
    // already computed from the player's CURRENT full (post-pass) hand via
    // `evaluatePartial`, which already picks the best achievable 5 of 7 --
    // so the eventual hand value is fully fixed from betting1 onward, same
    // as betting2/revealingBet. The fix now applies `chancePerCard` as a
    // flat, unscaled allowance (not multiplied by any reveals-left count)
    // at every status -- so betting1 and betting2 must now behave
    // IDENTICALLY for the same hand and profile, not differently.
    const highCardHand = [
      { rank: "2", suit: "H" },
      { rank: "5", suit: "C" },
      { rank: "9", suit: "S" },
      { rank: "J", suit: "D" },
      { rank: "K", suit: "H" },
    ];
    const highCardPlayer = { id: "p0", hand: highCardHand };
    const tooTightProfile = { name: "test", chancePerCard: 0.5, lossAversion: 0, raiseWhenLeading: false, bluffFrequency: 0 };
    const looseEnoughProfile = { name: "test", chancePerCard: 1, lossAversion: 0, raiseWhenLeading: false, bluffFrequency: 0 };
    for (const status of ["betting1", "betting2", "revealingBet"]) {
      const stateTooTight = { ...makeState(status), players: [highCardPlayer] };
      const tooTightDecision = AnacondaAIProfiles.decideBet(highCardPlayer, stateTooTight, tooTightProfile);
      check(
        `Anaconda (${status}): a profile whose chancePerCard (0.5) is below the gap (1) folds the same sub-pair hand -- no more reveals-left credit inflating it, at any status`,
        tooTightDecision.action === "fold"
      );

      const stateLooseEnough = { ...makeState(status), players: [highCardPlayer] };
      const looseEnoughDecision = AnacondaAIProfiles.decideBet(highCardPlayer, stateLooseEnough, looseEnoughProfile);
      check(
        `Anaconda (${status}): a profile whose chancePerCard (1) alone already clears the gap (1) still calls -- the flat allowance itself still works`,
        looseEnoughDecision.action !== "fold"
      );
    }
  }

  // Real bug, caught by a follow-up review (2026-11-23) and confirmed by
  // direct simulation: the lossAversion shift applied in full even on a
  // player's very first preflop action, where toCall/pot is ALWAYS
  // lopsided purely from the blind-posting mechanic (facing just the big
  // blind, toCall/pot is roughly 0.67 every single hand, with zero real
  // aggression behind it) -- this alone pushed the bar up a tier and
  // folded the tightest archetypes out of literally every unpaired
  // preflop hand, reintroducing the same class of symptom
  // ai-holdem-preflop.test.js already fixed once (under-crediting how
  // many cards are still to come), just from a different cause.
  {
    const { HandEvaluator, HoldemAIProfiles, AIProfiles } = load(["deck.js", "hand-evaluator.js", "ai-profiles.js", "ai-holdem-profiles.js"], ["HandEvaluator", "HoldemAIProfiles", "AIProfiles"], {
      HoldemRules: { bestHighHand: () => ({ category: -1 }), maxRaiseDollars: () => 0 },
    });
    const fortress = AIProfiles.profileFor("fortress");
    const player = { id: "p0", hand: [{ rank: "4", suit: "H" }, { rank: "6", suit: "H" }, { rank: "Q", suit: "C" }, { rank: "7", suit: "D" }] };
    const preflopState = {
      streetIndex: 0,
      pot: 6,
      players: [player],
      bettingRound: { currentBetChips: 4, committed: { p0: 0 }, raiseCounts: {} },
      raiseIncrementDollars: 0.25,
    };
    const decision = HoldemAIProfiles.decideBet(player, preflopState, fortress);
    check(
      "Fortress no longer folds an unpaired hand facing just the big blind preflop -- the reported bug, reproduced and fixed",
      decision.action !== "fold"
    );

    // The discount is early-street-only: the same hand, same profile, on
    // the river (0 cards left) should still fold reflexively -- this fix
    // loosens an early, low-information read, it doesn't disable the
    // lossAversion shift altogether.
    const riverState = { ...preflopState, streetIndex: 3 };
    const riverDecision = HoldemAIProfiles.decideBet(player, riverState, fortress);
    check("the same still-unpaired hand still folds on the river facing the same bet", riverDecision.action === "fold");
  }

  return summary("ai-loss-aversion");
}

if (require.main === module) process.exit(run());
module.exports = { run };

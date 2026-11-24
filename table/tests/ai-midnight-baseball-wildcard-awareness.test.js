"use strict";

// Real design gap, reported directly (2026-11-23) against a live Midnight
// Baseball hand: an AI (The Steady Hand, chancePerCard 0.85) folded after
// just 2 cards with a High Card showing against a Straight board, with 4
// cards still unflipped. The math behind that fold (worthPursuing:
// remaining * chancePerCard >= gap) was correct for a flat per-card
// estimate, but the user pointed out it ignored the family's own buyable
// wilds (3s/9s) and bonus-buy 4s -- "one of the reasons for having wilds
// and flipups in the game is to keep even moderate players in a bit
// longer... should be considered." See baseball-family-wildcards.js's
// wildcardChanceBonus and ai-profiles.js's decideContinue for the fix.

const { load } = require("./harness");
const { makeChecker } = require("./check");

function run() {
  const { check, summary } = makeChecker();
  const { HandEvaluator, BaseballWildcards, AIProfiles } = load(
    ["deck.js", "hand-evaluator.js", "baseball-family-wildcards.js", "ai-profiles.js"],
    ["HandEvaluator", "BaseballWildcards", "AIProfiles"]
  );

  // Reconstruct the exact reported shape: a High Card showing hand facing
  // a Straight board, 4 cards still unflipped, nothing else at the table
  // seen yet -- so every 3/9/4 in the deck is still unseen.
  const showing = { category: HandEvaluator.CATEGORY.HIGH_CARD, tiebreakers: [14] };
  const board = { category: HandEvaluator.CATEGORY.STRAIGHT, tiebreakers: [5] };
  const remaining = 4;
  const profile = AIProfiles.PROFILES["steady-hand"];

  const gap = board.category - showing.category;
  check("the reported gap is exactly 4 categories (High Card -> Straight)", gap === 4);

  // Pure flat math (no wildcard awareness): 4 * 0.85 = 3.4 < 4 -- folds,
  // matching exactly what was reported and screenshotted. worthPursuing
  // itself isn't exported, so this is exercised directly below using the
  // same formula it applies internally, with and without the bonus.

  // A freshly-started hand (nobody's seen anything yet): a full deck's
  // worth of 3s/9s/4s are still unseen, so the bonus should be at its
  // strongest and should flip this specific borderline case from fold to
  // continue.
  const freshState = { players: [{ hand: [] }], discardPile: [] };
  const freshBonus = BaseballWildcards.wildcardChanceBonus(freshState);
  check("a fresh hand's wildcard chance bonus is meaningfully positive", freshBonus > 0.3);
  const freshWorth = remaining * (profile.chancePerCard + freshBonus) >= gap;
  check("with the fresh-hand bonus applied, the same borderline hand is now worth continuing (was a fold before this fix)", freshWorth === true);

  // Late in the same hand, with every 3/9/4 already seen face-up
  // elsewhere at the table: the bonus should collapse back toward 0, and
  // the original flat-math fold should still hold -- this fix loosens a
  // genuinely uncertain early read, it doesn't make every hand un-foldable.
  const allWildsSeenState = {
    players: [
      {
        hand: [
          { rank: "3", suit: "S", faceUp: true },
          { rank: "3", suit: "H", faceUp: true },
          { rank: "3", suit: "D", faceUp: true },
          { rank: "3", suit: "C", faceUp: true },
          { rank: "9", suit: "S", faceUp: true },
          { rank: "9", suit: "H", faceUp: true },
        ],
      },
      {
        hand: [
          { rank: "9", suit: "D", faceUp: true },
          { rank: "9", suit: "C", faceUp: true },
          { rank: "4", suit: "S", faceUp: true },
          { rank: "4", suit: "H", faceUp: true },
          { rank: "4", suit: "D", faceUp: true },
          { rank: "4", suit: "C", faceUp: true },
        ],
      },
    ],
    discardPile: [],
  };
  const lateBonus = BaseballWildcards.wildcardChanceBonus(allWildsSeenState);
  check("once every 3/9/4 has already been seen elsewhere, the bonus collapses to 0", lateBonus === 0);
  const lateWorth = remaining * (profile.chancePerCard + lateBonus) >= gap;
  check("with nothing left to hope for, the same borderline hand still folds (matches the pre-fix, correctly-reasoned flat math)", lateWorth === false);

  // Real bug, reported directly (2026-11-23), found live: "Ingrid didn't
  // even take a card. She just completely folded on Midnight Baseball" --
  // screenshotted with all 5 of her cards still face-down. The fix above
  // (decideContinue, the player's OWN reveal-turn "keep going?" decision)
  // never reached decideBet's fold check, which can fire during a betting
  // round BEFORE a player has ever flipped a single one of their own
  // cards -- the exact same "is this hand worth chasing" question, just
  // asked from a different code path, with the identical blind spot:
  // judging an all-face-down (or near-empty) showing hand against the
  // board with zero credit for the family's own buyable wilds/bonus
  // draws still to come.
  {
    const { HandEvaluator, BaseballWildcards, AIProfiles, MidnightBaseball } = load(
      ["deck.js", "hand-evaluator.js", "baseball-family-wildcards.js", "ai-profiles.js"],
      ["HandEvaluator", "BaseballWildcards", "AIProfiles", "MidnightBaseball"],
      {
        MidnightBaseball: {
          // The same borderline shape the decideContinue fix above already
          // validates (gap of exactly 4, 4 cards remaining -- flat math
          // folds at 4*0.85=3.4 < 4, the wildcard bonus pushes it over),
          // here reached through decideBet's OWN fold check instead, since
          // that's the path Ingrid's report actually went through.
          currentBestHand: () => ({ holderId: "nico", hand: { category: HandEvaluator.CATEGORY.STRAIGHT, tiebreakers: [9] } }),
          evaluateShowingHand: () => ({ category: HandEvaluator.CATEGORY.HIGH_CARD, tiebreakers: [2] }),
          remainingFaceDownCount: () => 4,
          maxRaiseDollars: () => 0,
        },
      }
    );
    const player = { id: "ingrid", profileName: "steady-hand", hand: [] };
    const profile = AIProfiles.PROFILES["steady-hand"];
    const state = {
      bettingRound: { currentBetChips: 100, committed: { ingrid: 0 }, raiseCounts: {} },
      pot: 200,
      players: [player],
      raiseIncrementDollars: 0.25,
      // A fresh hand -- nobody's flipped a 3/9/4 face up anywhere yet, so
      // the wildcard bonus should be at its strongest.
      discardPile: [],
    };
    const decision = AIProfiles.decideBet(player, state, profile);
    check(
      "a player facing a bet with ZERO cards flipped yet no longer folds reflexively -- the reported bug, reproduced and fixed",
      decision.action !== "fold"
    );
  }

  return summary("ai-midnight-baseball-wildcard-awareness");
}

if (require.main === module) process.exit(run());
module.exports = { run };

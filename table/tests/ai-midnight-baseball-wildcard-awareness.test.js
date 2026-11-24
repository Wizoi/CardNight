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

  return summary("ai-midnight-baseball-wildcard-awareness");
}

if (require.main === module) process.exit(run());
module.exports = { run };

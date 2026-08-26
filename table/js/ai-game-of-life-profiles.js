"use strict";

// AI decisions for Game of Life. Betting mirrors the community-stud
// engine's shape (a player's own best-achievable hand judged against a
// flat bar, scaled by how much of the draft is still left) since there's
// no "showing hand" to compare against here either -- every card, hand or
// table row, is unknown until it's actually flipped.
const GameOfLifeAIProfiles = (function () {
  const CALL_WORTHY_CATEGORY = HandEvaluator.CATEGORY.PAIR;

  // No signal exists for which row is "better" to flip from -- table cards
  // are all unknown until flipped, and nobody can see what's poisoned
  // ahead of time. Good is pure upside (gains a card) vs. bad's pure risk
  // (discards one), so every profile just prefers good while it still has
  // cards, only flipping bad once forced to -- a documented simplification
  // rather than invented strategic depth with no real signal behind it.
  function decideFlipChoice(player, state) {
    return state.goodRow.some((c) => !c.flipped) ? "good" : "bad";
  }

  function worthContinuing(myHand, flipsLeft, profile) {
    if (myHand.category >= CALL_WORTHY_CATEGORY) return true;
    const gap = CALL_WORTHY_CATEGORY - myHand.category;
    return flipsLeft * profile.chancePerCard >= gap;
  }

  function decideBet(player, state, profile) {
    const br = state.bettingRound;
    const toCallChips = br.currentBetChips - br.committed[player.id];
    const cards = player.hand.map((c) => ({ rank: c.rank, suit: c.suit, isWild: false }));
    const myHand = HandEvaluator.evaluatePartial(cards);
    const flipsLeft = 10 - state.flipsDone;

    if (toCallChips > 0 && !worthContinuing(myHand, flipsLeft, profile)) {
      return { action: "fold" };
    }
    if (profile.raiseWhenLeading) {
      const minCategory = flipsLeft === 0 ? HandEvaluator.CATEGORY.TRIPS : profile.raiseMinCategory;
      if (myHand.category >= minCategory) {
        const maxRaise = RulesGameOfLife.maxRaiseDollars(state, player.id);
        if (maxRaise > 0) return { action: "raise", raiseDollars: Math.min(state.raiseIncrementDollars, maxRaise) };
      }
    }
    return { action: "call" };
  }

  return { decideFlipChoice, decideBet };
})();

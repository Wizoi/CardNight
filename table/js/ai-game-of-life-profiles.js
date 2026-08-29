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

  // The raise bar tightens the more of the 10-flip draft is still to come,
  // instead of one flat threshold for the whole hand -- same fix applied
  // everywhere else this pattern existed (2026-08-29, reported against
  // Criss Cross). Divided by 4 rather than 2 (the smaller-reveal-count
  // families' divisor) since Game of Life's draft is more than double the
  // length -- this keeps the maximum shift in the same rough ballpark
  // (~2 category tiers at the very start) instead of maxing out the scale.
  function raiseBarFor(flipsLeft, profile) {
    if (flipsLeft === 0) return HandEvaluator.CATEGORY.TRIPS;
    return Math.min(HandEvaluator.CATEGORY.STRAIGHT_FLUSH, profile.raiseMinCategory + Math.floor(flipsLeft / 4));
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
    if (profile.raiseWhenLeading && myHand.category >= raiseBarFor(flipsLeft, profile)) {
      const maxRaise = RulesGameOfLife.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) return { action: "raise", raiseDollars: Math.min(state.raiseIncrementDollars, maxRaise) };
    }
    return { action: "call" };
  }

  return { decideFlipChoice, decideBet };
})();

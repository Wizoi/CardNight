"use strict";

// AI decisions for Wild in Your Hand. A player's hand is fully known the moment
// it's dealt (nothing hidden), so this is the same flat per-profile
// category bar every other Guts game's AI uses (AIProfiles.PROFILES[*].
// gutsMinCategoryToStay), shifted up for hand size via
// gameConfig.categoryShift -- see ai-guts-profiles.js's own comments for
// why a flat bar needs that shift at all. The SAME bar check drives both
// kinds of decision here: whether to pay 50c to see the next pyramid row,
// and the final simultaneous in/out declare -- both are really the same
// underlying judgment ("is my hand worth continuing to risk money on"),
// just asked at different points as more of the pyramid gets revealed.
const WildInYourHandAIProfiles = (function () {
  function worthContinuing(player, state, profile) {
    const hand = WildInYourHandRules.evaluateHand(state, player);
    const shift = state.gameConfig.categoryShift || 0;
    if (hand.category > HandEvaluator.CATEGORY.HIGH_CARD || shift > 0) {
      return hand.category >= profile.gutsMinCategoryToStay + shift;
    }
    if (profile.gutsMinCategoryToStay > HandEvaluator.CATEGORY.HIGH_CARD) return false;
    const topRankValue = hand.tiebreakers && hand.tiebreakers[0];
    return topRankValue >= Deck.RANK_VALUES.J;
  }

  function decideRowBet(player, state, profile) {
    return worthContinuing(player, state, profile);
  }

  function decideDeclare(player, state, profile) {
    return worthContinuing(player, state, profile);
  }

  return { decideRowBet, decideDeclare };
})();

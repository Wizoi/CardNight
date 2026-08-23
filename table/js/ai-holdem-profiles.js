"use strict";

// AI betting for the Hold'em engine. Same situation as community-stud's AI:
// nobody has a visible "showing hand" (hole cards stay private the whole
// hand), so this judges a player's own best-achievable hand against a flat
// PAIR-or-better bar, scaled by how many streets are left to improve —
// same shape as CommunityStudAIProfiles.decideBet, just reading
// HoldemRules' state instead.
const HoldemAIProfiles = (function () {
  const CALL_WORTHY_CATEGORY = HandEvaluator.CATEGORY.PAIR;

  // Before there's enough board for any valid hole/board split (preflop,
  // and for Seattle/Boise's 2-board-card requirement, also right after a
  // flop that's one card short of the need), bestHighHand returns the
  // {category: -1} placeholder -- fall back to reading the raw hole cards
  // alone as a rough pre-board proxy, the same kind of fallback other
  // engines use when nothing else is knowable yet.
  function currentStrength(state, player) {
    const hand = HoldemRules.bestHighHand(state, player);
    if (hand.category > -1) return hand;
    return HandEvaluator.evaluatePartial(player.hand.map((c) => ({ rank: c.rank, suit: c.suit, isWild: false })));
  }

  function worthContinuing(myHand, streetsLeft, profile) {
    if (myHand.category >= CALL_WORTHY_CATEGORY) return true;
    const gap = CALL_WORTHY_CATEGORY - myHand.category;
    return streetsLeft * profile.chancePerCard >= gap;
  }

  function decideBet(player, state, profile) {
    const br = state.bettingRound;
    const toCallChips = br.currentBetChips - br.committed[player.id];
    const myHand = currentStrength(state, player);
    const streetsLeft = 3 - state.streetIndex; // flop/turn/river remaining after this street

    if (toCallChips > 0 && !worthContinuing(myHand, streetsLeft, profile)) {
      return { action: "fold" };
    }
    if (profile.raiseWhenLeading) {
      const minCategory = streetsLeft <= 0 ? HandEvaluator.CATEGORY.TRIPS : profile.raiseMinCategory;
      if (myHand.category >= minCategory) {
        const maxRaise = HoldemRules.maxRaiseDollars(state, player.id);
        if (maxRaise > 0) return { action: "raise", raiseDollars: Math.min(state.raiseIncrementDollars, maxRaise) };
      }
    }
    return { action: "call" };
  }

  return { decideBet };
})();

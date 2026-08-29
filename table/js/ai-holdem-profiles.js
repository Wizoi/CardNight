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

  // The raise bar tightens the more streets are still to come, instead of
  // one flat threshold for the whole hand -- real bug fixed 2026-08-29,
  // reported directly against Criss Cross (this same flat-bar pattern
  // existed identically across every family) as two AI seats repeatedly
  // bidding a pot up to the max bet "every time," well before the board
  // was even half dealt. A hand that already clears the bar on the flop is
  // a much weaker signal than the same category on the river, since there
  // are still 1-2 more community cards that could change anyone's hand.
  function raiseBarFor(streetsLeft, profile) {
    if (streetsLeft <= 0) return HandEvaluator.CATEGORY.TRIPS;
    return Math.min(HandEvaluator.CATEGORY.STRAIGHT_FLUSH, profile.raiseMinCategory + Math.floor(streetsLeft / 2));
  }

  function decideBet(player, state, profile) {
    const br = state.bettingRound;
    const toCallChips = br.currentBetChips - br.committed[player.id];
    const myHand = currentStrength(state, player);
    const streetsLeft = 3 - state.streetIndex; // flop/turn/river remaining after this street

    if (toCallChips > 0 && !worthContinuing(myHand, streetsLeft, profile)) {
      return { action: "fold" };
    }
    if (profile.raiseWhenLeading && myHand.category >= raiseBarFor(streetsLeft, profile)) {
      const maxRaise = HoldemRules.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) return { action: "raise", raiseDollars: Math.min(state.raiseIncrementDollars, maxRaise) };
    }
    return { action: "call" };
  }

  return { decideBet };
})();

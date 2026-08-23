"use strict";

// AI betting for the community-stud engine. Genuinely different situation
// from the stud family: nobody has a "showing hand" to read here (hole
// cards stay private the whole hand; only the shared community pool goes
// face up), so there's no board-relative comparison to make. Instead this
// judges a player's OWN best-achievable hand against an absolute bar,
// scaled by how many community cards are still left to reveal — the same
// "gap vs. remaining unknowns, weighted by profile optimism" shape used
// everywhere else in the project, just without an opponent's board as the
// other side of the comparison.
const CommunityStudAIProfiles = (function () {
  const CALL_WORTHY_CATEGORY = HandEvaluator.CATEGORY.PAIR;

  function worthContinuing(myHand, revealsLeft, profile) {
    if (myHand.category >= CALL_WORTHY_CATEGORY) return true;
    const gap = CALL_WORTHY_CATEGORY - myHand.category;
    return revealsLeft * profile.chancePerCard >= gap;
  }

  function decideBet(player, state, profile) {
    const br = state.bettingRound;
    const toCallChips = br.currentBetChips - br.committed[player.id];
    const myHand = CommunityStudRules.evaluateBestHand(state, player);
    const revealsLeft = state.communityCards.length - state.revealIndex;

    if (toCallChips > 0 && !worthContinuing(myHand, revealsLeft, profile)) {
      return { action: "fold" };
    }
    if (profile.raiseWhenLeading) {
      const minCategory = revealsLeft === 0 ? HandEvaluator.CATEGORY.TRIPS : profile.raiseMinCategory;
      if (myHand.category >= minCategory) {
        const maxRaise = CommunityStudRules.maxRaiseDollars(state, player.id);
        if (maxRaise > 0) return { action: "raise", raiseDollars: Math.min(state.raiseIncrementDollars, maxRaise) };
      }
    }
    return { action: "call" };
  }

  return { decideBet };
})();

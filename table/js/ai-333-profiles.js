"use strict";

// AI betting for 3-33. A player's hand only ever shrinks (cards get
// discarded on a community match, never replaced or improved), so this is
// simpler than most: judge how close the CURRENT hand already is to
// either target, tolerating a wider gap the more reveal rounds are still
// left (reusing the existing chancePerCard/raiseWhenLeading profile
// fields rather than inventing a new dimension just for this one game).
const Rules333AIProfiles = (function () {
  function decideBet(player, state, profile) {
    const br = state.bettingRound;
    const toCallChips = br.currentBetChips - br.committed[player.id];
    const low = Rules333.handSumResult(state, player, Rules333.LOW_TARGET);
    const high = Rules333.handSumResult(state, player, Rules333.HIGH_TARGET);
    const bestDistance = Math.min(low.distance, high.distance);
    const roundsLeft = Rules333.TOTAL_ROUNDS - state.roundIndex;

    if (toCallChips > 0 && bestDistance > 3 + roundsLeft * profile.chancePerCard) {
      return { action: "fold" };
    }
    if (profile.raiseWhenLeading && bestDistance <= 2) {
      const maxRaise = Rules333.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) return { action: "raise", raiseDollars: Math.min(state.raiseIncrementDollars, maxRaise) };
    }
    return { action: "call" };
  }

  return { decideBet };
})();

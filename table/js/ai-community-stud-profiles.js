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

  function worthContinuing(myHand, revealsLeft, profile, chanceBonus) {
    if (myHand.category >= CALL_WORTHY_CATEGORY) return true;
    const gap = CALL_WORTHY_CATEGORY - myHand.category;
    return revealsLeft * (profile.chancePerCard + (chanceBonus || 0)) >= gap;
  }

  // The raise bar tightens the more uncertainty is still ahead, instead of
  // one flat threshold for the entire hand regardless of how many community
  // cards remain. Real bug fixed 2026-08-29, reported directly (two AI
  // seats repeatedly bidding a Criss Cross pot up to the $2 cap "every
  // time," well before most of the community cards were even shown): a
  // profile's raiseMinCategory is a showdown-strength bar, but the old code
  // applied it identically whether 1 card or 4 cards were still to come --
  // the same category read early in the hand is far less trustworthy than
  // late, since more reveals means more chances for someone else's hand
  // (or this one) to change shape. `wildcardPending` adds extra caution
  // specifically for Cincinnati/Criss Cross's optional wildcard variant:
  // once it's in play but not yet resolved (`state.wildRank == null`), the
  // eventual wild rank can reshape EVERY hand at the table at once, so
  // today's category read is even less trustworthy than the reveal count
  // alone would suggest.
  function raiseBarFor(state, revealsLeft, profile, barAdjustment) {
    if (revealsLeft === 0) return HandEvaluator.CATEGORY.TRIPS;
    const wildcardPending = !!state.gameConfig.wildcardMode && state.wildRank == null;
    const shift = Math.floor(revealsLeft / 2) + (wildcardPending ? 1 : 0) + (barAdjustment || 0);
    return Math.min(HandEvaluator.CATEGORY.STRAIGHT_FLUSH, profile.raiseMinCategory + shift);
  }

  function decideBet(player, state, profile) {
    const br = state.bettingRound;
    const toCallChips = br.currentBetChips - br.committed[player.id];
    const myHand = CommunityStudRules.evaluateBestHand(state, player);
    const revealsLeft = state.communityCards.length - state.revealIndex;

    // Bluff check first, before the fold gate -- same shared pattern as
    // every other family.
    if (AIProfiles.shouldBluff(profile)) {
      const maxRaise = CommunityStudRules.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) return { action: "raise", raiseDollars: AIProfiles.scaledRaiseDollars(1, state.raiseIncrementDollars, maxRaise) };
    }

    const chanceBonus =
      AIProfiles.potOddsChanceBonus(toCallChips, state.pot) +
      AIProfiles.reRaiseChanceAdjustment(br, player.id, profile) +
      AIProfiles.opponentLoosenessAdjustment(state.opponentStats, AIProfiles.liveOpponentIds(state.players, player.id), profile);
    if (toCallChips > 0 && !worthContinuing(myHand, revealsLeft, profile, chanceBonus)) {
      return { action: "fold" };
    }
    const barAdjustment = AIProfiles.opponentCountBarAdjustment(AIProfiles.liveOpponentCount(state.players, player.id));
    const bar = raiseBarFor(state, revealsLeft, profile, barAdjustment);
    if (profile.raiseWhenLeading && myHand.category >= bar) {
      const maxRaise = CommunityStudRules.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) {
        const tier = AIProfiles.confidenceTier(myHand.category - bar);
        return { action: "raise", raiseDollars: AIProfiles.scaledRaiseDollars(tier, state.raiseIncrementDollars, maxRaise) };
      }
    }
    return { action: "call" };
  }

  return { decideBet };
})();

"use strict";

// AI betting decisions for Mexican Sweat. Reuses AIProfiles.worthPursuing
// (the same "showing-hand category gap vs. remaining unknowns" heuristic
// used everywhere else) — there's no buy/wipe decision here at all, since
// revealing is blind and automatic for every player, so this module is
// just `decideBet`, mirroring the shape of ai-stud-profiles.js's version
// but reading MexicanSweatRules' state instead of StudRules'.
const MexicanSweatAIProfiles = (function () {
  // The raise bar tightens the more reveal rounds are still to come, instead
  // of one flat threshold for the whole hand -- same fix applied everywhere
  // else this pattern existed (2026-08-29, reported against Criss Cross). A
  // showing hand that already clears the bar with several rounds still left
  // is a much weaker signal than the same category on the last round.
  function raiseBarFor(roundsLeft, profile, barAdjustment) {
    if (roundsLeft <= 0) return HandEvaluator.CATEGORY.TRIPS;
    return Math.min(HandEvaluator.CATEGORY.STRAIGHT_FLUSH, profile.raiseMinCategory + Math.floor(roundsLeft / 2) + (barAdjustment || 0));
  }

  function worthRaisingAsLeader(player, state, profile, barAdjustment) {
    if (!profile.raiseWhenLeading) return false;
    const showing = MexicanSweatRules.evaluateShowingHand(state, player.id);
    const roundsLeft = MexicanSweatRules.roundsRemaining(state);
    return showing.category >= raiseBarFor(roundsLeft, profile, barAdjustment);
  }

  function decideBet(player, state, profile) {
    const br = state.bettingRound;
    const toCallChips = br.currentBetChips - br.committed[player.id];
    const best = MexicanSweatRules.currentBestShowingHand(state);
    const isLeader = best.holderId === player.id;

    if (AIProfiles.shouldBluff(profile)) {
      const maxRaise = MexicanSweatRules.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) return { action: "raise", raiseDollars: AIProfiles.scaledRaiseDollars(1, state.raiseIncrementDollars, maxRaise) };
    }

    if (!isLeader && toCallChips > 0) {
      const showing = MexicanSweatRules.evaluateShowingHand(state, player.id);
      const roundsLeft = MexicanSweatRules.roundsRemaining(state);
      const potOddsBonus = AIProfiles.potOddsChanceBonus(toCallChips, state.pot);
      if (!AIProfiles.worthPursuing(showing, best.hand, roundsLeft, profile, potOddsBonus)) {
        return { action: "fold" };
      }
    }
    const barAdjustment = AIProfiles.opponentCountBarAdjustment(AIProfiles.liveOpponentCount(state.players, player.id));
    if (isLeader && worthRaisingAsLeader(player, state, profile, barAdjustment)) {
      const maxRaise = MexicanSweatRules.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) {
        const showing = MexicanSweatRules.evaluateShowingHand(state, player.id);
        const roundsLeft = MexicanSweatRules.roundsRemaining(state);
        const tier = AIProfiles.confidenceTier(showing.category - raiseBarFor(roundsLeft, profile, barAdjustment));
        return { action: "raise", raiseDollars: AIProfiles.scaledRaiseDollars(tier, state.raiseIncrementDollars, maxRaise) };
      }
    }
    return { action: "call" };
  }

  return { decideBet };
})();

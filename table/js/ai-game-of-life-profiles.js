"use strict";

// AI decisions for Game of Life. Betting mirrors the community-stud
// engine's shape (a player's own best-achievable hand judged against a
// flat bar, scaled by how much of the draft is still left) since there's
// no "showing hand" to compare against here either -- every card, hand or
// table row, is unknown until it's actually flipped.
const GameOfLifeAIProfiles = (function () {
  const CALL_WORTHY_CATEGORY = HandEvaluator.CATEGORY.PAIR;

  // Only ever actually consulted for the free choice on the very first
  // flip of the hand -- every flip after that is forced to alternate
  // (rules-game-of-life.js's requiredRowFor), so this return value is
  // simply ignored on every other turn. No signal exists for which row is
  // "better" anyway -- table cards are all unknown until flipped, and
  // nobody can see what's poisoned ahead of time -- so good (pure upside)
  // is always the pick when there's a real choice to make.
  function decideFlipChoice(player, state) {
    return state.goodRow.some((c) => !c.flipped) ? "good" : "bad";
  }

  function worthContinuing(myHand, flipsLeft, profile, chanceBonus) {
    if (myHand.category >= CALL_WORTHY_CATEGORY) return true;
    const gap = CALL_WORTHY_CATEGORY - myHand.category;
    return flipsLeft * (profile.chancePerCard + (chanceBonus || 0)) >= gap;
  }

  // The raise bar tightens the more of the 10-flip draft is still to come,
  // instead of one flat threshold for the whole hand -- same fix applied
  // everywhere else this pattern existed (2026-08-29, reported against
  // Criss Cross). Divided by 4 rather than 2 (the smaller-reveal-count
  // families' divisor) since Game of Life's draft is more than double the
  // length -- this keeps the maximum shift in the same rough ballpark
  // (~2 category tiers at the very start) instead of maxing out the scale.
  function raiseBarFor(flipsLeft, profile, barAdjustment) {
    if (flipsLeft === 0) return HandEvaluator.CATEGORY.TRIPS;
    return Math.min(HandEvaluator.CATEGORY.STRAIGHT_FLUSH, profile.raiseMinCategory + Math.floor(flipsLeft / 4) + (barAdjustment || 0));
  }

  function decideBet(player, state, profile) {
    const br = state.bettingRound;
    const toCallChips = br.currentBetChips - br.committed[player.id];
    const cards = player.hand.map((c) => ({ rank: c.rank, suit: c.suit, isWild: c.rank === "JOKER" }));
    const myHand = HandEvaluator.evaluatePartial(cards);
    const flipsLeft = 10 - state.flipsDone;

    if (AIProfiles.shouldBluff(profile)) {
      const maxRaise = RulesGameOfLife.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) return { action: "raise", raiseDollars: AIProfiles.scaledRaiseDollars(1, state.raiseIncrementDollars, maxRaise) };
    }

    const chanceBonus =
      AIProfiles.potOddsChanceBonus(toCallChips, state.pot) +
      AIProfiles.reRaiseChanceAdjustment(br, player.id, profile) +
      AIProfiles.opponentLoosenessAdjustment(state.opponentStats, AIProfiles.liveOpponentIds(state.players, player.id), profile);
    if (toCallChips > 0 && !worthContinuing(myHand, flipsLeft, profile, chanceBonus)) {
      return { action: "fold" };
    }
    const barAdjustment = AIProfiles.opponentCountBarAdjustment(AIProfiles.liveOpponentCount(state.players, player.id));
    const bar = raiseBarFor(flipsLeft, profile, barAdjustment);
    if (profile.raiseWhenLeading && myHand.category >= bar) {
      const maxRaise = RulesGameOfLife.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) {
        const tier = AIProfiles.confidenceTier(myHand.category - bar);
        return { action: "raise", raiseDollars: AIProfiles.scaledRaiseDollars(tier, state.raiseIncrementDollars, maxRaise) };
      }
    }
    return { action: "call" };
  }

  return { decideFlipChoice, decideBet };
})();

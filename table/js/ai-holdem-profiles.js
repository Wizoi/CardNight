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

  function worthContinuing(myHand, streetsLeft, profile, chanceBonus) {
    if (myHand.category >= CALL_WORTHY_CATEGORY) return true;
    const gap = CALL_WORTHY_CATEGORY - myHand.category;
    return streetsLeft * (profile.chancePerCard + (chanceBonus || 0)) >= gap;
  }

  // The raise bar tightens the more streets are still to come, instead of
  // one flat threshold for the whole hand -- real bug fixed 2026-08-29,
  // reported directly against Criss Cross (this same flat-bar pattern
  // existed identically across every family) as two AI seats repeatedly
  // bidding a pot up to the max bet "every time," well before the board
  // was even half dealt. A hand that already clears the bar on the flop is
  // a much weaker signal than the same category on the river, since there
  // are still 1-2 more community cards that could change anyone's hand.
  function raiseBarFor(streetsLeft, profile, barAdjustment) {
    if (streetsLeft <= 0) return HandEvaluator.CATEGORY.TRIPS;
    return Math.min(HandEvaluator.CATEGORY.STRAIGHT_FLUSH, profile.raiseMinCategory + Math.floor(streetsLeft / 2) + (barAdjustment || 0));
  }

  // With no ante-family-style low fixed max bet capping things (hold'em's
  // house rule is genuinely uncapped, per games.md), nothing else stopped
  // two seats from re-raising each other indefinitely as long as both
  // hands cleared the same flat raiseBarFor every turn -- reported
  // 2026-08-29: two AI seats bounced a bet from $1 to $19 with nothing
  // stronger than TWO_PAIR (a low one) between them, on the TURN, with a
  // whole river still to come and everyone else just along for the ride.
  // Fixed two ways: each raise this same player has already made THIS
  // round demands one MORE category tier of confidence than the last (a
  // real player who's already made their case with one raise needs a
  // meaningfully better reason to push it again, not just clear the same
  // bar twice), and MAX_RAISES_PER_PLAYER_PER_ROUND is a hard backstop so
  // a betting round always eventually hands the action to someone else,
  // regardless of hand strength.
  const MAX_RAISES_PER_PLAYER_PER_ROUND = 2;

  function decideBet(player, state, profile) {
    const br = state.bettingRound;
    const toCallChips = br.currentBetChips - br.committed[player.id];
    const myHand = currentStrength(state, player);
    const streetsLeft = 3 - state.streetIndex; // flop/turn/river remaining after this street
    const raisesSoFar = (br.raiseCounts && br.raiseCounts[player.id]) || 0;
    const canRaiseAgain = raisesSoFar < MAX_RAISES_PER_PLAYER_PER_ROUND;

    // Bluff check first, independent of raiseWhenLeading and of whether
    // this hand would otherwise fold -- still subject to the same
    // per-round raise cap as a real raise, so a bluff can't itself become
    // the next re-raise war.
    if (canRaiseAgain && AIProfiles.shouldBluff(profile)) {
      const maxRaise = HoldemRules.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) return { action: "raise", raiseDollars: AIProfiles.scaledRaiseDollars(1, state.raiseIncrementDollars, maxRaise) };
    }

    const chanceBonus = AIProfiles.potOddsChanceBonus(toCallChips, state.pot) + AIProfiles.reRaiseChanceAdjustment(br, player.id, profile);
    if (toCallChips > 0 && !worthContinuing(myHand, streetsLeft, profile, chanceBonus)) {
      return { action: "fold" };
    }
    const barAdjustment = AIProfiles.opponentCountBarAdjustment(AIProfiles.liveOpponentCount(state.players, player.id));
    const escalatedBar = raiseBarFor(streetsLeft, profile, barAdjustment + raisesSoFar);
    if (profile.raiseWhenLeading && canRaiseAgain && myHand.category >= escalatedBar) {
      const maxRaise = HoldemRules.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) {
        const tier = AIProfiles.confidenceTier(myHand.category - escalatedBar);
        return { action: "raise", raiseDollars: AIProfiles.scaledRaiseDollars(tier, state.raiseIncrementDollars, maxRaise) };
      }
    }
    return { action: "call" };
  }

  return { decideBet };
})();

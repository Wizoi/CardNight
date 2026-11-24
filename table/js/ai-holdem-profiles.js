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

  // The fold gate is deliberately scaled by actual CARDS still to come, not
  // by `streetsLeft` (a street count) -- real bug, reported directly after
  // live play against Omaha ("2 folded before the flop!", confirmed by
  // screenshot: two AI seats folded preflop facing a cheap $1 call, with
  // zero board cards shown yet). `streetsLeft` treats the flop as "1" unit
  // of future improvement even though it actually deals 3 new community
  // cards at once -- the same calibration community-stud's `revealsLeft`
  // gets right for free, since there each reveal really is one card.
  // Preflop was therefore massively under-crediting its own very next,
  // biggest step, making an unpaired starting hand (the norm, not the
  // exception, in a 4-5 hole-card game) fold almost immediately regardless
  // of how cheap the bet was.
  function cardsStillToReveal(streetIndex) {
    if (streetIndex <= 0) return 5; // flop (3) + turn (1) + river (1)
    if (streetIndex === 1) return 2; // turn + river
    if (streetIndex === 2) return 1; // river
    return 0;
  }

  // callWorthyCategory tightens with the bet's size relative to the pot,
  // per-profile (2026-11-23, design review finding #4) -- see
  // AIProfiles.callWorthyCategoryFor's own comment for why this matters:
  // without it, the tightest archetype called an unlimited hold'em bet
  // with any pair at all.
  function worthContinuing(myHand, cardsLeft, profile, chanceBonus, toCallChips, potChips) {
    const callWorthyCategory = AIProfiles.callWorthyCategoryFor(CALL_WORTHY_CATEGORY, profile, toCallChips, potChips);
    if (myHand.category >= callWorthyCategory) return true;
    const gap = callWorthyCategory - myHand.category;
    return cardsLeft * (profile.chancePerCard + (chanceBonus || 0)) >= gap;
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

    const chanceBonus =
      AIProfiles.potOddsChanceBonus(toCallChips, state.pot) +
      AIProfiles.reRaiseChanceAdjustment(br, player.id, profile) +
      AIProfiles.opponentLoosenessAdjustment(state.opponentStats, AIProfiles.liveOpponentIds(state.players, player.id), profile);
    if (toCallChips > 0 && !worthContinuing(myHand, cardsStillToReveal(state.streetIndex), profile, chanceBonus, toCallChips, state.pot)) {
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

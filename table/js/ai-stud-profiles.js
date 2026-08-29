"use strict";

// AI decisions for the shared stud engine. Reuses AIProfiles.decideBuy3/9/4
// and worthPursuing as-is (they're already engine-agnostic — they only
// touch player/ChipEconomy/HandEvaluator, never MidnightBaseball) and adds
// only the pieces that need stud-shaped state instead of MidnightBaseball-
// shaped state: when a buy decision fires (dealer-dealt, not self-flipped)
// and how betting reads a "showing hand" that's built from simultaneous
// per-street deals rather than a player-paced reveal. Same 3 profiles
// (Cautious/Balanced/Aggressive) — no new profile definitions.
const StudAIProfiles = (function () {
  // Buy-on-deal is just a timing wrapper — the underlying choice functions
  // don't care whether the card arrived via the player's own flip (Midnight
  // Baseball) or the dealer's deal (stud); they only look at the card and
  // the player's current face-up hand.
  function decideBuyOnDeal(player, card, profile) {
    if (card.rank === "3") return AIProfiles.decideBuy3(player);
    if (card.rank === "9") return AIProfiles.decideBuy9(player, profile, player.hand.indexOf(card));
    if (card.rank === "4") return AIProfiles.decideBuy4(player);
    return false;
  }

  // Free Enterprise's Enterprise pile: judged against the player's WHOLE
  // hand, hole cards included (a stud player genuinely knows their own hole
  // cards, unlike Midnight Baseball's self-reveal convention, so this isn't
  // peeking). Picks the CHEAPEST pile position that actually improves the
  // hand's category, ties broken toward cheaper -- a rational buyer
  // wouldn't pay more for an equally-good option. If nothing in the
  // current pile helps, wiping is free (nothing to lose), so that's always
  // the fallback rather than paying for a card that doesn't help.
  function bestEnterprisePileChoice(player, pile) {
    const asCards = (cards) => cards.map((c) => ({ rank: c.rank, suit: c.suit, isWild: false }));
    const withoutCard = HandEvaluator.evaluatePartial(asCards(player.hand));
    let best = null;
    pile.forEach((card, position) => {
      const withCard = HandEvaluator.evaluatePartial(asCards(player.hand.concat([card])));
      if (!HandEvaluator.isBetter(withCard, withoutCard)) return;
      if (best == null || HandEvaluator.isBetter(withCard, best.result)) {
        best = { position, result: withCard };
      }
    });
    return best ? best.position : null;
  }

  // Whether the player can even afford this position's price factors in
  // too -- no point "wanting" a card priced above what's left in the wallet.
  function decideEnterpriseChoice(player, state, profile) {
    const bestPosition = bestEnterprisePileChoice(player, state.enterprisePile);
    if (bestPosition != null) {
      const priceDollars = StudRules.currentEnterprisePriceDollars(state, bestPosition);
      if (player.wallet.chips >= ChipEconomy.dollarsToChips(priceDollars)) {
        return { action: "buy", position: bestPosition };
      }
    }
    return { action: "wipe" };
  }

  // Re-run against the fresh pile after a wipe -- can't wipe a second time
  // in the same turn, so the fallback here is a free card instead.
  function decideEnterpriseAfterWipe(player, state, profile) {
    const decision = decideEnterpriseChoice(player, state, profile);
    if (decision.action === "buy") return decision;
    return { action: "free" };
  }

  // A fully-dealt hand (no streets left) has no more upside and nothing
  // hidden from opponents either — same "needs a real hand, not just a
  // lead" bar Midnight Baseball applies once a player's run out of cards.
  //
  // With streets still to come, the bar now tightens the more of them
  // remain, instead of one flat threshold for the whole hand -- real bug
  // fixed 2026-08-29, reported directly against Criss Cross (this same
  // flat-bar pattern existed identically across every family) as two AI
  // seats repeatedly bidding a pot up to the max bet "every time," well
  // before most of the street was even dealt. A showing hand that already
  // clears the bar with several streets still to come is a much weaker
  // signal than the same category on the last street, since there's more
  // room left for someone else's board (or this one) to change shape.
  function raiseBarForStud(streetsLeft, profile, barAdjustment) {
    if (streetsLeft === 0) return HandEvaluator.CATEGORY.TRIPS;
    return Math.min(HandEvaluator.CATEGORY.STRAIGHT_FLUSH, profile.raiseMinCategory + Math.floor(streetsLeft / 2) + (barAdjustment || 0));
  }

  function worthRaisingAsLeaderStud(player, state, profile, barAdjustment) {
    if (!profile.raiseWhenLeading) return false;
    const showing = StudRules.evaluateShowingHand(state, player.id);
    const streetsLeft = StudRules.streetsRemaining(state);
    return showing.category >= raiseBarForStud(streetsLeft, profile, barAdjustment);
  }

  function decideBet(player, state, profile) {
    const br = state.bettingRound;
    const toCallChips = br.currentBetChips - br.committed[player.id];
    const best = StudRules.currentBestShowingHand(state);
    const isLeader = best.holderId === player.id;

    // Bluff check first, independent of isLeader/raiseWhenLeading, and
    // before the fold gate -- same shared pattern as every other family.
    if (AIProfiles.shouldBluff(profile)) {
      const maxRaise = StudRules.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) return { action: "raise", raiseDollars: AIProfiles.scaledRaiseDollars(1, state.raiseIncrementDollars, maxRaise) };
    }

    if (!isLeader && toCallChips > 0) {
      const showing = StudRules.evaluateShowingHand(state, player.id);
      const streetsLeft = StudRules.streetsRemaining(state);
      const potOddsBonus = AIProfiles.potOddsChanceBonus(toCallChips, state.pot);
      if (!AIProfiles.worthPursuing(showing, best.hand, streetsLeft, profile, potOddsBonus)) {
        return { action: "fold" };
      }
    }
    const barAdjustment = AIProfiles.opponentCountBarAdjustment(AIProfiles.liveOpponentCount(state.players, player.id));
    if (isLeader && worthRaisingAsLeaderStud(player, state, profile, barAdjustment)) {
      const maxRaise = StudRules.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) {
        const showing = StudRules.evaluateShowingHand(state, player.id);
        const streetsLeft = StudRules.streetsRemaining(state);
        const tier = AIProfiles.confidenceTier(showing.category - raiseBarForStud(streetsLeft, profile, barAdjustment));
        return { action: "raise", raiseDollars: AIProfiles.scaledRaiseDollars(tier, state.raiseIncrementDollars, maxRaise) };
      }
    }
    return { action: "call" };
  }

  return { decideBuyOnDeal, decideEnterpriseChoice, decideEnterpriseAfterWipe, decideBet };
})();

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
    if (card.rank === "4") return AIProfiles.decideBuy4(player, profile);
    return false;
  }

  // Free Enterprise's Enterprise pile: judged against the player's WHOLE
  // hand, hole cards included (a stud player genuinely knows their own hole
  // cards, unlike Midnight Baseball's self-reveal convention, so this isn't
  // peeking).
  //
  // Real bug, found during the 2026-11-23 archetype design review's
  // follow-up pass (not reported live): the old comment here claimed this
  // "picks the CHEAPEST pile position that actually improves the hand...
  // ties broken toward cheaper," but the code never actually compared
  // price at all -- it picked the single STRONGEST result regardless of
  // cost, only ever "tying toward cheaper" by accident (iterating
  // positions in order and only replacing on a strictly better result). It
  // also counted a kicker-only improvement (same category, better
  // tiebreaker) as worth buying, so every profile would pay $3 (or $6 on
  // the doubled final round) for a kicker bump alone.
  //
  // Fixed by reusing two existing fields rather than inventing new ones,
  // applied to the decisions they already describe elsewhere:
  // `buyWildOnlyOnCategoryGain` (already gating decideBuy9 and 3 Buy 5's
  // exchange) skips a candidate whose only gain is a kicker, not a real
  // category jump. `lossAversion >= 0.75` makes a profile price-conscious:
  // among candidates that reach the best achievable category, it buys the
  // CHEAPEST one, since the same category costs $1 vs $3 ($2 vs $6 on the
  // doubled final round) depending on position -- the-calculator.md's own
  // "buying only while the new expected hand quality still clears that
  // round's cost." Profiles below that threshold (Live Wire, aggressive,
  // Streak Chaser, Subversive) keep the original "strongest card
  // regardless of price" behavior -- live-wire.md: "paying for the option
  // is itself a small thrill." Also filters out anything the player can't
  // actually afford, so the caller's own affordability check below is now
  // redundant (but harmless) rather than occasionally giving up on an
  // improving card it could have afforded at a cheaper position.
  function bestEnterprisePileChoice(player, state, profile) {
    const asCards = (cards) => cards.map((c) => ({ rank: c.rank, suit: c.suit, isWild: false }));
    const withoutCard = HandEvaluator.evaluatePartial(asCards(player.hand));
    const candidates = [];
    state.enterprisePile.forEach((card, position) => {
      const withCard = HandEvaluator.evaluatePartial(asCards(player.hand.concat([card])));
      if (!HandEvaluator.isBetter(withCard, withoutCard)) return;
      if (profile && profile.buyWildOnlyOnCategoryGain && withCard.category <= withoutCard.category) return; // kicker-only: not worth paying for
      const priceDollars = StudRules.currentEnterprisePriceDollars(state, position);
      if (player.wallet.chips < ChipEconomy.dollarsToChips(priceDollars)) return; // can't afford this position
      candidates.push({ position, result: withCard, priceDollars });
    });
    if (!candidates.length) return null;
    if (profile && (profile.lossAversion || 0) >= 0.75) {
      const bestCategory = Math.max(...candidates.map((c) => c.result.category));
      return candidates
        .filter((c) => c.result.category === bestCategory)
        .sort((a, b) => a.priceDollars - b.priceDollars || a.position - b.position)[0].position;
    }
    return candidates.reduce((best, c) => (HandEvaluator.isBetter(c.result, best.result) ? c : best)).position;
  }

  // Whether the player can even afford this position's price factors in
  // too -- no point "wanting" a card priced above what's left in the wallet.
  // Wiping now costs a flat $1 (2026-09-14 fix -- it used to be free, which
  // is why "nothing in the pile helps, so wipe" used to be an unconditional
  // fallback with nothing to lose). A disciplined profile
  // (buyWildOnlyOnCategoryGain, the same "skip a marginal gamble" flag 3 Buy
  // 5's exchange decision already uses) takes the guaranteed-free card
  // instead of paying $1 to reshuffle the pile on a hand that isn't there
  // yet; a looser profile still pays for another shot, same as before.
  function decideEnterpriseChoice(player, state, profile) {
    const bestPosition = bestEnterprisePileChoice(player, state, profile);
    if (bestPosition != null) {
      const priceDollars = StudRules.currentEnterprisePriceDollars(state, bestPosition);
      if (player.wallet.chips >= ChipEconomy.dollarsToChips(priceDollars)) {
        return { action: "buy", position: bestPosition };
      }
    }
    const canAffordWipe = player.wallet.chips >= ChipEconomy.dollarsToChips(1);
    if (canAffordWipe && !profile.buyWildOnlyOnCategoryGain) return { action: "wipe" };
    return { action: "free" };
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
    if (!profile.raiseWhenLeading && !AIProfiles.breaksPattern(profile)) return false;
    const showing = StudRules.evaluateShowingHand(state, player.id);
    const streetsLeft = StudRules.streetsRemaining(state);
    const clearsBar = showing.category >= raiseBarForStud(streetsLeft, profile, barAdjustment);
    // Slow-play (design review finding #10, closed out 2026-11-23):
    // currently only Subversive's patternBreakRate ever fires this.
    if (clearsBar && profile.raiseWhenLeading && AIProfiles.shouldSlowPlay(profile)) return false;
    return clearsBar;
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
      if (maxRaise > 0) return { action: "raise", raiseDollars: AIProfiles.scaledRaiseDollars(AIProfiles.bluffRaiseTier(profile), state.raiseIncrementDollars, maxRaise) };
    }

    if (!isLeader && toCallChips > 0) {
      const showing = StudRules.evaluateShowingHand(state, player.id);
      const streetsLeft = StudRules.streetsRemaining(state);
      const chanceBonus =
        AIProfiles.potOddsChanceBonus(toCallChips, state.pot) +
        AIProfiles.reRaiseChanceAdjustment(br, player.id, profile) +
        AIProfiles.opponentLoosenessAdjustment(state.opponentStats, AIProfiles.liveOpponentIds(state.players, player.id), profile);
      if (!AIProfiles.worthPursuing(showing, best.hand, streetsLeft, profile, chanceBonus)) {
        // Hero call (design review finding #10, closed out 2026-11-23):
        // currently only Subversive's patternBreakRate ever fires this.
        if (AIProfiles.shouldHeroCall(profile)) return { action: "call" };
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

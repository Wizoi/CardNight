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

  // Free Enterprise's wipe: worth paying for only if the just-dealt card
  // isn't actually contributing (a pure dead card, e.g. an unpaired low
  // card that doesn't extend a draw) — judged against the player's WHOLE
  // hand, hole cards included. Unlike Midnight Baseball's self-reveal
  // convention, a stud player always knows their own hole cards for real,
  // so this isn't peeking; judging only from face-up cards would almost
  // always look like an "improvement" early on, since any single card
  // beats having none showing at all. Cautious profiles hold onto their
  // chips and skip the gamble; balanced/aggressive take it whenever the
  // card isn't helping and they can afford the price.
  function decideWipe(player, card, profile, priceDollars) {
    if (player.wallet.chips < ChipEconomy.dollarsToChips(priceDollars)) return false;
    if (profile.name === "cautious") return false;
    const asCards = (cards) => cards.map((c) => ({ rank: c.rank, suit: c.suit, isWild: c.isWild }));
    const withCard = HandEvaluator.evaluatePartial(asCards(player.hand));
    const withoutCard = HandEvaluator.evaluatePartial(asCards(player.hand.filter((c) => c !== card)));
    return !HandEvaluator.isBetter(withCard, withoutCard);
  }

  // A fully-dealt hand (no streets left) has no more upside and nothing
  // hidden from opponents either — same "needs a real hand, not just a
  // lead" bar Midnight Baseball applies once a player's run out of cards.
  function worthRaisingAsLeaderStud(player, state, profile) {
    if (!profile.raiseWhenLeading) return false;
    const showing = StudRules.evaluateShowingHand(state, player.id);
    const streetsLeft = StudRules.streetsRemaining(state);
    const minCategory = streetsLeft === 0 ? HandEvaluator.CATEGORY.TRIPS : profile.raiseMinCategory;
    return showing.category >= minCategory;
  }

  function decideBet(player, state, profile) {
    const br = state.bettingRound;
    const toCallChips = br.currentBetChips - br.committed[player.id];
    const best = StudRules.currentBestShowingHand(state);
    const isLeader = best.holderId === player.id;

    if (!isLeader && toCallChips > 0) {
      const showing = StudRules.evaluateShowingHand(state, player.id);
      const streetsLeft = StudRules.streetsRemaining(state);
      if (!AIProfiles.worthPursuing(showing, best.hand, streetsLeft, profile)) {
        return { action: "fold" };
      }
    }
    if (isLeader && worthRaisingAsLeaderStud(player, state, profile)) {
      const maxRaise = StudRules.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) return { action: "raise", raiseDollars: Math.min(state.raiseIncrementDollars, maxRaise) };
    }
    return { action: "call" };
  }

  return { decideBuyOnDeal, decideWipe, decideBet };
})();

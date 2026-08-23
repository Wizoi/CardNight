"use strict";

// Three deterministic AI awareness profiles sharing one heuristic — not random
// per hand (only the *default assignment* of a profile to a seat is randomized,
// at setup time). Each function takes the profile as data so all three seats
// run through the same decision logic with different thresholds.
const AIProfiles = (function () {
  const PROFILES = {
    cautious: {
      name: "cautious",
      label: "Cautious",
      buyWildOnlyOnCategoryGain: true, // only pays for a 9 if it changes the hand's category, not just a kicker
      chancePerCard: 0.5, // how many "hand categories" of gap one more unknown flip is assumed worth closing
      raiseWhenLeading: false,
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.TWO_PAIR, // guts games: a fully-known hand needs to be genuinely strong to risk the ante
    },
    balanced: {
      name: "balanced",
      label: "Balanced",
      buyWildOnlyOnCategoryGain: false,
      chancePerCard: 1,
      raiseWhenLeading: true,
      raiseMinCategory: HandEvaluator.CATEGORY.TWO_PAIR, // won't raise on a lead this thin
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.PAIR,
    },
    aggressive: {
      name: "aggressive",
      label: "Aggressive",
      buyWildOnlyOnCategoryGain: false,
      chancePerCard: 1.5,
      raiseWhenLeading: true,
      raiseMinCategory: HandEvaluator.CATEGORY.PAIR, // presses even a modest lead
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.HIGH_CARD, // stays in almost every guts hand -- fits the reckless archetype
    },
  };

  const PROFILE_NAMES = Object.keys(PROFILES);

  function randomProfileName() {
    return PROFILE_NAMES[Math.floor(Math.random() * PROFILE_NAMES.length)];
  }

  function profileFor(name) {
    return PROFILES[name] || PROFILES.balanced;
  }

  function decideBuy3(player) {
    // The 3 is required to stay in the hand at all — always buy if it's
    // affordable, regardless of profile.
    return player.wallet.chips >= ChipEconomy.dollarsToChips(3);
  }

  // Judged only from what's actually face-up so far — a player doesn't know
  // their own still-hidden cards any more than an opponent watching them
  // would, so this can't peek at the rest of the hand.
  function decideBuy9(player, profile, cardIndex) {
    if (player.wallet.chips < ChipEconomy.dollarsToChips(2)) return false;
    const faceUp = player.hand.filter((c) => c.faceUp);
    const asCards = (nineIsWild) =>
      faceUp.map((c, i) => ({ rank: c.rank, suit: c.suit, isWild: i === cardIndex ? nineIsWild : c.isWild }));
    const withWild = HandEvaluator.evaluatePartial(asCards(true));
    const withoutWild = HandEvaluator.evaluatePartial(asCards(false));
    if (!HandEvaluator.isBetter(withWild, withoutWild)) return false;
    // Cautious skips a wild that's only a marginal kicker bump to an already-made
    // hand, but with nothing made yet (still just High Card), a wild is cheap
    // insurance worth taking regardless of profile — there's a whole hand of
    // future flips left to pair it with.
    if (profile.buyWildOnlyOnCategoryGain && withoutWild.category > HandEvaluator.CATEGORY.HIGH_CARD) {
      return withWild.category > withoutWild.category;
    }
    return true;
  }

  function decideBuy4(player) {
    return player.wallet.chips >= ChipEconomy.dollarsToChips(1);
  }

  // No legitimate basis to prefer one still-hidden card over another — flip in
  // dealt order rather than peeking to pick a "better" one.
  function decideNextCardIndex(player) {
    return player.hand.findIndex((c) => !c.faceUp);
  }

  // Worth continuing/calling without knowing what's actually under the
  // remaining cards: weigh the category gap against how many unknown flips
  // are left to close it, at a profile-scaled optimism per flip. This is the
  // same reasoning a player watching from outside the hand could make.
  function worthPursuing(showing, board, remainingCards, profile) {
    if (!HandEvaluator.isBetter(board, showing)) return true;
    const gap = board.category - showing.category;
    return remainingCards * profile.chancePerCard >= gap;
  }

  function decideContinue(player, state, profile) {
    const remaining = MidnightBaseball.remainingFaceDownCount(state, player.id);
    if (remaining === 0) return false;
    const showing = MidnightBaseball.evaluateShowingHand(state, player.id);
    const board = MidnightBaseball.currentBestHand(state).hand;
    return worthPursuing(showing, board, remaining, profile);
  }

  // A fully-revealed hand has no more upside (every card is already shown)
  // and nothing hidden from opponents either — raising it only makes sense if
  // it's genuinely strong, not just "currently ahead." Still-live hands get
  // the profile's normal (more lenient) threshold since they might improve.
  function worthRaisingAsLeader(player, state, profile) {
    if (!profile.raiseWhenLeading) return false;
    const showing = MidnightBaseball.evaluateShowingHand(state, player.id);
    const remaining = MidnightBaseball.remainingFaceDownCount(state, player.id);
    const minCategory = remaining === 0 ? HandEvaluator.CATEGORY.TRIPS : profile.raiseMinCategory;
    return showing.category >= minCategory;
  }

  function decideBet(player, state, profile) {
    const br = state.bettingRound;
    const toCallChips = br.currentBetChips - br.committed[player.id];
    const best = MidnightBaseball.currentBestHand(state);
    const isLeader = best.holderId === player.id;

    if (!isLeader && toCallChips > 0) {
      const showing = MidnightBaseball.evaluateShowingHand(state, player.id);
      const remaining = MidnightBaseball.remainingFaceDownCount(state, player.id);
      if (!worthPursuing(showing, best.hand, remaining, profile)) {
        return { action: "fold" };
      }
    }
    if (isLeader && worthRaisingAsLeader(player, state, profile)) {
      const maxRaise = MidnightBaseball.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) return { action: "raise", raiseDollars: Math.min(state.raiseIncrementDollars, maxRaise) };
    }
    return { action: "call" };
  }

  return {
    PROFILES,
    PROFILE_NAMES,
    randomProfileName,
    profileFor,
    decideBuy3,
    decideBuy9,
    decideBuy4,
    decideNextCardIndex,
    worthPursuing,
    decideContinue,
    decideBet,
  };
})();

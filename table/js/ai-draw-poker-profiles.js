"use strict";

// AI decisions for Pair of Jacks, Trips to Win. A qualifying hand always
// opens when nobody has yet (checking a strong-enough-to-open hand just
// risks a wasted redeal for no upside) -- every profile agrees on that
// part. Betting afterward and the draw itself scale by profile the same
// way every other family's AI does.
const DrawPokerAIProfiles = (function () {
  function decideBet(player, state, profile) {
    const br = state.bettingRound;
    const toCallChips = br.currentBetChips - br.committed[player.id];
    const hand = RulesDrawPoker.evaluateHand(player.hand);

    if (state.status === "opening" && !state.openedThisRound) {
      if (RulesDrawPoker.qualifiesToOpen(hand)) {
        return { action: "raise", raiseDollars: state.raiseIncrementDollars };
      }
      return { action: "call" }; // check -- can't open, nothing else to do yet
    }

    // A bluff here is a genuine bluff (raising post-open on a hand that
    // wouldn't otherwise justify it) -- not applicable to the mandatory
    // opening decision above, which is a hard qualify/don't-qualify rule,
    // not a confidence judgment.
    if (AIProfiles.shouldBluff(profile)) {
      const maxRaise = RulesDrawPoker.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) return { action: "raise", raiseDollars: AIProfiles.scaledRaiseDollars(AIProfiles.bluffRaiseTier(profile), state.raiseIncrementDollars, maxRaise) };
    }

    const isFinal = state.status === "finalBetting";
    // Games.md requires Trips-or-better to actually WIN -- so the final
    // round judges against that floor directly; before the draw there's
    // still upside, so a plain pair is worth defending for now. These are
    // hard category floors, not gap-vs-unknowns heuristics, so pot odds/
    // opponent-count don't have a natural place to plug in here the way
    // they do in every other family's decideBet.
    if (toCallChips > 0) {
      const belowFloor = isFinal ? hand.category < HandEvaluator.CATEGORY.TRIPS : hand.category < HandEvaluator.CATEGORY.PAIR;
      // Hero call (design review finding #10, closed out 2026-11-23):
      // currently only Subversive's patternBreakRate ever fires this.
      // Calling here never risks winning a hand that can't legally win --
      // games.md's Trips-or-better-to-win rule still applies at showdown --
      // it's just occasionally seeing a hand through instead of folding
      // reflexively against the hard floor.
      if (belowFloor) return AIProfiles.shouldHeroCall(profile) ? { action: "call" } : { action: "fold" };
    }
    if (profile.raiseWhenLeading || AIProfiles.breaksPattern(profile)) {
      const minCategory = isFinal ? HandEvaluator.CATEGORY.TRIPS : profile.raiseMinCategory;
      if (hand.category >= minCategory) {
        const maxRaise = RulesDrawPoker.maxRaiseDollars(state, player.id);
        if (maxRaise > 0) {
          const tier = AIProfiles.confidenceTier(hand.category - minCategory);
          return { action: "raise", raiseDollars: AIProfiles.scaledRaiseDollars(tier, state.raiseIncrementDollars, maxRaise) };
        }
      }
    }
    return { action: "call" };
  }

  // Keeps whatever paired rank(s) exist (any group of 2+), discarding
  // everything else up to the allowed max; with no pair at all, keeps only
  // the single highest card. A simple, standard draw-poker heuristic, not
  // a fully optimal one -- same spirit as every other AI decision in this
  // project.
  //
  // The two-pair break (design review follow-up, 2026-11-24): this game's
  // own rule requires Trips-or-better to actually WIN at showdown, so a
  // made two pair can never win outright on its own. Keeping both pairs
  // and drawing 1 only reaches a full house about 8.5% of the time (4/47);
  // breaking the lower pair and drawing 3 to the higher one reaches Trips
  // or better about 12.7% of the time (trips 11.4% + full house 1.0% +
  // quads 0.3%) -- strictly better odds for everyone, except that holding
  // onto an already-made hand instead of breaking it for better odds is
  // exactly the Fortress's loss-averse psychology (the same `lossAversion
  // >= 2` bar decideBuy4 already uses for "treats even a cheap gamble as
  // not worth the risk"). `profile` is optional so a caller that hasn't
  // resolved one yet keeps the old (keep-both-pairs) behavior.
  function decideDraw(player, profile) {
    const hand = player.hand;
    // A Joker is always wild (games.md's "House rule: playing with
    // Jokers") -- keep it regardless of whether it happens to form a
    // natural pair with anything, since a lone Joker isn't its own
    // rankCounts group but is still strictly worth keeping.
    const jokerIdx = hand.map((c, i) => (c.rank === "JOKER" ? i : -1)).filter((i) => i >= 0);
    const nonJokerHand = hand.filter((c) => c.rank !== "JOKER");
    const rankCounts = {};
    for (const c of nonJokerHand) rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
    const groupRanks = Object.keys(rankCounts).filter((r) => rankCounts[r] >= 2);
    const isTwoPair = groupRanks.length === 2 && jokerIdx.length === 0 && groupRanks.every((r) => rankCounts[r] === 2);
    let keepIdx;
    if (isTwoPair && profile && !(profile.lossAversion >= 2)) {
      const higherRank = groupRanks.reduce((a, b) => (Deck.RANK_VALUES[a] >= Deck.RANK_VALUES[b] ? a : b));
      keepIdx = hand.map((c, i) => (c.rank === higherRank ? i : -1)).filter((i) => i >= 0);
    } else if (groupRanks.length) {
      keepIdx = hand.map((c, i) => (groupRanks.includes(c.rank) ? i : -1)).filter((i) => i >= 0);
    } else if (nonJokerHand.length === 0) {
      keepIdx = [];
    } else {
      let bestIdx = hand.findIndex((c) => c.rank !== "JOKER");
      hand.forEach((c, i) => {
        if (c.rank !== "JOKER" && Deck.RANK_VALUES[c.rank] > Deck.RANK_VALUES[hand[bestIdx].rank]) bestIdx = i;
      });
      keepIdx = [bestIdx];
    }
    keepIdx = [...new Set(keepIdx.concat(jokerIdx))];
    const maxDiscards = RulesDrawPoker.maxDiscardsFor(player);
    let discardIdx = hand.map((_, i) => i).filter((i) => !keepIdx.includes(i));
    if (discardIdx.length > maxDiscards) discardIdx = discardIdx.slice(0, maxDiscards);
    return discardIdx;
  }

  return { decideBet, decideDraw };
})();

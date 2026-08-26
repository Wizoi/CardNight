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

    const isFinal = state.status === "finalBetting";
    // Games.md requires Trips-or-better to actually WIN -- so the final
    // round judges against that floor directly; before the draw there's
    // still upside, so a plain pair is worth defending for now.
    if (toCallChips > 0) {
      if (isFinal && hand.category < HandEvaluator.CATEGORY.TRIPS) return { action: "fold" };
      if (!isFinal && hand.category < HandEvaluator.CATEGORY.PAIR) return { action: "fold" };
    }
    if (profile.raiseWhenLeading) {
      const minCategory = isFinal ? HandEvaluator.CATEGORY.TRIPS : profile.raiseMinCategory;
      if (hand.category >= minCategory) {
        const maxRaise = RulesDrawPoker.maxRaiseDollars(state, player.id);
        if (maxRaise > 0) return { action: "raise", raiseDollars: Math.min(state.raiseIncrementDollars, maxRaise) };
      }
    }
    return { action: "call" };
  }

  // Keeps whatever paired rank(s) exist (any group of 2+), discarding
  // everything else up to the allowed max; with no pair at all, keeps only
  // the single highest card. A simple, standard draw-poker heuristic, not
  // a fully optimal one -- same spirit as every other AI decision in this
  // project.
  function decideDraw(player) {
    const hand = player.hand;
    const rankCounts = {};
    for (const c of hand) rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
    const groupRanks = Object.keys(rankCounts).filter((r) => rankCounts[r] >= 2);
    let keepIdx;
    if (groupRanks.length) {
      keepIdx = hand.map((c, i) => (groupRanks.includes(c.rank) ? i : -1)).filter((i) => i >= 0);
    } else {
      let bestIdx = 0;
      hand.forEach((c, i) => {
        if (Deck.RANK_VALUES[c.rank] > Deck.RANK_VALUES[hand[bestIdx].rank]) bestIdx = i;
      });
      keepIdx = [bestIdx];
    }
    const maxDiscards = RulesDrawPoker.maxDiscardsFor(player);
    let discardIdx = hand.map((_, i) => i).filter((i) => !keepIdx.includes(i));
    if (discardIdx.length > maxDiscards) discardIdx = discardIdx.slice(0, maxDiscards);
    return discardIdx;
  }

  return { decideBet, decideDraw };
})();

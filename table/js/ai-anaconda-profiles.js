"use strict";

// AI decisions for Anaconda. Discarding (both rounds) keeps whatever's
// part of a pair/group and throws the lowest lone cards first -- the same
// spirit as every other family's simple discard/pass heuristics in this
// project (Deep or Double Screw's passing, Pair of Jacks' draw). Betting
// mirrors the stud family's own shape: a player's own current best-
// achievable hand judged against a flat bar, scaled by how many of the 5
// reveal rounds are still left.
const AnacondaAIProfiles = (function () {
  function chooseDiscards(hand, count) {
    const rankCounts = {};
    for (const c of hand) rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
    const sorted = hand
      .map((c, i) => ({ c, i }))
      .sort((a, b) => {
        const aGrouped = rankCounts[a.c.rank] >= 2 ? 1 : 0;
        const bGrouped = rankCounts[b.c.rank] >= 2 ? 1 : 0;
        if (aGrouped !== bGrouped) return aGrouped - bGrouped;
        return Deck.RANK_VALUES[a.c.rank] - Deck.RANK_VALUES[b.c.rank];
      });
    return sorted.slice(0, count).map((x) => x.i);
  }

  function decideDiscard1(player) {
    return chooseDiscards(player.hand, 3);
  }

  function decideDiscard2(player) {
    return chooseDiscards(player.hand, 2);
  }

  function decideBet(player, state, profile) {
    const br = state.bettingRound;
    const toCallChips = br.currentBetChips - br.committed[player.id];
    const cards = player.hand.map((c) => ({ rank: c.rank, suit: c.suit, isWild: false }));
    const myHand = HandEvaluator.evaluatePartial(cards);
    const revealsLeft = 5 - state.revealsDone;

    if (toCallChips > 0) {
      const gap = HandEvaluator.CATEGORY.PAIR - myHand.category;
      if (gap > 0 && revealsLeft * profile.chancePerCard < gap) return { action: "fold" };
    }
    if (profile.raiseWhenLeading) {
      const minCategory = revealsLeft <= 0 ? HandEvaluator.CATEGORY.TRIPS : profile.raiseMinCategory;
      if (myHand.category >= minCategory) {
        const maxRaise = RulesAnaconda.maxRaiseDollars(state, player.id);
        if (maxRaise > 0) return { action: "raise", raiseDollars: Math.min(state.raiseIncrementDollars, maxRaise) };
      }
    }
    return { action: "call" };
  }

  return { decideDiscard1, decideDiscard2, decideBet };
})();

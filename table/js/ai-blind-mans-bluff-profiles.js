"use strict";

// AI decisions for Blind Man's Bluff. The deciding player can never see
// their OWN card (the whole point of the game) -- judged only from the
// best card any other still-active player is showing, the one piece of
// real information available. Never reads the AI's own hidden card, same
// discipline ai-profiles.js's header comment already documents for
// Midnight Baseball's self-reveal convention.
const BlindMansBluffAIProfiles = (function () {
  function bestOtherVisibleRankValue(player, state) {
    const others = state.players.filter((p) => p.id !== player.id && !p.folded);
    if (!others.length) return 0;
    return Math.max(...others.map((p) => Deck.RANK_VALUES[p.hand[0].rank]));
  }

  function decideBet(player, state, profile) {
    const br = state.bettingRound;
    const toCallChips = br.currentBetChips - br.committed[player.id];
    const bestOther = bestOtherVisibleRankValue(player, state);

    // A bluff here means raising despite the best visible opposing card
    // NOT actually being reassuringly low -- same shared shape as every
    // other family, even though this game has no "own hand category" to
    // judge from at all (the whole point is the player can't see their
    // own card).
    if (AIProfiles.shouldBluff(profile)) {
      const maxRaise = BlindMansBluffRules.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) return { action: "raise", raiseDollars: AIProfiles.scaledRaiseDollars(1, state.raiseIncrementDollars, maxRaise) };
    }

    if (toCallChips > 0 && bestOther >= profile.blindBluffScaryRankValue) {
      return { action: "fold" };
    }
    if (bestOther < profile.blindBluffRaiseBelowRankValue) {
      const maxRaise = BlindMansBluffRules.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) {
        // No hand category exists to build a confidence gap from -- the
        // rank gap below the raise threshold stands in for it instead,
        // bucketed into the same tier scale (every 3 ranks of margin is
        // roughly one tier more confident).
        const tier = AIProfiles.confidenceTier(Math.floor((profile.blindBluffRaiseBelowRankValue - bestOther) / 3));
        return { action: "raise", raiseDollars: AIProfiles.scaledRaiseDollars(tier, state.raiseIncrementDollars, maxRaise) };
      }
    }
    return { action: "call" };
  }

  return { decideBet, bestOtherVisibleRankValue };
})();

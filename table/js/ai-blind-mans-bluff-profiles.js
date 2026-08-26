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

    if (toCallChips > 0 && bestOther >= profile.blindBluffScaryRankValue) {
      return { action: "fold" };
    }
    if (bestOther < profile.blindBluffRaiseBelowRankValue) {
      const maxRaise = BlindMansBluffRules.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) return { action: "raise", raiseDollars: Math.min(state.raiseIncrementDollars, maxRaise) };
    }
    return { action: "call" };
  }

  return { decideBet, bestOtherVisibleRankValue };
})();

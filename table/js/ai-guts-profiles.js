"use strict";

// AI decisions for the open-loop Guts engine. Genuinely simpler than every
// other family's AI: a guts hand is fully known to its owner the moment
// it's dealt (nothing hidden, nothing still to be revealed), so there's no
// "gap vs. remaining unknowns" reasoning here — just a flat per-profile
// bar (AIProfiles.PROFILES[*].gutsMinCategoryToStay) the hand's category
// has to clear to be worth risking the ante on.
const GutsAIProfiles = (function () {
  // Aggressive's bar (HandEvaluator.CATEGORY.HIGH_CARD) is deliberately the
  // lowest category that exists, but treating that as "always stay" would
  // make an escalating cycle with 2+ aggressive seats mathematically unable
  // to ever reach a solo winner. So a bare High Card still needs a genuinely
  // strong top card (Jack or better) to clear the bar — every other
  // category threshold is unaffected by this.
  //
  // A fixed category bar also doesn't scale with hand size: a pair is
  // unremarkable in a 7-card hand (most random 7-card hands have one) but a
  // real signal in a 3-4 card hand. `gameConfig.categoryShift` (Deep or
  // Double Screw's 6-7 card hands use +2) raises every profile's bar so
  // "stay in" stays a genuine, discriminating decision regardless of deal
  // size — without it, an escalating cycle with several bigger-handed
  // seats could statistically almost never reach a solo winner.
  function decideStayIn(player, state, profile) {
    const hand = GutsRules.evaluateHand(state, player);
    const shift = state.gameConfig.categoryShift || 0;
    if (hand.category > HandEvaluator.CATEGORY.HIGH_CARD || shift > 0) {
      return hand.category >= profile.gutsMinCategoryToStay + shift;
    }
    if (profile.gutsMinCategoryToStay > HandEvaluator.CATEGORY.HIGH_CARD) return false;
    const topRankValue = hand.tiebreakers && hand.tiebreakers[0];
    return topRankValue >= Deck.RANK_VALUES.J;
  }

  // 3 Buy 5 / 5 Buy 5's optional one-card exchange: worth it only if there's
  // a non-wild card actually worth upgrading (the weakest one in hand) and
  // the player can afford it. A disciplined profile skips the gamble
  // outright — a fresh random card is exactly as likely to hurt as help.
  // Reuses buyWildOnlyOnCategoryGain (the baseball family's own "skip a
  // marginal gamble unless it's clearly worth it" flag) rather than a
  // profile-name check. This used to read `profile.name === "cautious"`,
  // which worked fine when Fortress was the one archetype mapped straight to
  // the literal "cautious" profile -- but the 2026-08-28 archetype-profile
  // expansion (every archetype gets its own dedicated profile, named after
  // itself) meant no real archetype's profile.name is "cautious" anymore,
  // which would have silently broken this check for everyone. Caught and
  // fixed in the same pass, not left as a surprise for later.
  function decideBuyExchange(player, state, profile) {
    if (profile.buyWildOnlyOnCategoryGain) return -1;
    if (!state.gameConfig.exchangePriceDollars) return -1;
    if (player.wallet.chips < ChipEconomy.dollarsToChips(state.gameConfig.exchangePriceDollars)) return -1;
    let worstIdx = -1;
    let worstValue = Infinity;
    player.hand.forEach((c, i) => {
      if (GutsRules.isCardWild(state, c)) return;
      const v = Deck.RANK_VALUES[c.rank];
      if (v < worstValue) {
        worstValue = v;
        worstIdx = i;
      }
    });
    return worstIdx;
  }

  return { decideStayIn, decideBuyExchange };
})();

"use strict";

// AI decisions for the shared PressYourLuckRules engine (5.5-21, 7-27).
// No hidden opponent information matters here at all -- every decision is
// judged purely from the deciding player's OWN hand against the two fixed
// targets, so there's no "gap vs. remaining unknowns" reasoning the way
// stud/hold'em profiles need; just a stand-once-close-enough threshold.
const PressYourLuckAIProfiles = (function () {
  // Distance to the nearer of the two targets (post-bust-check under
  // 'bust' rule) drives the stand/hit call uniformly for both games --
  // 'bust' additionally forces a stand once both sides are already busted
  // (hitting further can only ever hurt, never help, at that point).
  function decideHitOrStand(player, state, profile) {
    const cfg = state.gameConfig;
    const low = PressYourLuckRules.handSumResult(state, player, cfg.lowTarget);
    const high = PressYourLuckRules.handSumResult(state, player, cfg.highTarget);
    if (low.busted && high.busted) return "stand";
    const bestDistance = Math.min(low.busted ? Infinity : low.distance, high.busted ? Infinity : high.distance);
    return bestDistance <= profile.pressYourLuckStandThreshold ? "stand" : "hit";
  }

  // 7-27's buy-back: worth it only for a low-value card (face cards, or a
  // 2-3) that isn't meaningfully close to either target on its own --
  // cautious/balanced will pay for a fresh chance at a better card;
  // aggressive embraces whatever it's dealt and never buys back, fitting
  // the archetype's reckless lean established elsewhere (guts' stay-in bar,
  // stud's raise threshold).
  function decideBuyBack(player, state, profile) {
    if (profile.name === "aggressive") return false;
    const cfg = state.gameConfig;
    if (!cfg.buyBack || player.buyBacksUsed >= cfg.buyBack.maxBuys) return false;
    const priceDollars = cfg.buyBack.priceScheduleDollars[player.buyBacksUsed];
    if (player.wallet.chips < ChipEconomy.dollarsToChips(priceDollars)) return false;
    const justDealt = player.hand[player.hand.length - 1];
    const values = cfg.cardValue(justDealt);
    const bestValue = Math.max(...values);
    return bestValue <= 1;
  }

  return { decideHitOrStand, decideBuyBack };
})();

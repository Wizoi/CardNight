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
  //
  // Real bug, caught by a live Playwright pass on 7-27 (bustRule: 'noBust')
  // hanging for minutes on a single hand: no card in this family is ever
  // worth less than 0 (face cards are the floor at 0.5), so every
  // achievable sum only grows as more cards are added -- it can never come
  // back down. Under 'noBust' there's no "busted, forced to stop" escape
  // valve at all, so once a hand's SMALLEST achievable sum already clears
  // the higher target, hitting again can only push both distances further
  // away, no matter how far outside the stand threshold the current
  // distance is. Without this check an aggressive profile (threshold 0.5)
  // that overshot both targets early would just keep hitting forever,
  // hoping to get closer -- structurally impossible -- until the deck ran
  // dry. (Latent under 'bust' too, but masked there: both-sides-busted
  // already forces a stand before this could ever matter.)
  function decideHitOrStand(player, state, profile) {
    const cfg = state.gameConfig;
    const low = PressYourLuckRules.handSumResult(state, player, cfg.lowTarget);
    const high = PressYourLuckRules.handSumResult(state, player, cfg.highTarget);
    if (low.busted && high.busted) return "stand";
    const bestDistance = Math.min(low.busted ? Infinity : low.distance, high.busted ? Infinity : high.distance);
    if (bestDistance <= profile.pressYourLuckStandThreshold) return "stand";
    const minAchievableSum = Math.min(...TargetSumEvaluator.achievableSums(player.hand, cfg.cardValue));
    if (minAchievableSum > cfg.highTarget) return "stand";
    return "hit";
  }

  // 7-27's buy-back: worth it only for a low-value card (face cards, or a
  // 2-3) that isn't meaningfully close to either target on its own -- a
  // disciplined/moderate profile will pay for a fresh chance at a better
  // card; a genuinely reckless one embraces whatever it's dealt and never
  // buys back. Judged off pressYourLuckStandThreshold itself (this game's
  // own recklessness knob) rather than a profile-name check -- fixed
  // 2026-08-28 alongside the archetype-profile expansion, since a hardcoded
  // `profile.name === "aggressive"` stopped matching anything the moment no
  // real archetype's profile was still literally named "aggressive." The
  // 0.5 cutoff catches the same reckless lean the original "aggressive"
  // profile had (still exactly 0.5) plus anything looser (e.g. Live Wire's
  // 0.25), while archetypes that lean loose for other reasons without being
  // truly reckless (e.g. Streak Chaser's 0.75) still get to buy back.
  function decideBuyBack(player, state, profile) {
    if (profile.pressYourLuckStandThreshold <= 0.5) return false;
    const cfg = state.gameConfig;
    if (!cfg.buyBack || player.buyBacksUsed >= cfg.buyBack.maxBuys) return false;
    const priceDollars = cfg.buyBack.priceScheduleDollars[player.buyBacksUsed];
    if (player.wallet.chips < ChipEconomy.dollarsToChips(priceDollars)) return false;
    const justDealt = player.hand[player.hand.length - 1];
    const values = cfg.cardValue(justDealt);
    const bestValue = Math.max(...values);
    return bestValue <= 1;
  }

  // Betting (5.5-21 and 7-27, both bettingEnabled now): no hidden info
  // here either, so this just reuses the same "distance to the nearer
  // target" read decideHitOrStand already computes. Busted on both sides
  // (only possible under 'bust' rule -- never true for 7-27's 'noBust')
  // means there's nothing left to play for, so that's an automatic fold
  // when facing a bet, per the user's explicit correction. Otherwise it's
  // the same pressYourLuckStandThreshold bar, just applied to a bet/fold/
  // raise decision instead of hit/stand.
  function decideBet(player, state, profile) {
    const br = state.bettingRound;
    const toCallChips = br.currentBetChips - br.committed[player.id];
    const cfg = state.gameConfig;
    const low = PressYourLuckRules.handSumResult(state, player, cfg.lowTarget);
    const high = PressYourLuckRules.handSumResult(state, player, cfg.highTarget);

    if (low.busted && high.busted) {
      return toCallChips > 0 ? { action: "fold" } : { action: "call" };
    }
    const bestDistance = Math.min(low.busted ? Infinity : low.distance, high.busted ? Infinity : high.distance);
    if (toCallChips > 0 && bestDistance > profile.pressYourLuckStandThreshold + 2) {
      return { action: "fold" };
    }
    if (profile.raiseWhenLeading && bestDistance <= profile.pressYourLuckStandThreshold) {
      const maxRaise = PressYourLuckRules.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) return { action: "raise", raiseDollars: Math.min(state.raiseIncrementDollars, maxRaise) };
    }
    return { action: "call" };
  }

  return { decideHitOrStand, decideBuyBack, decideBet };
})();

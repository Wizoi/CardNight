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
  // Returns "buyBack" | "payFlex" | "keep" -- payFlex (7-27's optional $1
  // flexible-10 purchase) is checked first since it's cheap, pure upside,
  // and mutually exclusive with buying the card back outright (added
  // 2026-08-29 alongside the feature itself).
  function decideBuyBack(player, state, profile) {
    if (profile.pressYourLuckStandThreshold <= 0.5) return "keep";
    const cfg = state.gameConfig;
    if (PressYourLuckRules.canPayFlexTen(state, player.id) && player.wallet.chips >= ChipEconomy.dollarsToChips(cfg.flexTenPriceDollars)) {
      return "payFlex";
    }
    if (!cfg.buyBack || player.buyBacksUsed >= cfg.buyBack.maxBuys) return "keep";
    const priceDollars = cfg.buyBack.priceScheduleDollars[player.buyBacksUsed];
    if (player.wallet.chips < ChipEconomy.dollarsToChips(priceDollars)) return "keep";
    const justDealt = player.hand[player.hand.length - 1];
    const values = cfg.cardValue(justDealt);
    const bestValue = Math.max(...values);
    return bestValue <= 1 ? "buyBack" : "keep";
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
    // A player facing their very first bet has only their 1-2 initial
    // cards to judge from -- nowhere close to either target yet, with a
    // whole hand of voluntary hits still ahead to close the gap. Folding
    // that early off raw current distance was too hasty (reported
    // 2026-08-29: too many AI seats folding right after the deal in 7-27,
    // a noBust game where going over doesn't even disqualify a hand, so an
    // early "far from target" reading is especially weak evidence). Loosen
    // the fold bar while the hand is still small, tightening back to the
    // original bar as more cards accumulate and there's genuinely less
    // room left to close the distance.
    // A bluff raise here means pushing chips in despite an unsettled (or
    // outright bad) distance -- independent of isLocked below on purpose,
    // same shared shape as every other family.
    if (AIProfiles.shouldBluff(profile)) {
      const maxRaise = PressYourLuckRules.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) return { action: "raise", raiseDollars: AIProfiles.scaledRaiseDollars(1, state.raiseIncrementDollars, maxRaise) };
    }
    // The 2026-08-26 loosened bar above still wasn't enough for 5.5-21's
    // stricter 'bust' rule: a single mid/high card (6 through 10) already
    // busts the low side outright, leaving bestDistance measured against
    // the FAR-AWAY high target (11-15 points off) even though the player
    // has had zero real decisions yet -- no hit/stand round has even
    // happened. That blew straight through the flat +3 roomToImprove
    // allowance and folded on the very first bet of the hand. Reported
    // directly: "we didn't even get a card or do anything, there is no
    // reason to fold on the first card in this game." Since games.md's own
    // opening betting round fires right after the FIRST card -- before any
    // hit/stand decision exists to judge from at all -- there's no
    // meaningful signal yet to fold on regardless of profile; skip the
    // fold check entirely for as long as a player is still sitting on just
    // their initial deal.
    const isOpeningRound = player.hand.length <= cfg.initialDeal.faceUp.length;
    const roomToImprove = Math.max(0, 4 - player.hand.length);
    // potOddsChanceBonus's units are "categories per unknown card" in
    // every other family -- this game measures distance in raw target
    // units instead, a much coarser scale, so the bonus is scaled up (x3)
    // to have a comparable, meaningful effect here rather than rounding
    // away to nothing against a typical 1.5-4 point threshold.
    const chanceBonus =
      (AIProfiles.potOddsChanceBonus(toCallChips, state.pot) +
        AIProfiles.reRaiseChanceAdjustment(br, player.id, profile) +
        AIProfiles.opponentLoosenessAdjustment(state.opponentStats, AIProfiles.liveOpponentIds(state.players, player.id), profile)) *
      3;
    if (!isOpeningRound && toCallChips > 0 && bestDistance > profile.pressYourLuckStandThreshold + 2 + roomToImprove + chanceBonus) {
      return { action: "fold" };
    }
    // Raising means "I'm confident I'm ahead," but a hand that's still
    // actively taking cards (hasn't stood) has no fixed value yet -- its
    // current distance is just where it happens to be mid-hand, not a
    // result anyone (including this player, who may well hit again) can
    // actually bank on. Reported 2026-08-29: an AI raised on an 8 (only
    // 1 away from the low target) while still planning to take more
    // cards -- a real distance, but not a settled one. Only a genuinely
    // locked-in value -- already standing (no more cards coming, so this
    // IS the final number), or an exact hit on a target (can't get any
    // closer, whether standing yet or not) -- counts as confident enough
    // to raise; anything else, even a currently-good distance, calls
    // instead and waits to see how the hand actually settles.
    const isLocked = player.standing || bestDistance === 0;
    // Fewer live opponents justifies raising with a slightly less perfect
    // locked distance (fewer hands to beat); more live opponents wants a
    // tighter one -- same opponentCountBarAdjustment units as every other
    // family, just subtracted from a distance threshold instead of added
    // to a category one (a category bar goes UP for less confidence, a
    // distance threshold goes DOWN for the same effect).
    const barAdjustment = AIProfiles.opponentCountBarAdjustment(AIProfiles.liveOpponentCount(state.players, player.id));
    const raiseThreshold = profile.pressYourLuckStandThreshold - barAdjustment;
    if (profile.raiseWhenLeading && isLocked && bestDistance <= raiseThreshold) {
      const maxRaise = PressYourLuckRules.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) {
        const tier = AIProfiles.confidenceTier(Math.floor(raiseThreshold - bestDistance));
        return { action: "raise", raiseDollars: AIProfiles.scaledRaiseDollars(tier, state.raiseIncrementDollars, maxRaise) };
      }
    }
    return { action: "call" };
  }

  return { decideHitOrStand, decideBuyBack, decideBet };
})();

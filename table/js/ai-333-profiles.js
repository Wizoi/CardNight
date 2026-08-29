"use strict";

// AI betting for 3-33. A player's hand only ever shrinks (cards get
// discarded on a community match, never replaced or improved), so this is
// simpler than most: judge how close the CURRENT hand already is to
// either target, tolerating a wider gap the more reveal rounds are still
// left (reusing the existing chancePerCard/raiseWhenLeading profile
// fields rather than inventing a new dimension just for this one game).
//
// FOLD_BASE re-tuned 2026-08-26 (3 -> 9) after the user noticed AIs
// folding constantly with no apparent reason to. A fresh 3-card hand's
// bestDistance (the closer of its two independently-optimal low/high
// reads) averages ~9.4 with a 30/50/70th percentile of 7/10/12 across
// 5000 random deals -- the old base of 3 meant even the loosest
// (aggressive) profile's threshold at the very first bet, right after the
// deal (3 + 5*1.5 = 10.5), was already below the average hand's own gap,
// so a genuinely typical hand folded before ever seeing a single reveal.
// Simulated 300 full hands per candidate base: base=3 folded out (never
// reaching a real showdown) ~30% of hands at ~1.85 folds/hand; base=9
// brought that to ~17% and ~1.0 folds/hand -- enough folding to still be
// real (a hopeless hand late with someone else clearly ahead should
// fold), without making folding the default outcome of a merely average
// deal.
const Rules333AIProfiles = (function () {
  const FOLD_BASE = 9;

  function decideBet(player, state, profile) {
    const br = state.bettingRound;
    const toCallChips = br.currentBetChips - br.committed[player.id];
    const low = Rules333.handSumResult(state, player, Rules333.LOW_TARGET);
    const high = Rules333.handSumResult(state, player, Rules333.HIGH_TARGET);
    const bestDistance = Math.min(low.distance, high.distance);
    const roundsLeft = Rules333.TOTAL_ROUNDS - state.roundIndex;

    if (AIProfiles.shouldBluff(profile)) {
      const maxRaise = Rules333.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) return { action: "raise", raiseDollars: AIProfiles.scaledRaiseDollars(1, state.raiseIncrementDollars, maxRaise) };
    }
    // potOddsChanceBonus's units are "categories per unknown card" in most
    // families -- this game's fold check is in raw distance units, a
    // coarser scale, so the bonus is scaled up (x3) for a comparable
    // effect, same treatment as ai-press-your-luck-profiles.js.
    const potOddsBonus = AIProfiles.potOddsChanceBonus(toCallChips, state.pot) * 3;
    if (toCallChips > 0 && bestDistance > FOLD_BASE + roundsLeft * (profile.chancePerCard + potOddsBonus)) {
      return { action: "fold" };
    }
    const barAdjustment = AIProfiles.opponentCountBarAdjustment(AIProfiles.liveOpponentCount(state.players, player.id));
    const raiseThreshold = 2 - barAdjustment;
    if (profile.raiseWhenLeading && bestDistance <= raiseThreshold) {
      const maxRaise = Rules333.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) {
        const tier = AIProfiles.confidenceTier(Math.floor(raiseThreshold - bestDistance));
        return { action: "raise", raiseDollars: AIProfiles.scaledRaiseDollars(tier, state.raiseIncrementDollars, maxRaise) };
      }
    }
    return { action: "call" };
  }

  return { decideBet };
})();

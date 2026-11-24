"use strict";

// AI decisions for Wild in Your Hand. A player's hand is fully known the moment
// it's dealt (nothing hidden), so this is the same flat per-profile
// category bar every other Guts game's AI uses (AIProfiles.PROFILES[*].
// gutsMinCategoryToStay), shifted up for hand size via
// gameConfig.categoryShift -- see ai-guts-profiles.js's own comments for
// why a flat bar needs that shift at all. The SAME bar check drives both
// kinds of decision here: whether to pay 50c to see the next pyramid row,
// and the final simultaneous in/out declare -- both are really the same
// underlying judgment ("is my hand worth continuing to risk money on"),
// just asked at different points as more of the pyramid gets revealed.
const WildInYourHandAIProfiles = (function () {
  const PYRAMID_ROWS = 3;

  // Scaled per-profile by gutsPotRiskSensitivity, same reasoning as
  // ai-guts-profiles.js's own potRiskShift (2026-11-23, design review
  // finding #5) -- against the ante POOL (state.antePoolChips) rather
  // than state.pot, since that's the exact amount a declare-stage loser
  // actually has to match here (row-betting chips sit in state.pot too,
  // but aren't part of what escalates the ante-pool match).
  function potRiskShift(state, profile) {
    const anteChips = ChipEconomy.dollarsToChips(state.anteDollars || 0.5);
    if (anteChips <= 0) return 0;
    const potInAntes = state.antePoolChips / anteChips;
    const sensitivity = profile.gutsPotRiskSensitivity == null ? 1 : profile.gutsPotRiskSensitivity;
    return Math.min(2, Math.floor((potInAntes / 4) * sensitivity));
  }

  function worthContinuing(player, state, profile, shiftOverride) {
    const hand = WildInYourHandRules.evaluateHand(state, player);
    const shift = shiftOverride != null ? shiftOverride : (state.gameConfig.categoryShift || 0) + potRiskShift(state, profile);
    if (hand.category > HandEvaluator.CATEGORY.HIGH_CARD || shift > 0) {
      return hand.category >= profile.gutsMinCategoryToStay + shift;
    }
    if (profile.gutsMinCategoryToStay > HandEvaluator.CATEGORY.HIGH_CARD) return false;
    const topRankValue = hand.tiebreakers && hand.tiebreakers[0];
    return topRankValue >= Deck.RANK_VALUES.J;
  }

  // Real bug, reported directly after live play (2026-11-23): "hardly
  // showed any flipups yet - why did everyone drop out???" -- a screenshot
  // showed both AI seats folding right after Row 1, before Rows 2/3 (more
  // wild ranks) ever revealed. The row-bet decision used to apply the SAME
  // bar as the final declare, even though it's a cheap (50c) call to see
  // MORE information, not the real money decision -- and a pyramid reveal
  // can only ever help a hand (each new wild rank either matches cards
  // already in a fixed 7-card hand or it doesn't; nothing gets taken away),
  // so folding before seeing the rest of the pyramid throws away free
  // upside for almost no savings. Loosens the bar by one tier per row still
  // left to reveal (capped at 0, never negative) -- Row 1's bet judges
  // against the full bar minus 2 tiers, Row 2's against minus 1, and by Row
  // 3 (nothing left to reveal before the real declare) it's back to the
  // exact same bar decideDeclare uses, unchanged below.
  function decideRowBet(player, state, profile) {
    const fullShift = state.gameConfig.categoryShift || 0;
    const rowsStillToReveal = Math.max(0, PYRAMID_ROWS - 1 - state.rowIndex);
    const loosenedShift = Math.max(0, fullShift - rowsStillToReveal);
    return worthContinuing(player, state, profile, loosenedShift);
  }

  // A small per-profile chance to stay in despite not clearing the bar --
  // the real risk decision here, unlike decideRowBet's cheap 50c
  // information call just above (2026-11-23, design review finding #5;
  // see ai-guts-profiles.js's decideStayIn for the identical reasoning).
  function decideDeclare(player, state, profile) {
    const staying = worthContinuing(player, state, profile);
    if (!staying && AIProfiles.shouldBluff(profile)) return true;
    return staying;
  }

  return { decideRowBet, decideDeclare };
})();

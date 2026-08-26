"use strict";

// AI decisions for Acey Ducey. No hidden information at all -- the shown
// cards ARE the whole decision, so this just estimates a win probability
// from the rank gap and bets a profile-scaled fraction of the pot (or
// passes outright if the gap doesn't clear the profile's safety bar).
const AceyDuceyAIProfiles = (function () {
  // 11 = every rank other than the two already shown (13 ranks total).
  // A rough approximation (doesn't account for cards already seen/drawn
  // elsewhere), same spirit as this project's other flat AI heuristics.
  function winProbability(gapInfo) {
    return gapInfo.gap / 11;
  }

  function decideBet(player, state, profile) {
    const info = AceyDuceyRules.gapInfo(state.shownCards);
    if (info.gap === 0) return 0; // adjacent ranks or a pair -- no bet can possibly win
    const prob = winProbability(info);
    if (prob < profile.aceyDuceyMinWinProb) return 0;
    const potDollars = ChipEconomy.chipsToDollars(state.pot);
    const rawBet = potDollars * profile.aceyDuceyBetFraction;
    const chipValueDollars = ChipEconomy.CHIP_VALUE_CENTS / 100;
    const roundedBet = Math.floor(rawBet / chipValueDollars) * chipValueDollars;
    const affordable = ChipEconomy.chipsToDollars(player.wallet.chips);
    return Math.max(0, Math.min(roundedBet, potDollars, affordable));
  }

  return { decideBet, winProbability };
})();

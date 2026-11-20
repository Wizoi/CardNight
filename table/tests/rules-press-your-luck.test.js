"use strict";

// 7-27's "down the river" buy-back: chains up to 2 within one turn, the
// 3rd and final buy-back only becomes available on a later, separate
// turn -- and a dealt 10 still offers the flex-value (0-or-10) choice
// even once lifetime buy-backs are exhausted (both were real, reported
// bugs -- see CLAUDE.md's 7-27 buy-back entries).

const { load } = require("./harness");
const { makeChecker } = require("./check");

function mkPlayers(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: "p" + i,
    name: "P" + i,
    isHuman: i === 0,
    wallet: { chips: 1000000 },
  }));
}

function run() {
  const { check, summary } = makeChecker();
  const { ChipEconomy, PressYourLuckRules, SEVEN_TWENTYSEVEN_CONFIG } = load(
    ["deck.js", "hand-evaluator.js", "chip-economy.js", "target-sum-evaluator.js", "betting-engine.js", "rules-press-your-luck.js", "game-configs-press-your-luck.js"],
    ["ChipEconomy", "PressYourLuckRules", "SEVEN_TWENTYSEVEN_CONFIG"]
  );
  const settings = { anteDollars: 0.25, raiseIncrementDollars: 0.25, maxBetDollars: 2 };

  function skipInitialAndBetting(state) {
    while (PressYourLuckRules.currentInitialBuybackPlayerId(state) != null) {
      const pid = PressYourLuckRules.currentInitialBuybackPlayerId(state);
      PressYourLuckRules.resolveInitialBuyback(state, pid, "keep");
    }
    if (state.status === "betting") {
      while (PressYourLuckRules.getCurrentBettor && PressYourLuckRules.getCurrentBettor(state)) {
        PressYourLuckRules.submitBet(state, PressYourLuckRules.getCurrentBettor(state), "call", 0);
      }
    }
  }

  // Chaining is capped at 2 per turn; the 3rd (lifetime-final) buy-back
  // is only offered again on a genuinely later turn, at the top price.
  {
    const players = mkPlayers(2);
    const state = PressYourLuckRules.createHandState(players, 0, settings, SEVEN_TWENTYSEVEN_CONFIG, 0);
    skipInitialAndBetting(state);

    let r1 = PressYourLuckRules.resolveHitOrStand(state, "p0", "hit");
    check("a fresh hit offers a decision", r1.needsBuyBack === true);

    let needsMore = r1.needsBuyBack;
    let chained = 0;
    while (needsMore && chained < 5) {
      const before = players[0].buyBacksUsed;
      const result = PressYourLuckRules.resolveBuyBack(state, "p0", "buyBack");
      if (players[0].buyBacksUsed > before) chained++;
      needsMore = result.needsBuyBack;
    }
    check("exactly 2 buy-backs chained in this one turn, not 3", chained === 2);
    check("the turn's own chain is closed even though 1 lifetime buy-back remains", needsMore === false);

    const r2 = PressYourLuckRules.resolveHitOrStand(state, "p0", "hit");
    check("a later, separate turn still offers the final lifetime buy-back", r2.needsBuyBack === true);
    const beforePrice = ChipEconomy.chipsToDollars(players[0].wallet.chips);
    PressYourLuckRules.resolveBuyBack(state, "p0", "buyBack");
    check("the 3rd buy-back is allowed through on this later turn", players[0].buyBacksUsed === 3);
    check("that 3rd buy-back is priced at the top $3 tier, not reset to $1", beforePrice - ChipEconomy.chipsToDollars(players[0].wallet.chips) === 3);
  }

  // A dealt 10 still offers the flex-value choice even with buy-backs
  // exhausted -- the exact reported bug.
  {
    const players = mkPlayers(2);
    const cfg = Object.assign({}, SEVEN_TWENTYSEVEN_CONFIG, { buyBack: { priceScheduleDollars: [1, 2, 3], maxBuys: 2 } });
    const state = PressYourLuckRules.createHandState(players, 0, settings, cfg, 0);
    players[0].buyBacksUsed = 2;
    skipInitialAndBetting(state);
    state.deck.unshift({ rank: "10", suit: "H" });
    const result = PressYourLuckRules.resolveHitOrStand(state, "p0", "hit");
    check("the forced 10 is drawn", result.dealtCard.rank === "10");
    check("still pauses for the flex-ten decision with buy-backs exhausted", result.needsBuyBack === true);
    check("canPayFlexTen confirms the flex option is genuinely available", PressYourLuckRules.canPayFlexTen(state, "p0") === true);
  }

  return summary("rules-press-your-luck");
}

if (require.main === module) process.exit(run());
module.exports = { run };

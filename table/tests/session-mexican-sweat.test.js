"use strict";

// Real bug, reported directly (2026-11-23): "Betting after last round in
// Mexican Sweat when all cards are showing and no further reveal or
// flip-up should not happen." A betting round used to open unconditionally
// after every reveal round, including the final one, even though by then
// every player's whole hand is already face up for the entire table --
// nothing left hidden for a bet to react to.
//
// This replicates session-mexican-sweat.js's own processTurnLoop branch
// logic synchronously (that file's real loop is async/timer-driven, which
// doesn't fit this suite's synchronous run() contract) and drives a full
// hand to completion through the real rules-mexican-sweat.js /
// ai-mexican-sweat-profiles.js functions, asserting a betting round never
// opens once every player's final card is showing.

const { load } = require("./harness");
const { makeChecker } = require("./check");

function run() {
  const { check, summary } = makeChecker();
  const { MexicanSweatRules, MexicanSweatAIProfiles, AIProfiles, MEXICAN_SWEAT_CONFIG } = load(
    [
      "deck.js",
      "hand-evaluator.js",
      "chip-economy.js",
      "betting-engine.js",
      "ai-profiles.js",
      "ai-mexican-sweat-profiles.js",
      "rules-mexican-sweat.js",
      "game-configs-mexican-sweat.js",
    ],
    ["MexicanSweatRules", "MexicanSweatAIProfiles", "AIProfiles", "MEXICAN_SWEAT_CONFIG"]
  );

  const players = [1, 2, 3].map((i) => ({
    id: "p" + i,
    name: "P" + i,
    isHuman: false,
    profileName: "balanced",
    wallet: { chips: 100000, rebuys: [], buyIns: [] },
  }));
  const settings = { anteDollars: 0.5, raiseIncrementDollars: 0.25, maxBetDollars: 2 };
  const cfg = Object.assign({}, MEXICAN_SWEAT_CONFIG, { killCard: false });
  const state = MexicanSweatRules.createHandState(players, 0, settings, 0, cfg);

  let sawBettingRoundOnFinalRevealRound = false;
  let maxRoundIndexSeenWithBettingRound = -1;
  let guard = 0;
  const GUARD_LIMIT = 5000;

  while (state.status !== "complete") {
    guard += 1;
    if (guard > GUARD_LIMIT) break;

    if (state.bettingRound) {
      maxRoundIndexSeenWithBettingRound = Math.max(maxRoundIndexSeenWithBettingRound, state.roundIndex);
      if (state.roundIndex >= state.cardsPerPlayer - 1) sawBettingRoundOnFinalRevealRound = true;
      const bettorId = MexicanSweatRules.getCurrentBettor(state);
      if (bettorId == null) {
        MexicanSweatRules.advanceRound(state);
        continue;
      }
      const bettor = MexicanSweatRules.getPlayer(state, bettorId);
      const profile = AIProfiles.profileFor(bettor.profileName);
      const decision = MexicanSweatAIProfiles.decideBet(bettor, state, profile);
      MexicanSweatRules.submitBet(state, bettorId, decision.action, decision.raiseDollars || 0);
      continue;
    }

    if (MexicanSweatRules.isRoundRevealComplete(state)) {
      // The exact branch this bug lived in -- session-mexican-sweat.js's
      // own processTurnLoop now does precisely this check.
      if (MexicanSweatRules.isFinalRevealRound(state)) {
        MexicanSweatRules.resolveShowdown(state);
      } else {
        MexicanSweatRules.startBettingRound(state);
      }
      continue;
    }

    MexicanSweatRules.revealNextCard(state);
  }

  check("the hand actually completed (the test itself drove a real full hand)", state.status === "complete");
  check(
    "a betting round was seen on at least one non-final round (normal play happened, not a degenerate no-op hand)",
    maxRoundIndexSeenWithBettingRound >= 0 && maxRoundIndexSeenWithBettingRound < state.cardsPerPlayer - 1
  );
  check("no betting round EVER opened once a player's final card was showing (the reported bug)", sawBettingRoundOnFinalRevealRound === false);

  return summary("session-mexican-sweat");
}

if (require.main === module) process.exit(run());
module.exports = { run };

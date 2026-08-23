"use strict";

// Generic betting-round mechanics (ante collection, call/raise/fold chip
// accounting, whose-turn-is-it-to-act) extracted out of
// rules-midnight-baseball.js so future game engines (stud, guts, hold'em)
// can reuse the same math without also inheriting Midnight Baseball's
// "beat the shared board" model. This module has no concept of a board to
// beat, a hand to evaluate, or what a fold/win actually means for a given
// game — it only tracks chips and whose turn it is to respond, and leaves
// win-detection/payout/logging to the caller.
const BettingEngine = (function () {
  function startRound(activePlayerIds) {
    const committed = {};
    activePlayerIds.forEach((id) => (committed[id] = 0));
    return { order: activePlayerIds.slice(), committed, currentBetChips: 0, responded: new Set(), allIn: new Set() };
  }

  // isFolded(playerId) -> bool. round.order is fixed at round start (the
  // non-folded players at that moment) since folding removes a player from
  // further action without needing to mutate the order array itself.
  //
  // A player who calls or raises all-in for LESS than the current bet can
  // never actually match it (they have nothing left to add) — without
  // tracking that separately, the "responded && committed === currentBet"
  // skip condition below is permanently false for them, and every future
  // raise by someone else makes getCurrentBettor hand them the turn again
  // forever. `round.allIn` (set the moment a call/raise leaves a wallet at
  // zero) is what actually stops that: a real bug this project didn't
  // catch until a Playwright multi-game-night pass sent a broke player
  // (busted out of one game's blinds) into a second game's betting round.
  function getCurrentBettor(round, isFolded) {
    const activeCount = round.order.filter((id) => !isFolded(id)).length;
    if (activeCount <= 1) return null;
    for (const pid of round.order) {
      if (isFolded(pid) || round.allIn.has(pid)) continue;
      if (round.responded.has(pid) && round.committed[pid] === round.currentBetChips) continue;
      return pid;
    }
    return null;
  }

  function isRoundOver(round, isFolded) {
    return getCurrentBettor(round, isFolded) === null;
  }

  function maxRaiseDollars(round, playerId, { maxBetDollars, raiseIncrementDollars }) {
    const toCall = round.currentBetChips - round.committed[playerId];
    const maxTotalChips = ChipEconomy.dollarsToChips(maxBetDollars);
    const roomChips = Math.max(0, maxTotalChips - (round.committed[playerId] + toCall));
    const incrementChips = ChipEconomy.dollarsToChips(raiseIncrementDollars);
    const steps = Math.floor(roomChips / incrementChips);
    return steps * raiseIncrementDollars;
  }

  // Pure chip accounting only — no folding, no logging, no win-checking.
  // player: {id, wallet}. Returns enough for the caller to log/react.
  function submitBet(round, player, action, raiseDollars, opts) {
    const toCallChips = round.currentBetChips - round.committed[player.id];

    if (action === "fold") {
      round.responded.add(player.id);
      return { action, paidChips: 0, toCallChips, newCurrentBetChips: round.currentBetChips };
    }

    if (action === "raise") {
      const allowedRaiseDollars = Math.min(raiseDollars, maxRaiseDollars(round, player.id, opts));
      const raiseChips = ChipEconomy.dollarsToChips(Math.max(0, allowedRaiseDollars));
      const owed = toCallChips + raiseChips;
      const { paid, allIn } = ChipEconomy.pay(player.wallet, owed);
      round.committed[player.id] += paid;
      round.currentBetChips = Math.max(round.currentBetChips, round.committed[player.id]);
      round.responded = new Set([player.id]);
      if (allIn) round.allIn.add(player.id);
      return { action, paidChips: paid, toCallChips, newCurrentBetChips: round.currentBetChips };
    }

    const { paid, allIn } = ChipEconomy.pay(player.wallet, toCallChips);
    round.committed[player.id] += paid;
    round.responded.add(player.id);
    if (allIn) round.allIn.add(player.id);
    return { action, paidChips: paid, toCallChips, newCurrentBetChips: round.currentBetChips };
  }

  function collectAntes(players, anteDollars) {
    const chipsEach = ChipEconomy.dollarsToChips(anteDollars);
    let total = 0;
    for (const player of players) {
      const { paid } = ChipEconomy.pay(player.wallet, chipsEach);
      total += paid;
    }
    return total;
  }

  // Generic "only one player left standing" check, reusable by any game's
  // instant-win detection — what happens next (award outright vs. still
  // needs a showdown) is still up to the caller.
  function lastPlayerStanding(playerIds, isFolded) {
    const standing = playerIds.filter((id) => !isFolded(id));
    return standing.length === 1 ? standing[0] : null;
  }

  return { startRound, getCurrentBettor, isRoundOver, maxRaiseDollars, submitBet, collectAntes, lastPlayerStanding };
})();

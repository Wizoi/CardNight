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
    // raiseCounts: how many times each player has raised THIS round --
    // generic, cheap bookkeeping every family gets for free, but currently
    // only actually read by ai-holdem-profiles.js (see raiseBarFor there),
    // since hold'em's genuinely uncapped bet size is what let two AI seats
    // ping-pong re-raises indefinitely (reported 2026-08-29) -- every other
    // family's own low fixed max-bet already bounds how far that can go.
    return { order: activePlayerIds.slice(), committed, currentBetChips: 0, responded: new Set(), allIn: new Set(), raiseCounts: {} };
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
  function ensureAiCanAfford(player, neededChips) {
    if (!player || player.isHuman || !player.wallet) return;
    while (player.wallet.chips < neededChips) {
      ChipEconomy.rebuy(player.wallet, ChipEconomy.BUY_IN_INCREMENT_DOLLARS, Date.now());
    }
  }

  function getCurrentBettor(round, isFolded) {
    const activeCount = round.order.filter((id) => !isFolded(id)).length;
    if (activeCount <= 1) return null;
    for (const pid of round.order) {
      if (isFolded(pid)) continue;
      if (round.responded.has(pid) && round.committed[pid] === round.currentBetChips) continue;
      return pid;
    }
    return null;
  }

  function isRoundOver(round, isFolded) {
    return getCurrentBettor(round, isFolded) === null;
  }

  // walletChips bounds the raise by what the player can actually still
  // pay, on top of the configured maxBetDollars cap.
  function maxRaiseDollars(round, playerId, { maxBetDollars, raiseIncrementDollars, walletChips = Infinity }) {
    const committed = (round && round.committed && round.committed[playerId]) || 0;
    const toCall = Math.max(0, round.currentBetChips - committed);
    if (walletChips <= toCall) return 0;
    const effectiveMaxBet = maxBetDollars == null || maxBetDollars === Infinity ? Infinity : maxBetDollars;
    const maxTotalChips = effectiveMaxBet === Infinity ? Infinity : ChipEconomy.dollarsToChips(effectiveMaxBet);
    const roomByCapChips = effectiveMaxBet === Infinity ? Infinity : Math.max(0, maxTotalChips - (committed + toCall));
    const roomByWalletChips = Math.max(0, walletChips - toCall);
    const roomChips = Math.min(roomByCapChips, roomByWalletChips);
    const incrementChips = ChipEconomy.dollarsToChips(raiseIncrementDollars);
    if (!incrementChips || incrementChips <= 0) return 0;
    const steps = Math.floor(roomChips / incrementChips);
    return steps * raiseIncrementDollars;
  }

  // Pure chip accounting only — no folding, no logging, no win-checking.
  // player: {id, wallet}. Returns enough for the caller to log/react.
  //
  // round.lastSubmit records what actually happened on the most recent
  // submit (the real post-downgrade action, not whatever the caller asked
  // for) — e.g. a requested "raise" that got capped down to a plain "call"
  // is stamped as "call", not "raise". It's overwritten on every single
  // submit (fold/call/raise alike), never only on raises, so it can't go
  // stale and misattribute an earlier raise to a later, different submit.
  // This is what lets a caller (table-night.js's cross-player "big raise"
  // reaction) detect a genuine raise generically, for any family that
  // routes through this function, without each family inventing its own
  // signal.
  function submitBet(round, player, action, raiseDollars, opts) {
    const committed = (round.committed && round.committed[player.id]) || 0;
    const toCallChips = Math.max(0, round.currentBetChips - committed);

    function record(result, raiseChipsForLog) {
      round.lastSubmit = {
        playerId: player.id,
        action: result.action,
        raiseChips: result.action === "raise" ? raiseChipsForLog || 0 : 0,
        incrementChips: opts && opts.raiseIncrementDollars ? ChipEconomy.dollarsToChips(opts.raiseIncrementDollars) : 0,
        newBetChips: round.currentBetChips,
        wentAllIn: !!(player.wallet && player.wallet.chips === 0),
      };
      return result;
    }

    if (action === "fold") {
      round.responded.add(player.id);
      return record({ action: "fold", paidChips: 0, toCallChips, newCurrentBetChips: round.currentBetChips });
    }

    if (action === "raise") {
      if (!player.isHuman) {
        const reqRaiseChips = ChipEconomy.dollarsToChips(Math.max(0, raiseDollars || 0));
        ensureAiCanAfford(player, toCallChips + reqRaiseChips);
      }
      const currentOpts = Object.assign({}, opts, { walletChips: player.wallet.chips });
      const allowedRaiseDollars = Math.min(raiseDollars || 0, maxRaiseDollars(round, player.id, currentOpts));
      const raiseChips = ChipEconomy.dollarsToChips(Math.max(0, allowedRaiseDollars));
      if (raiseChips > 0 && player.wallet.chips >= toCallChips + raiseChips) {
        const owed = toCallChips + raiseChips;
        const { paid } = ChipEconomy.pay(player.wallet, owed);
        round.committed[player.id] = committed + paid;
        round.currentBetChips = Math.max(round.currentBetChips, round.committed[player.id]);
        round.responded = new Set([player.id]);
        round.raiseCounts[player.id] = (round.raiseCounts[player.id] || 0) + 1;
        return record({ action: "raise", paidChips: paid, toCallChips, newCurrentBetChips: round.currentBetChips }, raiseChips);
      }
      // Cannot raise: if player cannot even cover toCallChips, force fold
      if (player.wallet.chips < toCallChips) {
        round.responded.add(player.id);
        return record({ action: "fold", paidChips: 0, toCallChips, newCurrentBetChips: round.currentBetChips, forcedFold: true });
      }
      action = "call";
    }

    if (!player.isHuman) {
      ensureAiCanAfford(player, toCallChips);
    } else if (toCallChips > player.wallet.chips) {
      round.responded.add(player.id);
      return record({ action: "fold", paidChips: 0, toCallChips, newCurrentBetChips: round.currentBetChips, forcedFold: true });
    }

    const { paid } = ChipEconomy.pay(player.wallet, toCallChips);
    round.committed[player.id] = committed + paid;
    round.responded.add(player.id);
    return record({ action: "call", paidChips: paid, toCallChips, newCurrentBetChips: round.currentBetChips });
  }

  function collectAntes(players, anteDollars) {
    const chipsEach = ChipEconomy.dollarsToChips(anteDollars);
    let total = 0;
    for (const player of players) {
      ensureAiCanAfford(player, chipsEach);
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

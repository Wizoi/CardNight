"use strict";

// Shared Texas Hold'em-variant engine: private hole cards + a shared board
// revealed in the standard preflop/flop/turn/river streets, blinds instead
// of an ante, and no cap on bet size (games.md's own house rule for this
// family) — a genuinely different betting shape than every other game
// here, so this reuses `BettingEngine`'s call/raise/fold accounting
// directly (it never assumed an ante model) but never touches
// `collectAntes`, seeding the first betting round from posted blinds
// instead. Omaha, Seattle, Boise, and Jersey Hold'em are all just a
// `gameConfig` on top of this one engine — the only real difference
// between them is how many hole cards are dealt and which hole/board
// card-count splits are allowed at showdown.
//
// gameConfig shape:
//   {
//     id, name,
//     holeCards: number,                 // 4 (Omaha/Seattle/Boise) or 5 (Jersey Hold'em)
//     handSplits: [{holeCount, boardCount}, ...],  // Omaha: [{2,3}]; Seattle: [{3,2}];
//                                                   // Boise/Jersey (flexible): [{2,3},{3,2}]
//     hiLo: bool,                        // split the pot with a qualifying low hand
//     smallBlindDollars, bigBlindDollars, raiseIncrementDollars, maxBetDollars,
//   }
//
// Judgment call: real hold'em's action order differs preflop (starts left
// of the big blind) vs. postflop (starts left of the dealer) -- this
// engine uses ONE fixed order for every street (small/big blind moved to
// the end of the dealer-relative order), the same "pick one simplified
// order and stay consistent" approach every other game family here already
// takes for its own betting order. The minimum-raise rule is likewise
// simplified to a flat `raiseIncrementDollars` rather than real hold'em's
// "must match the size of the previous bet/raise" — consistent with how
// every other game in this project already uses one flat raise increment.
// games.md's own words for this family are "no cap on bet size" -- a
// raise-count limit (an earlier version of this file capped raises at 4
// per street to bound a slow betting war found during testing) still
// caps the effective bet size, contradicting that. The genuine bound is
// each player's own finite wallet: raises cost real chips, `maxRaiseDollars`
// returns 0 once a player can't afford even one more increment, and
// `BettingEngine`'s all-in tracking (see betting-engine.js) permanently
// stops asking an all-in player to act again -- so a betting round is
// always bounded by the table's total chips in play, exactly like a real
// no-limit table where players eventually run out of money to keep
// raising with, not by an artificial raise-count rule games.md never
// documents.

const HoldemRules = (function () {
  function getPlayer(state, playerId) {
    return state.players.find((p) => p.id === playerId);
  }

  function nonFoldedCount(state) {
    return state.players.filter((p) => !p.folded).length;
  }

  function combinations(items, k) {
    const results = [];
    const combo = [];
    (function pick(start) {
      if (combo.length === k) {
        results.push(combo.slice());
        return;
      }
      for (let i = start; i < items.length; i++) {
        combo.push(items[i]);
        pick(i + 1);
        combo.pop();
      }
    })(0);
    return results;
  }

  // Every valid 5-card combination this game's hand/board split rule
  // allows, given however much of the board is up so far. Empty before
  // there are enough board cards for any split (e.g. preflop) -- callers
  // fall back to reading the raw hole cards for a rough pre-board proxy.
  function candidateFiveCardHands(state, player) {
    const hole = player.hand.map((c) => ({ rank: c.rank, suit: c.suit }));
    const board = state.communityCards.map((c) => ({ rank: c.rank, suit: c.suit }));
    const results = [];
    for (const split of state.gameConfig.handSplits) {
      if (split.holeCount > hole.length || split.boardCount > board.length) continue;
      for (const holeCombo of combinations(hole, split.holeCount)) {
        for (const boardCombo of combinations(board, split.boardCount)) {
          results.push(holeCombo.concat(boardCombo));
        }
      }
    }
    return results;
  }

  function bestHighHand(state, player) {
    const combos = candidateFiveCardHands(state, player);
    let best = null;
    for (const combo of combos) {
      const evaluated = HandEvaluator.bestHand(combo.map((c) => ({ rank: c.rank, suit: c.suit, isWild: false })));
      if (best == null || HandEvaluator.isBetter(evaluated, best)) best = evaluated;
    }
    return best || { category: -1, categoryName: "No cards", tiebreakers: [] };
  }

  function bestLowHandFor(state, player) {
    if (!state.gameConfig.hiLo) return null;
    return HandEvaluator.bestLow(candidateFiveCardHands(state, player));
  }

  function postBlinds(state) {
    const sbId = state.dealOrder[0];
    const bbId = state.dealOrder[1];
    const sbPlayer = getPlayer(state, sbId);
    const bbPlayer = getPlayer(state, bbId);
    const sbResult = ChipEconomy.pay(sbPlayer.wallet, ChipEconomy.dollarsToChips(state.smallBlindDollars));
    const bbResult = ChipEconomy.pay(bbPlayer.wallet, ChipEconomy.dollarsToChips(state.bigBlindDollars));
    state.pot += sbResult.paid + bbResult.paid;
    const committed = {};
    state.actionOrder.forEach((id) => (committed[id] = 0));
    committed[sbId] = sbResult.paid;
    committed[bbId] = bbResult.paid;
    // A short-stacked blind (rare, but possible after a bruising earlier
    // game the same night) is posted all-in -- flag it the same way a
    // short call/raise would be, so getCurrentBettor doesn't loop them
    // forever trying to match a bet they have no chips left to reach.
    const allIn = new Set();
    if (sbResult.allIn) allIn.add(sbId);
    if (bbResult.allIn) allIn.add(bbId);
    state.bettingRound = { order: state.actionOrder.slice(), committed, currentBetChips: Math.max(sbResult.paid, bbResult.paid), responded: new Set(), allIn };
    state.log.push(`${sbPlayer.name} posts small blind ($${state.smallBlindDollars.toFixed(2)}), ${bbPlayer.name} posts big blind ($${state.bigBlindDollars.toFixed(2)}).`);
  }

  function createHandState(players, dealerIndex, settings, handNumber, gameConfig) {
    const deck = Deck.shuffle(Deck.buildDeck());
    let cursor = 0;
    for (const p of players) {
      p.hand = deck.slice(cursor, cursor + gameConfig.holeCards).map((c) => ({ rank: c.rank, suit: c.suit }));
      cursor += gameConfig.holeCards;
      p.folded = false;
    }

    const dealerFirst = players.slice(dealerIndex + 1).concat(players.slice(0, dealerIndex + 1));
    const dealOrder = dealerFirst.map((p) => p.id);
    const actionOrder = dealOrder.slice(2).concat(dealOrder.slice(0, 2));

    const state = {
      players,
      dealerIndex,
      handNumber,
      gameConfig,
      deck: deck.slice(cursor),
      communityCards: [],
      streetIndex: 0,
      dealOrder,
      actionOrder,
      pot: 0,
      potAtShowdown: 0, // captured pre-payout -- state.pot itself is always 0 once complete
      bettingRound: null,
      smallBlindDollars: gameConfig.smallBlindDollars,
      bigBlindDollars: gameConfig.bigBlindDollars,
      raiseIncrementDollars: gameConfig.raiseIncrementDollars,
      maxBetDollars: gameConfig.maxBetDollars,
      status: "betting",
      log: [],
      highWinnerIds: [],
      lowWinnerIds: [],
      bestHighDescribed: null,
      bestLowDescribed: null,
    };
    postBlinds(state);
    return state;
  }

  function dealCommunity(state, count, label) {
    const cards = state.deck.splice(0, count).map((c) => ({ rank: c.rank, suit: c.suit }));
    state.communityCards.push(...cards);
    state.log.push(`${label}: ${cards.map((c) => Deck.cardLabel(c)).join(", ")}.`);
  }

  function startNewRound(state) {
    const activeIds = state.players.filter((p) => !p.folded).map((p) => p.id);
    const order = state.actionOrder.filter((id) => activeIds.includes(id));
    state.bettingRound = BettingEngine.startRound(order);
  }

  function getCurrentBettor(state) {
    const br = state.bettingRound;
    if (!br) return null;
    return BettingEngine.getCurrentBettor(br, (id) => getPlayer(state, id).folded);
  }

  function isBettingRoundOver(state) {
    return getCurrentBettor(state) === null;
  }

  function maxRaiseDollars(state, playerId) {
    return BettingEngine.maxRaiseDollars(state.bettingRound, playerId, {
      maxBetDollars: state.maxBetDollars,
      raiseIncrementDollars: state.raiseIncrementDollars,
      walletChips: getPlayer(state, playerId).wallet.chips,
    });
  }

  function submitBet(state, playerId, action, raiseDollars) {
    const br = state.bettingRound;
    const player = getPlayer(state, playerId);
    const result = BettingEngine.submitBet(br, player, action, raiseDollars, {
      raiseIncrementDollars: state.raiseIncrementDollars,
      maxBetDollars: state.maxBetDollars,
      walletChips: player.wallet.chips,
    });
    state.pot += result.paidChips;

    if (action === "fold") {
      player.folded = true;
      state.log.push(`${player.name} folds.`);
    } else if (action === "raise") {
      state.log.push(`${player.name} raises to $${ChipEconomy.chipsToDollars(br.currentBetChips).toFixed(2)}.`);
    } else {
      state.log.push(result.paidChips > 0 ? `${player.name} calls.` : `${player.name} checks.`);
    }
    checkForInstantWin(state);
  }

  function checkForInstantWin(state) {
    if (state.status === "complete") return;
    if (nonFoldedCount(state) <= 1) {
      const winner = state.players.find((p) => !p.folded);
      state.status = "complete";
      state.bettingRound = null;
      if (winner) {
        state.potAtShowdown = state.pot;
        ChipEconomy.award(winner.wallet, state.pot);
        state.highWinnerIds = [winner.id];
        state.log.push(`${winner.name} wins the $${ChipEconomy.chipsToDollars(state.pot).toFixed(2)} pot — everyone else folded.`);
        state.pot = 0;
      }
    }
  }

  // Splits totalChips evenly among winnerIds; any remainder (from an
  // odd/indivisible pot) goes to the earliest winners in list order — a
  // deterministic, if arbitrary, rounding rule.
  function payEvenSplit(state, winnerIds, totalChips) {
    if (winnerIds.length === 0 || totalChips === 0) return;
    const share = Math.floor(totalChips / winnerIds.length);
    const remainder = totalChips - share * winnerIds.length;
    winnerIds.forEach((id, i) => {
      const player = getPlayer(state, id);
      ChipEconomy.award(player.wallet, share + (i < remainder ? 1 : 0));
    });
  }

  function resolveShowdown(state) {
    if (state.status === "complete") return;
    const live = state.players.filter((p) => !p.folded);
    const highResults = live.map((p) => ({ id: p.id, hand: bestHighHand(state, p) }));
    const bestHigh = highResults.reduce((best, r) => (best == null || HandEvaluator.isBetter(r.hand, best) ? r.hand : best), null);
    const highWinnerIds = highResults.filter((r) => HandEvaluator.compareEvaluated(r.hand, bestHigh) === 0).map((r) => r.id);

    let lowWinnerIds = [];
    let bestLow = null;
    if (state.gameConfig.hiLo) {
      const lowResults = live.map((p) => ({ id: p.id, low: bestLowHandFor(state, p) })).filter((r) => r.low != null);
      if (lowResults.length) {
        bestLow = lowResults.reduce((best, r) => (best == null || HandEvaluator.isBetterLow(r.low, best) ? r.low : best), null);
        lowWinnerIds = lowResults.filter((r) => JSON.stringify(r.low.ranks) === JSON.stringify(bestLow.ranks)).map((r) => r.id);
      }
    }

    const potChips = state.pot;
    state.potAtShowdown = potChips;
    state.pot = 0;
    state.status = "complete";
    state.highWinnerIds = highWinnerIds;
    state.lowWinnerIds = lowWinnerIds;
    state.bestHighDescribed = HandEvaluator.describe(bestHigh);
    state.bestLowDescribed = bestLow ? HandEvaluator.describeLow(bestLow) : null;

    if (lowWinnerIds.length > 0) {
      const lowHalf = Math.floor(potChips / 2);
      const highHalf = potChips - lowHalf;
      payEvenSplit(state, highWinnerIds, highHalf);
      payEvenSplit(state, lowWinnerIds, lowHalf);
      state.log.push(
        `High: ${highWinnerIds.map((id) => getPlayer(state, id).name).join(", ")} with ${state.bestHighDescribed}. Low: ${lowWinnerIds
          .map((id) => getPlayer(state, id).name)
          .join(", ")} with ${state.bestLowDescribed}. Pot: $${ChipEconomy.chipsToDollars(potChips).toFixed(2)}.`
      );
    } else {
      payEvenSplit(state, highWinnerIds, potChips);
      state.log.push(
        `${highWinnerIds.map((id) => getPlayer(state, id).name).join(", ")} win${highWinnerIds.length === 1 ? "s" : ""} the $${ChipEconomy.chipsToDollars(potChips).toFixed(
          2
        )} pot with ${state.bestHighDescribed}${state.gameConfig.hiLo ? " (no qualifying low)" : ""}.`
      );
    }
  }

  function advanceStreet(state) {
    if (state.status === "complete") return;
    state.bettingRound = null;
    state.streetIndex += 1;
    if (state.streetIndex === 1) {
      dealCommunity(state, 3, "Flop");
      startNewRound(state);
    } else if (state.streetIndex === 2) {
      dealCommunity(state, 1, "Turn");
      startNewRound(state);
    } else if (state.streetIndex === 3) {
      dealCommunity(state, 1, "River");
      startNewRound(state);
    } else {
      resolveShowdown(state);
    }
  }

  return {
    createHandState,
    bestHighHand,
    bestLowHandFor,
    getCurrentBettor,
    isBettingRoundOver,
    maxRaiseDollars,
    submitBet,
    advanceStreet,
    resolveShowdown,
    checkForInstantWin,
    getPlayer,
    nonFoldedCount,
  };
})();

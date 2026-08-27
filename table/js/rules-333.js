"use strict";

// 3-33 (333) -- games.md's "Other" bucket. A single specific game, not a
// shared family, so unlike rules-press-your-luck.js there's no separate
// game-configs file; the game's own numbers (targets 3/33, matching its
// name -- the minimum possible 3-card sum with 3 aces-low is exactly 3, and
// the maximum with 3 aces-high is exactly 33) live right here.
//
// The only live player decision is the usual fold/call/raise -- a betting
// round happens right after the deal, then another after each of the 5
// community-card reveals (games.md, corrected 2026-08-26: the original
// build wrongly treated this whole game as ante-only, matching its
// target-sum siblings 5.5-21/7-27 -- but app/games-data.js's own `betting`
// field already documented real betting rounds, which table/ never
// actually built). Everything else (the reveal/discard mechanic itself)
// is still fully mechanical -- nobody chooses which card gets discarded.
const Rules333 = (function () {
  const LOW_TARGET = 3;
  const HIGH_TARGET = 33;
  const TOTAL_ROUNDS = 5;

  function cardValue(card) {
    if (card.rank === "A") return [1, 11];
    if (card.rank === "J" || card.rank === "Q" || card.rank === "K") return [10];
    return [Number(card.rank)];
  }

  function getPlayer(state, playerId) {
    return state.players.find((p) => p.id === playerId);
  }

  function nonFoldedCount(state) {
    return state.players.filter((p) => !p.folded).length;
  }

  function drawCard(state) {
    const { card, reshuffled } = Deck.drawWithReshuffle(state);
    if (reshuffled) state.log.push("The draw pile ran out — reshuffling discards back in.");
    return card;
  }

  function payEvenSplit(state, winnerIds, totalChips) {
    if (!winnerIds.length || totalChips <= 0) return;
    const share = Math.floor(totalChips / winnerIds.length);
    const remainder = totalChips - share * winnerIds.length;
    winnerIds.forEach((id, i) => {
      ChipEconomy.award(getPlayer(state, id).wallet, share + (i < remainder ? 1 : 0));
    });
  }

  function createHandState(players, dealerIndex, settings, carriedPotChips) {
    const deck = Deck.shuffle(Deck.buildDeck());
    for (const p of players) {
      p.hand = [];
      p.folded = false;
    }
    let cursor = 0;
    for (const p of players) {
      p.hand = deck.slice(cursor, cursor + 3).map((c) => ({ rank: c.rank, suit: c.suit }));
      cursor += 3;
    }
    const state = {
      players,
      dealerIndex,
      deck: deck.slice(cursor),
      discardPile: [],
      pot: carriedPotChips || 0,
      anteDollars: settings.anteDollars,
      raiseIncrementDollars: settings.raiseIncrementDollars,
      maxBetDollars: settings.maxBetDollars,
      bettingRound: null,
      roundIndex: 0,
      matchedRanksSoFar: [],
      communityCards: [],
      status: "betting", // -> 'revealing' -> 'betting' (repeat) -> 'complete'
      log: [],
      results: null,
      outrightWinnerIds: null,
      winnerId: null,
    };
    state.pot += BettingEngine.collectAntes(players, state.anteDollars);
    state.log.push(`Ante: $${state.anteDollars.toFixed(2)} each from ${players.length} players — pot starts at $${ChipEconomy.chipsToDollars(state.pot).toFixed(2)}.`);

    const ultimaIds = players.filter((p) => p.hand.length === 3 && p.hand.every((c) => c.rank === "A")).map((p) => p.id);
    if (ultimaIds.length) {
      payEvenSplit(state, ultimaIds, state.pot);
      state.status = "complete";
      state.outrightWinnerIds = ultimaIds;
      state.log.push(`Ultima! ${ultimaIds.map((id) => getPlayer(state, id).name).join(", ")} dealt three Aces — takes the whole pot outright, no betting needed.`);
      state.pot = 0;
      return state;
    }
    startBettingRound(state);
    return state;
  }

  // --- Betting (standard call/raise/fold, one round after the deal and
  // one after each of the 5 reveals) ---

  function startBettingRound(state) {
    const dealOrder = state.players
      .slice(state.dealerIndex + 1)
      .concat(state.players.slice(0, state.dealerIndex + 1))
      .map((p) => p.id);
    const activeIds = dealOrder.filter((pid) => !getPlayer(state, pid).folded);
    state.bettingRound = BettingEngine.startRound(activeIds);
  }

  function getCurrentBettor(state) {
    if (!state.bettingRound) return null;
    return BettingEngine.getCurrentBettor(state.bettingRound, (id) => getPlayer(state, id).folded);
  }

  function isBettingRoundOver(state) {
    return getCurrentBettor(state) === null;
  }

  function maxRaiseDollars(state, playerId) {
    const player = getPlayer(state, playerId);
    return BettingEngine.maxRaiseDollars(state.bettingRound, playerId, {
      maxBetDollars: state.maxBetDollars,
      raiseIncrementDollars: state.raiseIncrementDollars,
      walletChips: player.wallet.chips,
    });
  }

  function foldPlayer(state, playerId) {
    const player = getPlayer(state, playerId);
    player.folded = true;
    state.discardPile.push(...player.hand.map((c) => ({ rank: c.rank, suit: c.suit })));
    player.hand = [];
  }

  function submitBet(state, playerId, action, raiseDollars) {
    const player = getPlayer(state, playerId);
    const result = BettingEngine.submitBet(state.bettingRound, player, action, raiseDollars, {
      raiseIncrementDollars: state.raiseIncrementDollars,
      maxBetDollars: state.maxBetDollars,
      walletChips: player.wallet.chips,
    });
    state.pot += result.paidChips;
    if (action === "fold") {
      foldPlayer(state, playerId);
      state.log.push(`${player.name} folds.`);
    } else if (action === "raise") {
      state.log.push(`${player.name} raises to $${ChipEconomy.chipsToDollars(state.bettingRound.currentBetChips).toFixed(2)}.`);
    } else {
      state.log.push(result.paidChips > 0 ? `${player.name} calls.` : `${player.name} checks.`);
    }
    checkForInstantWin(state);
  }

  function checkForInstantWin(state) {
    if (state.status === "complete") return;
    if (nonFoldedCount(state) <= 1) {
      const winner = state.players.find((p) => !p.folded);
      completeHandOutright(state, winner ? [winner.id] : []);
    }
  }

  function completeHandOutright(state, winnerIds) {
    state.bettingRound = null;
    payEvenSplit(state, winnerIds, state.pot);
    state.status = "complete";
    state.outrightWinnerIds = winnerIds;
    state.winnerId = winnerIds[0] || null;
    if (winnerIds.length) {
      state.log.push(`${winnerIds.map((id) => getPlayer(state, id).name).join(", ")} wins uncontested — takes the pot outright.`);
    }
    state.pot = 0;
  }

  // Called once a betting round closes: moves on to the next reveal (or,
  // after the 5th, showdown already happened inside revealNextCommunityCard
  // itself -- see below).
  function advanceAfterBetting(state) {
    if (state.status === "complete") return;
    state.bettingRound = null;
    state.status = "revealing";
  }

  function isRevealDone(state) {
    return state.status !== "revealing";
  }

  // Flips one community card, redrawing (without consuming an extra
  // round) if its rank already came up and was discarded in an earlier
  // round -- games.md: a repeat rank would have nothing left to match
  // meaningfully, so it's set aside and a fresh one drawn instead.
  function revealNextCommunityCard(state) {
    if (state.status !== "revealing") return null;
    let card = null;
    let guard = 0;
    do {
      card = drawCard(state);
      guard += 1;
    } while (card && state.matchedRanksSoFar.includes(card.rank) && guard < 60);
    if (!card) {
      // Deck exhausted before 5 fresh ranks came up -- vanishingly rare at
      // realistic table sizes (max 8 players x 3 cards = 24 dealt), but
      // handled rather than crashing: go straight to showdown with
      // whatever rounds did happen.
      state.status = "complete";
      resolveShowdown(state);
      return null;
    }
    state.communityCards.push(card);
    state.matchedRanksSoFar.push(card.rank);
    state.roundIndex += 1;

    const emptiedIds = [];
    for (const p of state.players) {
      if (p.folded) continue;
      const before = p.hand.length;
      p.hand = p.hand.filter((c) => c.rank !== card.rank);
      if (p.hand.length < before) {
        state.log.push(`${p.name} discards the matching ${card.rank}.`);
        if (p.hand.length === 0) emptiedIds.push(p.id);
      }
    }

    if (emptiedIds.length) {
      state.status = "complete";
      payEvenSplit(state, emptiedIds, state.pot);
      state.outrightWinnerIds = emptiedIds;
      state.log.push(`${emptiedIds.map((id) => getPlayer(state, id).name).join(", ")} discarded their last card — takes the whole pot outright.`);
      state.pot = 0;
      return { card, emptiedIds };
    }
    if (state.roundIndex >= TOTAL_ROUNDS) {
      state.status = "complete";
      resolveShowdown(state);
    } else {
      state.status = "betting";
      startBettingRound(state);
    }
    return { card, emptiedIds };
  }

  function handSumResult(state, player, target) {
    return TargetSumEvaluator.bestForTarget(player.hand, cardValue, target, "noBust");
  }

  function pickWinners(state, results) {
    const bestDistance = Math.min(...results.map((r) => r.result.distance));
    return results.filter((r) => r.result.distance === bestDistance).map((r) => r.id);
  }

  // Returns unawarded chips (nobody-qualifies edge case, same
  // carry-forward pattern used throughout this project) -- not expected in
  // practice here since 'noBust' means every remaining player always has
  // SOME achievable sum for both sides.
  function resolveShowdown(state) {
    const contenders = state.players.filter((p) => !p.folded && p.hand.length > 0);
    const lowResults = contenders.map((p) => ({ id: p.id, result: handSumResult(state, p, LOW_TARGET) }));
    const highResults = contenders.map((p) => ({ id: p.id, result: handSumResult(state, p, HIGH_TARGET) }));
    const lowWinners = lowResults.length ? pickWinners(state, lowResults) : [];
    const highWinners = highResults.length ? pickWinners(state, highResults) : [];

    const lowShareChips = Math.floor(state.pot / 2);
    const highShareChips = state.pot - lowShareChips;
    let carried = 0;
    if (lowWinners.length) {
      payEvenSplit(state, lowWinners, lowShareChips);
      state.log.push(`${lowWinners.map((id) => getPlayer(state, id).name).join(", ")} win the low half (closest to ${LOW_TARGET}).`);
    } else {
      carried += lowShareChips;
    }
    if (highWinners.length) {
      payEvenSplit(state, highWinners, highShareChips);
      state.log.push(`${highWinners.map((id) => getPlayer(state, id).name).join(", ")} win the high half (closest to ${HIGH_TARGET}).`);
    } else {
      carried += highShareChips;
    }
    state.results = { lowWinners, highWinners, lowResults, highResults };
    state.winnerId = lowWinners[0] || highWinners[0] || null;
    state.pot = 0;
    return carried;
  }

  return {
    LOW_TARGET,
    HIGH_TARGET,
    TOTAL_ROUNDS,
    cardValue,
    getPlayer,
    createHandState,
    getCurrentBettor,
    isBettingRoundOver,
    maxRaiseDollars,
    submitBet,
    advanceAfterBetting,
    isRevealDone,
    revealNextCommunityCard,
    handSumResult,
  };
})();

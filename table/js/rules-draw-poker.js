"use strict";

// Pair of Jacks, Trips to Win -- games.md's "Poker Scored" bucket. Standard
// 5-card draw poker with two house-specific tightenings: only a Jacks-or-
// better hand may open the first betting round (if nobody can, the whole
// hand redeals), and a showdown requires at least Trips to actually win
// (not just whoever's best, the classic "Jackpots" rule with the group's
// own added floor).
//
// Judgment call: if nobody clears the Trips-or-better floor at showdown,
// the pot carries forward to the next hand rather than being awarded to a
// weaker hand anyway -- the same carry-forward pattern used throughout
// this project for other under-specified "what if nobody qualifies"
// endings (Rainy Day's rain-out, this project's other target-sum games).
const RulesDrawPoker = (function () {
  function getPlayer(state, playerId) {
    return state.players.find((p) => p.id === playerId);
  }

  function nonFoldedCount(state) {
    return state.players.filter((p) => !p.folded).length;
  }

  function evaluateHand(hand) {
    return HandEvaluator.bestHand(hand.map((c) => ({ rank: c.rank, suit: c.suit, isWild: false })));
  }

  function qualifiesToOpen(evaluated) {
    if (evaluated.category > HandEvaluator.CATEGORY.PAIR) return true;
    return evaluated.category === HandEvaluator.CATEGORY.PAIR && evaluated.tiebreakers[0] >= Deck.RANK_VALUES.J;
  }

  function drawCard(state) {
    const { card, reshuffled } = Deck.drawWithReshuffle(state);
    if (reshuffled) state.log.push("The draw pile ran out — reshuffling discards back in.");
    return card;
  }

  function dealOrderFrom(players, dealerIndex) {
    return players
      .slice(dealerIndex + 1)
      .concat(players.slice(0, dealerIndex + 1))
      .map((p) => p.id);
  }

  function createHandState(players, dealerIndex, settings, carriedPotChips) {
    const deck = Deck.shuffle(Deck.buildDeck());
    let cursor = 0;
    for (const p of players) {
      p.hand = deck.slice(cursor, cursor + 5).map((c) => ({ rank: c.rank, suit: c.suit }));
      cursor += 5;
      p.folded = false;
    }
    const state = {
      players,
      deck: deck.slice(cursor),
      discardPile: [],
      pot: carriedPotChips || 0,
      anteDollars: settings.anteDollars,
      raiseIncrementDollars: settings.raiseIncrementDollars,
      maxBetDollars: settings.maxBetDollars,
      dealerIndex,
      bettingRound: null,
      openedThisRound: false,
      status: "opening",
      drawTurnOrder: null,
      drawCursor: 0,
      log: [],
      winnerId: null,
      noOpener: false,
    };
    state.pot += BettingEngine.collectAntes(players, state.anteDollars);
    state.log.push(`Ante: $${state.anteDollars.toFixed(2)} each from ${players.length} players — pot starts at $${ChipEconomy.chipsToDollars(state.pot).toFixed(2)}.`);
    startBettingRound(state);
    return state;
  }

  function startBettingRound(state) {
    const dealOrder = dealOrderFrom(state.players, state.dealerIndex);
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
    getPlayer(state, playerId).folded = true;
  }

  // During the OPENING round only, a "raise" from a currentBetChips of 0
  // is really "placing the opening bet" -- gated on Jacks-or-better. Every
  // other action (call/fold, or any raise once someone's already opened)
  // is unrestricted. The UI is expected to only ever offer an open/bet
  // button to a qualifying hand in the first place; this is the
  // defensive backstop.
  function submitBet(state, playerId, action, raiseDollars) {
    const player = getPlayer(state, playerId);
    if (state.status === "opening" && action === "raise" && !state.openedThisRound) {
      if (!qualifiesToOpen(evaluateHand(player.hand))) return { rejected: true };
      state.openedThisRound = true;
      state.log.push(`${player.name} opens the betting.`);
    }
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
      if (!(state.status === "opening" && state.openedThisRound && result.paidChips === ChipEconomy.dollarsToChips(0))) {
        // avoid a duplicate "opens the betting" + "raises to" pair of log lines for the very same action
      }
      state.log.push(`${player.name} raises to $${ChipEconomy.chipsToDollars(state.bettingRound.currentBetChips).toFixed(2)}.`);
    } else {
      state.log.push(result.paidChips > 0 ? `${player.name} calls.` : `${player.name} checks.`);
    }
    checkForInstantWin(state);
    return { rejected: false };
  }

  function checkForInstantWin(state) {
    if (state.status === "complete") return;
    if (nonFoldedCount(state) <= 1) {
      const winner = state.players.find((p) => !p.folded);
      completeHand(state, winner ? [winner.id] : []);
    }
  }

  // Called once the OPENING round closes. Either nobody ever opened (the
  // whole hand redeals -- games.md's explicit rule) or play proceeds to
  // the draw.
  function advanceAfterOpeningRound(state) {
    if (state.status === "complete") return;
    if (!state.openedThisRound) {
      state.status = "complete";
      state.noOpener = true;
      state.log.push("Nobody could open (no Jacks-or-better) — the hand redeals.");
      return;
    }
    state.bettingRound = null;
    state.status = "drawing";
    state.drawTurnOrder = dealOrderFrom(state.players, state.dealerIndex).filter((pid) => !getPlayer(state, pid).folded);
    state.drawCursor = 0;
  }

  function currentDrawPlayerId(state) {
    if (state.status !== "drawing") return null;
    if (state.drawCursor >= state.drawTurnOrder.length) return null;
    return state.drawTurnOrder[state.drawCursor];
  }

  function maxDiscardsFor(player) {
    return player.hand.some((c) => c.rank === "A") ? 4 : 3;
  }

  function resolveDraw(state, playerId, discardIndices) {
    const player = getPlayer(state, playerId);
    const clamped = discardIndices.slice(0, maxDiscardsFor(player));
    const kept = player.hand.filter((_, i) => !clamped.includes(i));
    const discarded = player.hand.filter((_, i) => clamped.includes(i));
    state.discardPile.push(...discarded.map((c) => ({ rank: c.rank, suit: c.suit })));
    const drawn = [];
    for (let i = 0; i < clamped.length; i++) {
      const card = drawCard(state);
      if (card) drawn.push({ rank: card.rank, suit: card.suit });
    }
    player.hand = kept.concat(drawn);
    state.log.push(`${player.name} draws ${clamped.length} card(s).`);
    state.drawCursor += 1;
    if (state.drawCursor >= state.drawTurnOrder.length) {
      state.status = "finalBetting";
      startBettingRound(state);
    }
  }

  function resolveShowdown(state) {
    let bestHand = null;
    let winnerId = null;
    let tiedIds = [];
    for (const p of state.players) {
      if (p.folded) continue;
      const hand = evaluateHand(p.hand);
      if (hand.category < HandEvaluator.CATEGORY.TRIPS) continue; // games.md: trips or better required to win
      if (bestHand == null || HandEvaluator.isBetter(hand, bestHand)) {
        bestHand = hand;
        winnerId = p.id;
        tiedIds = [p.id];
      } else if (HandEvaluator.compareEvaluated(hand, bestHand) === 0) {
        tiedIds.push(p.id);
      }
    }
    completeHand(state, tiedIds);
  }

  function completeHand(state, winnerIds) {
    state.status = "complete";
    state.bettingRound = null;
    state.winnerIds = winnerIds;
    state.winnerId = winnerIds[0] || null;
    if (winnerIds.length) {
      const share = Math.floor(state.pot / winnerIds.length);
      const remainder = state.pot - share * winnerIds.length;
      winnerIds.forEach((id, i) => {
        ChipEconomy.award(getPlayer(state, id).wallet, share + (i < remainder ? 1 : 0));
      });
      state.log.push(`${winnerIds.map((id) => getPlayer(state, id).name).join(", ")} win${winnerIds.length > 1 ? "" : "s"} the $${ChipEconomy.chipsToDollars(state.pot).toFixed(2)} pot.`);
      state.pot = 0;
    } else {
      state.log.push("Nobody reached Trips or better — the pot carries forward.");
    }
  }

  // Called once the FINAL betting round closes: straight to showdown.
  function advanceAfterFinalBetting(state) {
    if (state.status === "complete") return;
    resolveShowdown(state);
  }

  return {
    createHandState,
    evaluateHand,
    qualifiesToOpen,
    getCurrentBettor,
    isBettingRoundOver,
    maxRaiseDollars,
    submitBet,
    advanceAfterOpeningRound,
    currentDrawPlayerId,
    maxDiscardsFor,
    resolveDraw,
    advanceAfterFinalBetting,
    getPlayer,
  };
})();

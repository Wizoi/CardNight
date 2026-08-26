"use strict";

// Blind Man's Bluff (Indian Poker) -- games.md's "Other" bucket. One card
// per player, "on the forehead": every player can see everyone ELSE's
// card but not their own -- a purely visual/UI convention (the rules
// engine below tracks each player's one real card completely normally;
// hiding it from its own owner while showing it to everyone else is
// table-ui-blind-mans-bluff.js's job entirely, not this file's).
//
// Betting is standard call/raise/fold via BettingEngine, but games.md's
// "Betting: Continues in rounds until no more raises/bets are made" means
// MULTIPLE distinct betting rounds on the SAME single card (no new card is
// ever dealt) -- unlike every other family here, where a betting round
// always follows a new deal/reveal. A round that closes with at least one
// raise in it immediately reopens a fresh round (committed chips reset,
// same card); only a round that closes with zero raises (everyone just
// checked/called) ends the hand and moves to showdown.
const BlindMansBluffRules = (function () {
  function getPlayer(state, playerId) {
    return state.players.find((p) => p.id === playerId);
  }

  function nonFoldedCount(state) {
    return state.players.filter((p) => !p.folded).length;
  }

  function createHandState(players, dealerIndex, settings, carriedPotChips) {
    const deck = Deck.shuffle(Deck.buildDeck());
    for (const p of players) {
      p.hand = [{ rank: deck[0].rank, suit: deck[0].suit }];
      deck.shift();
      p.folded = false;
    }
    const state = {
      players,
      deck,
      pot: carriedPotChips || 0,
      anteDollars: settings.anteDollars,
      raiseIncrementDollars: settings.raiseIncrementDollars,
      maxBetDollars: settings.maxBetDollars,
      bettingRound: null,
      roundHadRaise: false,
      // Cumulative commitment PER PLAYER across every reopened round this
      // hand (not just the current round) -- see maxRaiseDollars below for
      // why this has to be tracked separately from BettingEngine's own
      // per-round `committed`.
      handCommittedChips: {},
      status: "betting",
      log: [],
      winnerId: null,
      dealerIndex,
    };
    for (const p of players) state.handCommittedChips[p.id] = 0;
    state.pot += BettingEngine.collectAntes(players, state.anteDollars);
    startBettingRound(state, dealerIndex);
    return state;
  }

  function startBettingRound(state, dealerIndex) {
    const dealerFirst = state.players.slice((dealerIndex != null ? dealerIndex : state.dealerIndex) + 1).concat(state.players.slice(0, (dealerIndex != null ? dealerIndex : state.dealerIndex) + 1));
    const activeIds = dealerFirst.filter((p) => !p.folded).map((p) => p.id);
    state.bettingRound = BettingEngine.startRound(activeIds);
    state.roundHadRaise = false;
  }

  function getCurrentBettor(state) {
    if (!state.bettingRound) return null;
    return BettingEngine.getCurrentBettor(state.bettingRound, (id) => getPlayer(state, id).folded);
  }

  function isBettingRoundOver(state) {
    return getCurrentBettor(state) === null;
  }

  // Unlike every other family here, a betting round in this game can
  // reopen fresh (same card, committed chips reset to 0) as long as raises
  // keep happening -- BettingEngine.maxRaiseDollars alone would let the
  // $2-per-person cap effectively reset every reopen too, since it only
  // ever sees the CURRENT round's committed chips. That let two aggressive
  // AI seats re-raise each other indefinitely in testing (a real,
  // Node-regression-caught infinite-reopen bug). Fixed by reducing the
  // effective max-bet passed in by whatever this player already committed
  // in EARLIER rounds this hand (`handCommittedChips`), so BettingEngine's
  // own per-round math still applies unmodified, but the $2 max genuinely
  // means $2 for the WHOLE hand, matching every other family's meaning of
  // "max bet per person."
  function effectiveMaxBetDollars(state, playerId) {
    const priorChips = state.handCommittedChips[playerId] || 0;
    return Math.max(0, state.maxBetDollars - ChipEconomy.chipsToDollars(priorChips));
  }

  function maxRaiseDollars(state, playerId) {
    const player = getPlayer(state, playerId);
    return BettingEngine.maxRaiseDollars(state.bettingRound, playerId, {
      maxBetDollars: effectiveMaxBetDollars(state, playerId),
      raiseIncrementDollars: state.raiseIncrementDollars,
      walletChips: player.wallet.chips,
    });
  }

  function foldPlayer(state, playerId) {
    getPlayer(state, playerId).folded = true;
  }

  function submitBet(state, playerId, action, raiseDollars) {
    const player = getPlayer(state, playerId);
    const result = BettingEngine.submitBet(state.bettingRound, player, action, raiseDollars, {
      raiseIncrementDollars: state.raiseIncrementDollars,
      maxBetDollars: effectiveMaxBetDollars(state, playerId),
      walletChips: player.wallet.chips,
    });
    state.pot += result.paidChips;

    if (action === "fold") {
      foldPlayer(state, playerId);
      state.log.push(`${player.name} folds.`);
    } else if (action === "raise") {
      state.roundHadRaise = true;
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
      completeHand(state, winner ? winner.id : null);
    }
  }

  // Called once a betting round closes: reopens a fresh round on the SAME
  // card if that round had any raise in it, otherwise moves to showdown.
  // Rolls the just-closed round's commitments into handCommittedChips
  // BEFORE resetting for a new round, so the hand-wide $2 cap
  // (effectiveMaxBetDollars above) sees a true running total rather than
  // double-counting a round still in progress.
  function advanceAfterBettingRound(state) {
    if (state.status === "complete") return;
    for (const pid of state.bettingRound.order) {
      state.handCommittedChips[pid] = (state.handCommittedChips[pid] || 0) + state.bettingRound.committed[pid];
    }
    if (state.roundHadRaise) {
      startBettingRound(state);
    } else {
      resolveShowdown(state);
    }
  }

  function resolveShowdown(state) {
    let winnerId = null;
    let bestValue = -1;
    for (const p of state.players) {
      if (p.folded) continue;
      const v = Deck.RANK_VALUES[p.hand[0].rank];
      if (v > bestValue) {
        bestValue = v;
        winnerId = p.id;
      }
    }
    // Ties split evenly -- the standard house default (games.md's "House
    // rule: split-pot ties"), no exception documented for this game.
    const tiedIds = state.players.filter((p) => !p.folded && Deck.RANK_VALUES[p.hand[0].rank] === bestValue).map((p) => p.id);
    if (tiedIds.length > 1) {
      completeHandSplit(state, tiedIds);
    } else {
      completeHand(state, winnerId);
    }
  }

  function completeHand(state, winnerId) {
    state.status = "complete";
    state.winnerId = winnerId;
    state.bettingRound = null;
    if (winnerId) {
      const winner = getPlayer(state, winnerId);
      ChipEconomy.award(winner.wallet, state.pot);
      state.log.push(`${winner.name} wins the $${ChipEconomy.chipsToDollars(state.pot).toFixed(2)} pot with the highest card.`);
      state.pot = 0;
    }
  }

  function completeHandSplit(state, winnerIds) {
    state.status = "complete";
    state.winnerId = winnerIds[0];
    state.winnerIds = winnerIds;
    state.bettingRound = null;
    const share = Math.floor(state.pot / winnerIds.length);
    const remainder = state.pot - share * winnerIds.length;
    winnerIds.forEach((id, i) => {
      ChipEconomy.award(getPlayer(state, id).wallet, share + (i < remainder ? 1 : 0));
    });
    state.log.push(`${winnerIds.map((id) => getPlayer(state, id).name).join(", ")} tie for the highest card and split the $${ChipEconomy.chipsToDollars(state.pot).toFixed(2)} pot.`);
    state.pot = 0;
  }

  return {
    createHandState,
    getCurrentBettor,
    isBettingRoundOver,
    maxRaiseDollars,
    submitBet,
    advanceAfterBettingRound,
    getPlayer,
  };
})();

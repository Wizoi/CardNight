"use strict";

// Game of Life -- games.md's "Poker Scored" bucket (a standard best-5-card
// poker hand decides the winner, but the deal/draft mechanic getting there
// is bespoke). 5 private cards to start, plus two face-down 5-card table
// rows ("good"/"bad"). Turn order rotates; each turn the active player
// picks a row and flips its next card. A good-row flip is added to that
// player's own hand; a bad-row flip is discarded and POISONS its rank for
// the rest of the hand -- every hand's cards of that rank are discarded
// immediately, every still-face-down good-row card of that rank is marked
// to auto-discard once it's eventually flipped (from either row), and any
// LATER flip of that rank (good or bad row) is treated as bad regardless.
//
// Judgment call: games.md's "whichever player goes first in a round gets
// to choose which side they flip from" is read here as plain round-robin
// turn order (dealer-relative) -- each player picks their OWN row on their
// OWN turn; not a "the round's leader picks for everyone" mechanic, which
// would be a much bigger, unstated departure from every other turn-based
// game in this project. A standard ante+bet round follows every single
// flip (10 total across a hand), matching the "bet whenever new public
// information appears" rhythm this codebase already uses everywhere else.
//
// Flips strictly ALTERNATE good/bad (2026-08-29, user's explicit rule):
// only the very first flip of the whole hand is a free choice -- whoever
// acts first picks good or bad -- and every flip after that is forced to
// the opposite row of the one before it, regardless of who's acting.
// Since both rows hold exactly 5 cards and the hand is exactly 10 flips,
// strict alternation always exhausts both rows evenly with no row ever
// running out early. See requiredRowFor/resolveFlip below.
const RulesGameOfLife = (function () {
  function getPlayer(state, playerId) {
    return state.players.find((p) => p.id === playerId);
  }

  function nonFoldedCount(state) {
    return state.players.filter((p) => !p.folded).length;
  }

  function createHandState(players, dealerIndex, settings, carriedPotChips, jokerCount) {
    const deck = Deck.shuffle(Deck.buildDeck(jokerCount));
    let cursor = 0;
    for (const p of players) {
      p.hand = deck.slice(cursor, cursor + 5).map((c) => ({ rank: c.rank, suit: c.suit }));
      cursor += 5;
      p.folded = false;
    }
    const goodRow = deck.slice(cursor, cursor + 5).map((c) => ({ rank: c.rank, suit: c.suit, flipped: false, poisoned: false }));
    cursor += 5;
    const badRow = deck.slice(cursor, cursor + 5).map((c) => ({ rank: c.rank, suit: c.suit, flipped: false }));
    cursor += 5;

    const turnOrder = players
      .slice(dealerIndex + 1)
      .concat(players.slice(0, dealerIndex + 1))
      .map((p) => p.id);

    const state = {
      players,
      goodRow,
      badRow,
      lastFlippedRow: null, // null until the first flip -- see requiredRowFor
      poisonedRanks: [],
      flipsDone: 0,
      turnOrder,
      turnCursor: 0,
      pot: carriedPotChips || 0,
      potAtShowdown: 0, // captured pre-payout -- state.pot itself is always 0 once complete
      anteDollars: settings.anteDollars,
      raiseIncrementDollars: settings.raiseIncrementDollars,
      maxBetDollars: settings.maxBetDollars,
      bettingRound: null,
      status: "flipping", // -> "bettingAfterFlip" -> "flipping" (repeat) -> "complete"
      log: [],
      winnerId: null,
      winnerIds: null,
    };
    state.pot += BettingEngine.collectAntes(players, state.anteDollars);
    state.log.push(`Ante: $${state.anteDollars.toFixed(2)} each from ${players.length} players — pot starts at $${ChipEconomy.chipsToDollars(state.pot).toFixed(2)}.`);
    return state;
  }

  function currentFlipPlayerId(state) {
    if (state.status !== "flipping") return null;
    // Skip folded players -- they no longer take flip turns, same as
    // every other family's "skip folded seats" convention.
    for (let i = 0; i < state.turnOrder.length; i++) {
      const idx = (state.turnCursor + i) % state.turnOrder.length;
      const pid = state.turnOrder[idx];
      if (!getPlayer(state, pid).folded) {
        state.turnCursor = idx;
        return pid;
      }
    }
    return null;
  }

  function nextUnflippedIndex(row) {
    return row.findIndex((c) => !c.flipped);
  }

  function isRowsComplete(state) {
    return state.goodRow.every((c) => c.flipped) && state.badRow.every((c) => c.flipped);
  }

  // Applies a bad-row-equivalent resolution to `card` (discard it, and if
  // this is the FIRST time its rank is poisoned, cascade the effect table-
  // wide). Returns true if this flip cascaded a brand-new poison.
  function resolveBadCard(state, card) {
    const alreadyPoisoned = state.poisonedRanks.includes(card.rank);
    if (!alreadyPoisoned) {
      state.poisonedRanks.push(card.rank);
      for (const p of state.players) {
        const before = p.hand.length;
        p.hand = p.hand.filter((c) => c.rank !== card.rank);
        if (p.hand.length < before) state.log.push(`${p.name}'s ${card.rank}(s) are discarded — ${card.rank}s are poisoned.`);
      }
      for (const c of state.goodRow) {
        if (!c.flipped && c.rank === card.rank) c.poisoned = true;
      }
    }
    return !alreadyPoisoned;
  }

  // null (only true before any flip has happened this hand) means a free
  // choice; otherwise flips are forced to alternate off the last one.
  function requiredRowFor(state) {
    if (!state.lastFlippedRow) return null;
    return state.lastFlippedRow === "good" ? "bad" : "good";
  }

  function resolveFlip(state, playerId, rowChoice) {
    const player = getPlayer(state, playerId);
    const actualRow = requiredRowFor(state) || rowChoice;
    const row = actualRow === "good" ? state.goodRow : state.badRow;
    const idx = nextUnflippedIndex(row);
    const card = row[idx];
    card.flipped = true;
    state.flipsDone += 1;
    state.lastFlippedRow = actualRow;

    const isBad = actualRow === "bad" || card.poisoned || state.poisonedRanks.includes(card.rank);
    if (isBad) {
      const cascaded = resolveBadCard(state, card);
      state.log.push(`${player.name} flips ${Deck.cardLabel(card)} from the ${actualRow} row — bad${cascaded ? `, ${card.rank}s are now poisoned` : ""}.`);
    } else {
      player.hand.push({ rank: card.rank, suit: card.suit });
      state.log.push(`${player.name} flips ${Deck.cardLabel(card)} from the good row — added to their hand.`);
    }

    if (isRowsComplete(state)) {
      state.status = "bettingAfterFlip";
      state.finalFlip = true;
      startBettingRound(state);
    } else {
      state.status = "bettingAfterFlip";
      state.finalFlip = false;
      startBettingRound(state);
    }
  }

  function startBettingRound(state) {
    const activeIds = state.turnOrder.filter((pid) => !getPlayer(state, pid).folded);
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
      completeHand(state, winner ? [winner.id] : []);
    }
  }

  // Advances past a just-closed betting round: either to the next flip
  // turn, or to showdown if that was the round following the 10th (final)
  // table card.
  function advanceAfterBetting(state) {
    if (state.status === "complete") return;
    state.bettingRound = null;
    if (state.finalFlip) {
      resolveShowdown(state);
      return;
    }
    state.turnCursor = (state.turnCursor + 1) % state.turnOrder.length;
    state.status = "flipping";
  }

  function resolveShowdown(state) {
    let bestHand = null;
    let winnerIds = [];
    for (const p of state.players) {
      if (p.folded) continue;
      // A Joker (games.md's "House rule: playing with Jokers" -- Game of
      // Life has no wildcard rule of its own; its bad-row effect discards/
      // poisons ranks, it doesn't make anything wild) is wild wherever it
      // lands in a hand, same as any other card drafted from the good row.
      const cards = p.hand.map((c) => ({ rank: c.rank, suit: c.suit, isWild: c.rank === "JOKER" }));
      const hand = HandEvaluator.bestHand(cards);
      if (bestHand == null || HandEvaluator.isBetter(hand, bestHand)) {
        bestHand = hand;
        winnerIds = [p.id];
      } else if (HandEvaluator.compareEvaluated(hand, bestHand) === 0) {
        winnerIds.push(p.id);
      }
    }
    completeHand(state, winnerIds);
  }

  function completeHand(state, winnerIds) {
    state.status = "complete";
    state.bettingRound = null;
    state.winnerIds = winnerIds;
    state.winnerId = winnerIds[0] || null;
    state.potAtShowdown = state.pot;
    if (winnerIds.length) {
      const share = Math.floor(state.pot / winnerIds.length);
      const remainder = state.pot - share * winnerIds.length;
      winnerIds.forEach((id, i) => {
        ChipEconomy.award(getPlayer(state, id).wallet, share + (i < remainder ? 1 : 0));
      });
      state.log.push(`${winnerIds.map((id) => getPlayer(state, id).name).join(", ")} win${winnerIds.length > 1 ? "" : "s"} the $${ChipEconomy.chipsToDollars(state.pot).toFixed(2)} pot.`);
      state.pot = 0;
    }
  }

  return {
    createHandState,
    currentFlipPlayerId,
    nextUnflippedIndex,
    requiredRowFor,
    resolveFlip,
    getCurrentBettor,
    isBettingRoundOver,
    maxRaiseDollars,
    submitBet,
    advanceAfterBetting,
    getPlayer,
  };
})();

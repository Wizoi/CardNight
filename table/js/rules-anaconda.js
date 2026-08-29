"use strict";

// Anaconda (Pass the Trash) -- games.md's "Stud-based (New)" bucket. Deal 7
// down cards up front to everyone at once; discard 3 (passed as a set to
// the left neighbor) and bet; discard 2 more (down to 5, no passing) and
// bet; then "roll your own" -- reveal all 5 remaining cards, simultaneously
// across the table, one round at a time with a bet after each, until
// showdown.
//
// Judgment calls:
// - This game needs the full 7 cards up front and doesn't scale down by
//   player count the way the rest of the stud family does (games.md is
//   explicit about this). At a full 8-player table (56 cards needed, more
//   than one deck holds) the LAST-seated player in deal order sits out
//   that hand entirely (folded from the start) rather than requiring a
//   second deck -- the simplest concrete stand-in for games.md's own
//   "needs a second deck or one player sitting out" note.
// - games.md's "arrange your remaining 5 cards in a chosen order" (so the
//   later reveal order is the player's own choice) is simplified to "reveal
//   in whatever order the 5 kept cards ended up in the hand array after the
//   round-2 discard" -- a separate, explicit re-ordering UI was judged
//   disproportionate scope on top of everything else this mechanic already
//   needs (discard-and-pass, a second discard, then a 5-round reveal).
//   The FINAL hand value is unaffected either way; only the drama/betting-
//   information order of the reveal would differ.
// - The reveal itself is modeled as SIMULTANEOUS across every active
//   player each round (like Mexican Sweat), not a sequential per-player
//   turn -- games.md's "a betting round after each" (of 5 total reveals,
//   not 5-times-however-many-players) only really fits a simultaneous
//   reveal; a sequential one would need far more betting rounds than the
//   text implies.
// - Hi-lo (optional per games.md) is not implemented -- known gap, core
//   high-hand-wins play only, same simplification already used for Follow
//   the Queen's Low Chicago and Criss Cross's hi-lo.
const RulesAnaconda = (function () {
  function getPlayer(state, playerId) {
    return state.players.find((p) => p.id === playerId);
  }

  function nonFoldedCount(state) {
    return state.players.filter((p) => !p.folded).length;
  }

  function activePlayers(state) {
    return state.players.filter((p) => !p.folded);
  }

  function createHandState(players, dealerIndex, settings, carriedPotChips, jokerCount, hiLo) {
    const deck = Deck.shuffle(Deck.buildDeck(jokerCount));
    const dealOrder = players
      .slice(dealerIndex + 1)
      .concat(players.slice(0, dealerIndex + 1))
      .map((p) => p.id);

    for (const p of players) {
      p.hand = [];
      p.folded = false;
    }
    // 7 cards/player needs a full second deck at 8 players (56 > 52) --
    // the last-seated player in deal order sits out this hand instead.
    // Uses the deck's actual size (not a hardcoded 52) so an optional
    // Joker or two is accounted for too.
    const dealableCount = Math.min(players.length, Math.floor(deck.length / 7));
    const sittingOutIds = dealOrder.slice(dealableCount);
    for (const pid of sittingOutIds) players.find((p) => p.id === pid).folded = true;

    let cursor = 0;
    for (const pid of dealOrder.slice(0, dealableCount)) {
      const p = players.find((pl) => pl.id === pid);
      p.hand = deck.slice(cursor, cursor + 7).map((c) => ({ rank: c.rank, suit: c.suit }));
      cursor += 7;
    }

    const state = {
      players,
      dealOrder,
      deck: deck.slice(cursor),
      discardPile: [],
      hiLo: !!hiLo,
      pot: carriedPotChips || 0,
      potAtShowdown: 0, // captured pre-payout -- state.pot itself is always 0 once complete
      anteDollars: settings.anteDollars,
      raiseIncrementDollars: settings.raiseIncrementDollars,
      maxBetDollars: settings.maxBetDollars,
      bettingRound: null,
      passSelections: {},
      discardSelections: {},
      revealsDone: 0,
      status: "discard1",
      log: [],
      winnerIds: null,
      winnerId: null,
    };
    // Only actually-dealt-in players ante -- someone sitting out this hand
    // (the 8-player edge case) shouldn't pay for cards they never got.
    const anteEligible = players.filter((p) => !p.folded);
    state.pot += BettingEngine.collectAntes(anteEligible, state.anteDollars);
    state.log.push(`Ante: $${state.anteDollars.toFixed(2)} each from ${anteEligible.length} players — pot starts at $${ChipEconomy.chipsToDollars(state.pot).toFixed(2)}.`);
    if (sittingOutIds.length) {
      state.log.push(`${sittingOutIds.map((id) => getPlayer(state, id).name).join(", ")} sit out this hand — not enough cards in one deck for everyone at 7 each.`);
    }
    return state;
  }

  // --- Round 1: discard 3, pass the set to the left neighbor ---

  function submitDiscard1(state, playerId, discardIdx) {
    const player = getPlayer(state, playerId);
    const cards = discardIdx.map((i) => player.hand[i]);
    state.passSelections[playerId] = cards;
  }

  function allDiscard1Submitted(state) {
    return activePlayers(state).every((p) => state.passSelections[p.id] != null);
  }

  function resolvePassing(state) {
    const active = activePlayers(state);
    const orderedActiveIds = state.dealOrder.filter((pid) => active.some((p) => p.id === pid));
    const n = orderedActiveIds.length;
    orderedActiveIds.forEach((pid) => {
      const passed = state.passSelections[pid];
      const p = getPlayer(state, pid);
      p.hand = p.hand.filter((c) => !passed.includes(c));
    });
    orderedActiveIds.forEach((pid, i) => {
      const passed = state.passSelections[pid];
      const leftIdx = (i - 1 + n) % n; // "passed to the next active player on the left"
      const leftPid = orderedActiveIds[leftIdx];
      getPlayer(state, leftPid).hand.push(...passed);
    });
    state.log.push("Everyone discards 3 and passes them to the player on their left.");
    state.passSelections = {};
    state.status = "betting1";
    startBettingRound(state);
  }

  // --- Round 2: discard 2 more, no passing (straight discard) ---

  function submitDiscard2(state, playerId, discardIdx) {
    const player = getPlayer(state, playerId);
    const discarded = discardIdx.map((i) => player.hand[i]);
    state.discardSelections[playerId] = discarded;
  }

  function allDiscard2Submitted(state) {
    return activePlayers(state).every((p) => state.discardSelections[p.id] != null);
  }

  function resolveDiscard2(state) {
    for (const p of activePlayers(state)) {
      const discarded = state.discardSelections[p.id];
      state.discardPile.push(...discarded.map((c) => ({ rank: c.rank, suit: c.suit })));
      p.hand = p.hand.filter((c) => !discarded.includes(c));
    }
    state.log.push("Everyone discards 2 more, down to 5 cards each.");
    state.discardSelections = {};
    state.status = "betting2";
    startBettingRound(state);
  }

  // --- Betting (standard call/raise/fold, shared by every round) ---

  function startBettingRound(state) {
    const activeIds = state.dealOrder.filter((pid) => !getPlayer(state, pid).folded);
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

  // Called once a betting round closes -- advances to whatever comes next
  // for the CURRENT status.
  function advanceAfterBetting(state) {
    if (state.status === "complete") return;
    state.bettingRound = null;
    if (state.status === "betting1") {
      state.status = "discard2";
    } else if (state.status === "betting2") {
      state.status = "revealing";
    } else if (state.status === "revealingBet") {
      if (state.revealsDone >= 5) {
        resolveShowdown(state);
      } else {
        state.status = "revealing";
      }
    }
  }

  // --- Reveal phase: everyone flips their own next card simultaneously,
  // then one betting round, 5 times total. ---

  function resolveRevealRound(state) {
    for (const p of activePlayers(state)) {
      if (state.revealsDone < p.hand.length) {
        p.hand[state.revealsDone].faceUp = true;
      }
    }
    state.revealsDone += 1;
    state.log.push(`Round ${state.revealsDone}: everyone reveals their next card.`);
    state.status = "revealingBet";
    startBettingRound(state);
  }

  // A Joker (games.md's "House rule: playing with Jokers" -- Anaconda has
  // no wildcard mechanic of its own, so a dealer's-choice Joker or two fits
  // cleanly) is wild wherever it's dealt.
  function isCardWild(card) {
    return card.rank === "JOKER";
  }

  function evaluateShowingHand(state, player) {
    const cards = player.hand.filter((c) => c.faceUp).map((c) => ({ rank: c.rank, suit: c.suit, isWild: isCardWild(c) }));
    return HandEvaluator.evaluatePartial(cards);
  }

  function resolveShowdown(state) {
    if (state.hiLo) {
      resolveShowdownWithHiLo(state);
      return;
    }
    let bestHand = null;
    let winnerIds = [];
    for (const p of activePlayers(state)) {
      const cards = p.hand.map((c) => ({ rank: c.rank, suit: c.suit, isWild: isCardWild(c) }));
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

  // games.md's optional hi-lo ("everyone secretly declares going for high,
  // low, or both") -- implemented 2026-08-29 as an automatic split, the
  // same simplification rules-holdem.js's own hi-lo already uses in this
  // codebase (no manual declare step there either): a player doesn't need
  // to declare anything, their final 5-card hand is just automatically
  // evaluated for both high and a qualifying (8-or-under) low, and the pot
  // splits in half between whoever wins each side, falling back to the
  // whole pot for high alone if nobody has a qualifying low. Anaconda has
  // no wildcards at all (with or without hi-lo), so no isWild handling is
  // needed for the low side the way Criss Cross's hi-lo needs.
  function resolveShowdownWithHiLo(state) {
    const live = activePlayers(state);
    const highResults = live.map((p) => ({ id: p.id, hand: HandEvaluator.bestHand(p.hand.map((c) => ({ rank: c.rank, suit: c.suit, isWild: isCardWild(c) }))) }));
    const bestHigh = highResults.reduce((best, r) => (best == null || HandEvaluator.isBetter(r.hand, best) ? r.hand : best), null);
    const highWinnerIds = highResults.filter((r) => HandEvaluator.compareEvaluated(r.hand, bestHigh) === 0).map((r) => r.id);

    const lowResults = live
      .map((p) => ({ id: p.id, low: HandEvaluator.bestLow([p.hand.map((c) => ({ rank: c.rank, suit: c.suit }))]) }))
      .filter((r) => r.low != null);
    let lowWinnerIds = [];
    let bestLow = null;
    if (lowResults.length) {
      bestLow = lowResults.reduce((best, r) => (best == null || HandEvaluator.isBetterLow(r.low, best) ? r.low : best), null);
      lowWinnerIds = lowResults.filter((r) => JSON.stringify(r.low.ranks) === JSON.stringify(bestLow.ranks)).map((r) => r.id);
    }

    state.status = "complete";
    state.bettingRound = null;
    state.potAtShowdown = state.pot;
    state.highWinnerIds = highWinnerIds;
    state.lowWinnerIds = lowWinnerIds;
    state.winnerIds = highWinnerIds; // back-compat: the board's "showing hand" highlight only knows about the high side
    state.winnerId = highWinnerIds[0] || null;

    const potChips = state.pot;
    state.pot = 0;
    if (lowWinnerIds.length > 0) {
      const lowHalf = Math.floor(potChips / 2);
      const highHalf = potChips - lowHalf;
      payHalf(state, highWinnerIds, highHalf);
      payHalf(state, lowWinnerIds, lowHalf);
      state.log.push(
        `High: ${highWinnerIds.map((id) => getPlayer(state, id).name).join(", ")} with ${HandEvaluator.describe(bestHigh)}. Low: ${lowWinnerIds
          .map((id) => getPlayer(state, id).name)
          .join(", ")} with ${HandEvaluator.describeLow(bestLow)}. Pot: $${ChipEconomy.chipsToDollars(potChips).toFixed(2)}.`
      );
    } else {
      payHalf(state, highWinnerIds, potChips);
      state.log.push(
        `${highWinnerIds.map((id) => getPlayer(state, id).name).join(", ")} win${highWinnerIds.length === 1 ? "s" : ""} the $${ChipEconomy.chipsToDollars(potChips).toFixed(
          2
        )} pot with ${HandEvaluator.describe(bestHigh)} — no qualifying low.`
      );
    }
  }

  function payHalf(state, winnerIds, totalChips) {
    if (winnerIds.length === 0 || totalChips === 0) return;
    const share = Math.floor(totalChips / winnerIds.length);
    const remainder = totalChips - share * winnerIds.length;
    winnerIds.forEach((id, i) => {
      ChipEconomy.award(getPlayer(state, id).wallet, share + (i < remainder ? 1 : 0));
    });
  }

  return {
    createHandState,
    activePlayers,
    submitDiscard1,
    allDiscard1Submitted,
    resolvePassing,
    submitDiscard2,
    allDiscard2Submitted,
    resolveDiscard2,
    getCurrentBettor,
    isBettingRoundOver,
    maxRaiseDollars,
    submitBet,
    advanceAfterBetting,
    resolveRevealRound,
    evaluateShowingHand,
    resolveShowdown,
    getPlayer,
  };
})();

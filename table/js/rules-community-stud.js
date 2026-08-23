"use strict";

// Shared community-stud engine: every player gets a private hole-card hand
// (all face down, never individually revealed — unlike the stud family,
// nobody has a "showing hand" here), plus a shared pool of community cards
// dealt face down to the table and revealed one at a time, with a betting
// round after each reveal. Cincinnati and Criss Cross are both just a
// `gameConfig` on top of this one engine.
//
// gameConfig shape:
//   {
//     id, name,
//     holeCards: number,             // cards dealt privately to each player
//     communityCards: number,        // cards dealt face down to the table
//     bettingBeforeFirstReveal: bool,  // Criss Cross has one, Cincinnati doesn't
//     wildcardMode?: 'lastRevealed' | 'center',  // null/undefined = no wildcard (the base-game default for both games)
//     centerIndex?: number,          // required when wildcardMode === 'center'
//     handConstruction: (state, player) => evaluated hand,  // how a player's best hand is scored
//   }
const CommunityStudRules = (function () {
  function getPlayer(state, playerId) {
    return state.players.find((p) => p.id === playerId);
  }

  function nonFoldedCount(state) {
    return state.players.filter((p) => !p.folded).length;
  }

  function isCardWild(state, card) {
    return state.wildRank != null && card.rank === state.wildRank;
  }

  function holeCards(state, player) {
    return player.hand.map((c) => ({ rank: c.rank, suit: c.suit, isWild: isCardWild(state, c) }));
  }

  function revealedCommunityCards(state) {
    return state.communityCards.filter((c) => c.revealed).map((c) => ({ rank: c.rank, suit: c.suit, isWild: isCardWild(state, c) }));
  }

  function createHandState(players, dealerIndex, settings, handNumber, gameConfig) {
    const deck = Deck.shuffle(Deck.buildDeck());
    let cursor = 0;
    for (const p of players) {
      p.hand = deck.slice(cursor, cursor + gameConfig.holeCards).map((c) => ({ rank: c.rank, suit: c.suit, faceUp: false }));
      cursor += gameConfig.holeCards;
      p.folded = false;
    }
    const communityCards = deck.slice(cursor, cursor + gameConfig.communityCards).map((c) => ({ rank: c.rank, suit: c.suit, revealed: false }));
    cursor += gameConfig.communityCards;

    const dealerFirst = players.slice(dealerIndex + 1).concat(players.slice(0, dealerIndex + 1));
    const dealOrder = dealerFirst.map((p) => p.id);

    const state = {
      players,
      dealerIndex,
      handNumber,
      gameConfig,
      communityCards,
      revealIndex: 0,
      wildRank: null,
      dealOrder,
      pot: 0,
      bettingRound: null,
      phase: gameConfig.bettingBeforeFirstReveal ? "initialBet" : "revealing",
      anteDollars: settings.anteDollars,
      raiseIncrementDollars: settings.raiseIncrementDollars,
      maxBetDollars: settings.maxBetDollars,
      status: "betting",
      log: [],
      winnerId: null,
    };
    state.pot += BettingEngine.collectAntes(players, settings.anteDollars);
    return state;
  }

  function isRevealComplete(state) {
    return state.revealIndex >= state.communityCards.length;
  }

  // Cincinnati's optional variant wildcard is fixed by whichever rank the
  // FINAL community card turns out to be (a single defined moment, not a
  // rolling "most recently revealed" that changes every street) — Criss
  // Cross's optional variant is fixed the moment the center card (a
  // specific index in the layout) is revealed, whenever that happens to
  // fall in reveal order.
  function revealNextCommunityCard(state) {
    const card = state.communityCards[state.revealIndex];
    card.revealed = true;
    state.revealIndex += 1;
    state.log.push(`Community card revealed: ${Deck.cardLabel(card)}.`);
    if (state.gameConfig.wildcardMode === "lastRevealed" && isRevealComplete(state)) {
      state.wildRank = card.rank;
      state.log.push(`${card.rank}s are wild — the last community card revealed.`);
    } else if (state.gameConfig.wildcardMode === "center" && state.revealIndex - 1 === state.gameConfig.centerIndex) {
      state.wildRank = card.rank;
      state.log.push(`${card.rank}s are wild — the center card.`);
    }
    return card;
  }

  function evaluateBestHand(state, player) {
    return state.gameConfig.handConstruction(state, player);
  }

  // Cincinnati: best 5-card hand from any combination of the player's own
  // hole cards and every REVEALED community card so far (HandEvaluator's
  // bestHand already searches the best 5 from any pool size >= 5).
  function cincinnatiHandConstruction(state, player) {
    return HandEvaluator.bestHand(holeCards(state, player).concat(revealedCommunityCards(state)));
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

  // Criss Cross: a hand must combine 2-4 of the player's own hole cards
  // with 1-3 cards from ONE arm of the cross only (not mixed) -- tries
  // every valid hole-count/arm-count split (2+3, 3+2, 4+1) on each arm
  // independently and keeps the best. Only REVEALED cards in an arm are
  // usable, so this naturally reflects partial information mid-hand and
  // the full arms once every community card is up by showdown.
  function crissCrossHandConstruction(state, player) {
    const myHole = holeCards(state, player);
    const arms = [state.gameConfig.arms.horizontal, state.gameConfig.arms.vertical];
    let best = null;
    for (const armIndices of arms) {
      const armCards = armIndices
        .filter((i) => state.communityCards[i].revealed)
        .map((i) => ({ rank: state.communityCards[i].rank, suit: state.communityCards[i].suit, isWild: isCardWild(state, state.communityCards[i]) }));
      for (let h = 2; h <= 4; h++) {
        const armCount = 5 - h;
        if (armCount < 1 || armCount > armCards.length) continue;
        for (const holeCombo of combinations(myHole, h)) {
          for (const armCombo of combinations(armCards, armCount)) {
            const evaluated = HandEvaluator.bestHand(holeCombo.concat(armCombo));
            if (best == null || HandEvaluator.isBetter(evaluated, best)) best = evaluated;
          }
        }
      }
    }
    return best || { category: -1, categoryName: "No cards", tiebreakers: [] };
  }

  function foldPlayer(state, playerId) {
    const player = getPlayer(state, playerId);
    player.folded = true;
    player.hand = [];
  }

  function startBettingRound(state) {
    const activeIds = state.players.filter((p) => !p.folded).map((p) => p.id);
    state.bettingRound = BettingEngine.startRound(activeIds);
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
    });
  }

  function submitBet(state, playerId, action, raiseDollars) {
    const br = state.bettingRound;
    const player = getPlayer(state, playerId);
    const result = BettingEngine.submitBet(br, player, action, raiseDollars, {
      raiseIncrementDollars: state.raiseIncrementDollars,
      maxBetDollars: state.maxBetDollars,
    });
    state.pot += result.paidChips;

    if (action === "fold") {
      foldPlayer(state, playerId);
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
      completeHand(state, winner ? winner.id : null);
    }
  }

  function completeHand(state, winnerId) {
    state.status = "complete";
    state.winnerId = winnerId;
    state.bettingRound = null;
    if (winnerId) {
      const winner = getPlayer(state, winnerId);
      ChipEconomy.award(winner.wallet, state.pot);
      state.log.push(`${winner.name} wins the $${ChipEconomy.chipsToDollars(state.pot).toFixed(2)} pot.`);
    }
  }

  function resolveShowdown(state) {
    if (state.status === "complete") return;
    let winnerId = null;
    let bestHand = null;
    for (const p of state.players) {
      if (p.folded) continue;
      const hand = evaluateBestHand(state, p);
      if (bestHand == null || HandEvaluator.isBetter(hand, bestHand)) {
        bestHand = hand;
        winnerId = p.id;
      }
    }
    completeHand(state, winnerId);
  }

  // Advances from the current phase (or completed betting round) to the
  // next: initial bet -> first reveal; a reveal's bet -> the next reveal,
  // or showdown once every community card is up.
  function advance(state) {
    if (state.status === "complete") return;
    state.bettingRound = null;
    if (state.phase === "initialBet") {
      state.phase = "revealing";
      return;
    }
    if (isRevealComplete(state)) {
      resolveShowdown(state);
    }
  }

  return {
    createHandState,
    isRevealComplete,
    revealNextCommunityCard,
    evaluateBestHand,
    cincinnatiHandConstruction,
    crissCrossHandConstruction,
    startBettingRound,
    getCurrentBettor,
    isBettingRoundOver,
    maxRaiseDollars,
    submitBet,
    advance,
    resolveShowdown,
    foldPlayer,
    checkForInstantWin,
    getPlayer,
    nonFoldedCount,
  };
})();

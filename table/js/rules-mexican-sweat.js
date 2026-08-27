"use strict";

// Mexican Sweat: "all down, no looking at your hand" — every player is
// dealt their full hand face-down up front, then each round everyone flips
// one of their own remaining cards simultaneously (a deliberate house
// choice over the documented one-at-a-time "beat the card" version, which
// is the same structure Midnight Baseball already uses), followed by a
// betting round. Genuinely different from the dealer-deals-a-street stud
// engine (nobody deals a NEW card each round — players reveal their own
// already-dealt hand) and from Midnight Baseball's player-paced reveal
// (nobody chooses which card to flip, since they can't see their own hand
// to make an informed choice) — hence its own small engine rather than a
// config on either existing one.
const MexicanSweatRules = (function () {
  function getPlayer(state, playerId) {
    return state.players.find((p) => p.id === playerId);
  }

  function nonFoldedCount(state) {
    return state.players.filter((p) => !p.folded).length;
  }

  // games.md doesn't state a fixed card count; mirrors the same deck-size
  // scaling used elsewhere (7 cards/player at 5-7 players, 6 at a full
  // 8-player table) so the deal always stays within one 52-card deck.
  function cardsPerPlayerFor(playerCount) {
    return playerCount >= 8 ? 6 : 7;
  }

  function isCardWild(state, card) {
    return state.wildRank != null && card.rank === state.wildRank;
  }

  function faceUpCards(state, player) {
    return player.hand.filter((c) => c.faceUp).map((c) => ({ rank: c.rank, suit: c.suit, isWild: isCardWild(state, c) }));
  }

  function allCards(state, player) {
    return player.hand.map((c) => ({ rank: c.rank, suit: c.suit, isWild: isCardWild(state, c) }));
  }

  // gameConfig: { id, name, flipWildcard: bool } -- games.md leaves the
  // wildcard choice as "dealer's choice, or reveal 1 flip-up wildcard";
  // this engine implements the flip-up-wildcard option as the concrete
  // default (a fixed dealer's-choice-per-hand isn't a rule the engine can
  // encode on its own), revealed once at the start of the hand and fixed
  // for its duration.
  function createHandState(players, dealerIndex, settings, handNumber, gameConfig) {
    const deck = Deck.shuffle(Deck.buildDeck());
    const cardsPerPlayer = cardsPerPlayerFor(players.length);
    let cursor = 0;
    for (const p of players) {
      p.hand = deck.slice(cursor, cursor + cardsPerPlayer).map((c) => ({ rank: c.rank, suit: c.suit, faceUp: false, isWild: false }));
      cursor += cardsPerPlayer;
      p.folded = false;
    }

    let wildRank = null;
    if (gameConfig.flipWildcard) {
      wildRank = deck[cursor].rank;
      cursor += 1;
    }

    const dealerFirst = players.slice(dealerIndex + 1).concat(players.slice(0, dealerIndex + 1));
    const turnOrder = dealerFirst.map((p) => p.id);

    const state = {
      players,
      dealerIndex,
      handNumber,
      gameConfig,
      deck: deck.slice(cursor),
      discardPile: [],
      wildRank,
      pot: 0,
      cardsPerPlayer,
      roundIndex: 0,
      revealCursor: 0,
      turnOrder,
      bettingRound: null,
      anteDollars: settings.anteDollars,
      raiseIncrementDollars: settings.raiseIncrementDollars,
      maxBetDollars: settings.maxBetDollars,
      status: "revealing",
      log: [],
      winnerId: null,
    };
    state.pot += BettingEngine.collectAntes(players, settings.anteDollars);
    state.log.push(`Ante: $${settings.anteDollars.toFixed(2)} each from ${players.length} players — pot starts at $${ChipEconomy.chipsToDollars(state.pot).toFixed(2)}.`);
    if (wildRank) state.log.push(`${wildRank}s are wild this hand — flipped as the wildcard.`);
    return state;
  }

  function isRoundRevealComplete(state) {
    return nextRevealTarget(state) == null;
  }

  function nextRevealTarget(state) {
    for (let i = state.revealCursor; i < state.turnOrder.length; i++) {
      const pid = state.turnOrder[i];
      if (!getPlayer(state, pid).folded) {
        state.revealCursor = i;
        return pid;
      }
    }
    return null;
  }

  // Flips the player's own next hidden card. No choice involved — "no
  // looking at your hand" means a player is exactly as blind to their own
  // remaining cards as an opponent watching would be, so revealing always
  // proceeds in dealt order rather than picking a "better" one.
  function revealNextCard(state) {
    const playerId = nextRevealTarget(state);
    if (playerId == null) return null;
    const player = getPlayer(state, playerId);
    const card = player.hand.find((c) => !c.faceUp);
    state.revealCursor += 1;
    if (!card) return { playerId, card: null, ranOut: true };
    card.faceUp = true;
    return { playerId, card, ranOut: false };
  }

  function isRevealingDone(state) {
    return state.roundIndex >= state.cardsPerPlayer;
  }

  function roundsRemaining(state) {
    return state.cardsPerPlayer - state.roundIndex - 1;
  }

  function evaluateShowingHand(state, playerId) {
    return HandEvaluator.evaluatePartial(faceUpCards(state, getPlayer(state, playerId)));
  }

  function currentBestShowingHand(state) {
    let best = null;
    let holderId = null;
    for (const p of state.players) {
      if (p.folded) continue;
      const showing = evaluateShowingHand(state, p.id);
      if (best == null || HandEvaluator.isBetter(showing, best)) {
        best = showing;
        holderId = p.id;
      }
    }
    return { hand: best, holderId };
  }

  function foldPlayer(state, playerId) {
    const player = getPlayer(state, playerId);
    player.folded = true;
    state.discardPile.push(...player.hand.map((c) => ({ rank: c.rank, suit: c.suit })));
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
      const showing = evaluateShowingHand(state, playerId);
      foldPlayer(state, playerId);
      state.log.push(`${player.name} folds — showing ${HandEvaluator.describe(showing)}.`);
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

  function advanceRound(state) {
    if (state.status === "complete") return;
    state.bettingRound = null;
    state.roundIndex += 1;
    state.revealCursor = 0;
    if (isRevealingDone(state)) resolveShowdown(state);
  }

  function resolveShowdown(state) {
    if (state.status === "complete") return;
    let winnerId = null;
    let bestHand = null;
    for (const p of state.players) {
      if (p.folded) continue;
      const hand = HandEvaluator.bestHand(allCards(state, p));
      if (bestHand == null || HandEvaluator.isBetter(hand, bestHand)) {
        bestHand = hand;
        winnerId = p.id;
      }
    }
    completeHand(state, winnerId);
  }

  return {
    cardsPerPlayerFor,
    createHandState,
    isRoundRevealComplete,
    nextRevealTarget,
    revealNextCard,
    isRevealingDone,
    roundsRemaining,
    evaluateShowingHand,
    currentBestShowingHand,
    startBettingRound,
    getCurrentBettor,
    isBettingRoundOver,
    maxRaiseDollars,
    submitBet,
    advanceRound,
    resolveShowdown,
    foldPlayer,
    checkForInstantWin,
    getPlayer,
    nonFoldedCount,
  };
})();

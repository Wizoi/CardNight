"use strict";

// Shared engine for the "hit or stand against two numeric targets, split
// the pot" games (5.5-21, 7-27) -- games.md's "Other" bucket entries that
// score by card-value SUM rather than poker hand rank (see
// target-sum-evaluator.js for the pure math). Distinct from every ante+bet
// family elsewhere in this project: neither game's entry describes a
// raise/call/fold betting round at all (no "raise increment"/"max bet"
// field, unlike every stud/hold'em entry, which all state one explicitly),
// so this is treated as ANTE-ONLY, same shape as the Guts family -- the
// hit-or-stand decision itself is already the entire economic tension.
//
// gameConfig shape:
//   {
//     id, name,
//     lowTarget, highTarget,       // e.g. 5.5/21, or 7/27
//     bustRule: 'bust' | 'noBust', // 'bust': exceeding a target disqualifies THAT side; 'noBust': any sum counts, closest wins
//     cardValue(card) -> number[], // possible values this card can contribute (fixed cards return one value)
//     anteDollars?: number,        // overrides settings.anteDollars (7-27's 25c default)
//     initialDeal: { faceUp: bool[] },  // one entry per initial card dealt to every player
//     dealtCardsFaceUp: bool,      // whether cards drawn during the main hit/stand loop are face up
//     buyBack: null | { priceScheduleDollars: number[], maxBuys: number },  // 7-27's "down the river"
//     kitchenSink: bool,           // 7-27: hitting both targets exactly at once wins the WHOLE pot outright
//     tieBreak: 'split' | 'fewestCards',  // 5.5-21 is the one exception to the usual even-split default
//   }
const PressYourLuckRules = (function () {
  function getPlayer(state, playerId) {
    return state.players.find((p) => p.id === playerId);
  }

  function drawCard(state) {
    const { card, reshuffled } = Deck.drawWithReshuffle(state);
    if (reshuffled) state.log.push("The draw pile ran out — reshuffling discards back in.");
    return card;
  }

  function createHandState(players, dealerIndex, settings, gameConfig, carriedPotChips) {
    const deck = Deck.shuffle(Deck.buildDeck());
    const dealOrder = players
      .slice(dealerIndex + 1)
      .concat(players.slice(0, dealerIndex + 1))
      .map((p) => p.id);
    for (const p of players) {
      p.hand = [];
      p.standing = false;
      p.buyBacksUsed = 0;
      p.folded = false; // this family never folds -- kept only so shared render helpers elsewhere don't choke on a missing field
    }

    const state = {
      players,
      gameConfig,
      deck,
      discardPile: [],
      pot: carriedPotChips || 0,
      anteDollars: gameConfig.anteDollars || settings.anteDollars,
      dealOrder,
      turnCursor: 0,
      lapHitCount: 0,
      consecutiveStandRounds: 0,
      initialBuybackCursor: 0,
      status: "dealingInitial",
      log: [],
      results: null,
    };
    state.pot += BettingEngine.collectAntes(players, state.anteDollars);

    for (const faceUp of gameConfig.initialDeal.faceUp) {
      for (const pid of dealOrder) {
        const drawn = drawCard(state);
        getPlayer(state, pid).hand.push({ rank: drawn.rank, suit: drawn.suit, faceUp });
      }
    }
    const lastFaceUp = gameConfig.initialDeal.faceUp[gameConfig.initialDeal.faceUp.length - 1];
    state.status = lastFaceUp && gameConfig.buyBack ? "dealingInitialBuyback" : "playing";
    return state;
  }

  // --- Initial up-card buy-back (7-27 only; a no-op phase for 5.5-21,
  // which has no buyBack config and skips straight to "playing") ---

  function currentInitialBuybackPlayerId(state) {
    if (state.status !== "dealingInitialBuyback") return null;
    if (state.initialBuybackCursor >= state.dealOrder.length) return null;
    return state.dealOrder[state.initialBuybackCursor];
  }

  function resolveInitialBuyback(state, playerId, willBuy) {
    if (willBuy) applyBuyBack(state, playerId);
    else state.log.push(`${getPlayer(state, playerId).name} keeps the card.`);
    state.initialBuybackCursor += 1;
    if (state.initialBuybackCursor >= state.dealOrder.length) state.status = "playing";
  }

  function applyBuyBack(state, playerId) {
    const player = getPlayer(state, playerId);
    const priceDollars = state.gameConfig.buyBack.priceScheduleDollars[player.buyBacksUsed];
    const { paid } = ChipEconomy.pay(player.wallet, ChipEconomy.dollarsToChips(priceDollars));
    state.pot += paid;
    player.buyBacksUsed += 1;
    const oldCard = player.hand[player.hand.length - 1];
    state.discardPile.push({ rank: oldCard.rank, suit: oldCard.suit });
    const replacement = drawCard(state);
    player.hand[player.hand.length - 1] = { rank: replacement.rank, suit: replacement.suit, faceUp: false };
    state.log.push(`${player.name} buys back the card for $${priceDollars.toFixed(2)} — hidden again.`);
  }

  // --- Main hit-or-stand loop. Turn order is a repeating round-robin over
  // EVERY player (standing or not) so lap-completion bookkeeping stays
  // simple; a standing player is silently skipped rather than asked again.
  // Ends once 2 consecutive full laps pass with zero hits (games.md's
  // explicit rule for 5.5-21, applied to both games here for consistency,
  // since 7-27's own entry doesn't restate an ending condition). ---

  function advanceCursor(state) {
    state.turnCursor += 1;
    if (state.turnCursor >= state.dealOrder.length) {
      state.turnCursor = 0;
      state.consecutiveStandRounds = state.lapHitCount === 0 ? state.consecutiveStandRounds + 1 : 0;
      state.lapHitCount = 0;
      if (state.consecutiveStandRounds >= 2) state.status = "complete";
    }
  }

  // Skips silently past already-standing players (each skip still advances
  // the lap-completion bookkeeping), returning whichever player next
  // genuinely needs a hit-or-stand decision, or null once the hand is over.
  function currentDecisionPlayerId(state) {
    if (state.status !== "playing") return null;
    while (state.status === "playing") {
      const playerId = state.dealOrder[state.turnCursor];
      if (getPlayer(state, playerId).standing) {
        advanceCursor(state);
        continue;
      }
      return playerId;
    }
    return null;
  }

  // Returns { dealtCard, needsBuyBack } -- the caller must resolve a
  // buy-back decision before the turn is considered over when
  // needsBuyBack is true (advanceCursor is deferred to resolveBuyBack in
  // that case); otherwise the turn already advanced.
  function resolveHitOrStand(state, playerId, action) {
    const player = getPlayer(state, playerId);
    if (action === "stand") {
      player.standing = true;
      state.log.push(`${player.name} stands.`);
      advanceCursor(state);
      return { dealtCard: null, needsBuyBack: false };
    }
    const drawn = drawCard(state);
    if (!drawn) {
      // Deck (and discard pile -- this family barely feeds it, since
      // nobody folds and hands only shrink via a buy-back's single
      // discarded card) genuinely ran dry. Rare, but real with several
      // aggressive `bustRule: 'noBust'` seats at a full table who have no
      // reason to ever stop hitting on their own. Forced to stand instead
      // of crashing on a null card.
      player.standing = true;
      state.log.push(`${player.name} wanted another card, but the deck is empty — forced to stand.`);
      advanceCursor(state);
      return { dealtCard: null, needsBuyBack: false };
    }
    const card = { rank: drawn.rank, suit: drawn.suit, faceUp: state.gameConfig.dealtCardsFaceUp };
    player.hand.push(card);
    state.lapHitCount += 1;
    state.log.push(`${player.name} takes a card.`);
    const canBuyBack = card.faceUp && state.gameConfig.buyBack && player.buyBacksUsed < state.gameConfig.buyBack.maxBuys;
    if (!canBuyBack) advanceCursor(state);
    return { dealtCard: card, needsBuyBack: canBuyBack };
  }

  function resolveBuyBack(state, playerId, willBuy) {
    if (willBuy) applyBuyBack(state, playerId);
    else state.log.push(`${getPlayer(state, playerId).name} keeps the card.`);
    advanceCursor(state);
  }

  // --- Showdown ---

  function handSumResult(state, player, target) {
    return TargetSumEvaluator.bestForTarget(player.hand, state.gameConfig.cardValue, target, state.gameConfig.bustRule);
  }

  function pickWinners(state, results, tieBreak) {
    const contenders = results.filter((r) => !r.result.busted);
    if (!contenders.length) return [];
    const bestDistance = Math.min(...contenders.map((r) => r.result.distance));
    let tied = contenders.filter((r) => r.result.distance === bestDistance).map((r) => r.id);
    if (tieBreak === "fewestCards" && tied.length > 1) {
      const minCards = Math.min(...tied.map((id) => getPlayer(state, id).hand.length));
      tied = tied.filter((id) => getPlayer(state, id).hand.length === minCards);
    }
    return tied;
  }

  function payEvenSplit(state, winnerIds, totalChips) {
    if (!winnerIds.length || totalChips <= 0) return;
    const share = Math.floor(totalChips / winnerIds.length);
    const remainder = totalChips - share * winnerIds.length;
    winnerIds.forEach((id, i) => {
      ChipEconomy.award(getPlayer(state, id).wallet, share + (i < remainder ? 1 : 0));
    });
  }

  // Returns the chip amount that went unawarded (nobody qualified for one
  // or both halves) -- the caller carries this into the next hand's pot,
  // the same pattern Rainy Day Baseball's rain-out already uses, rather
  // than letting it silently vanish.
  function resolveShowdown(state) {
    state.status = "complete";
    const lowTarget = state.gameConfig.lowTarget;
    const highTarget = state.gameConfig.highTarget;
    const lowResults = state.players.map((p) => ({ id: p.id, result: handSumResult(state, p, lowTarget) }));
    const highResults = state.players.map((p) => ({ id: p.id, result: handSumResult(state, p, highTarget) }));

    if (state.gameConfig.kitchenSink) {
      const sinkers = state.players
        .filter((p) => {
          const sums = TargetSumEvaluator.achievableSums(p.hand, state.gameConfig.cardValue);
          return sums.includes(lowTarget) && sums.includes(highTarget);
        })
        .map((p) => p.id);
      if (sinkers.length) {
        payEvenSplit(state, sinkers, state.pot);
        state.results = { kitchenSink: true, winnerIds: sinkers, lowResults, highResults };
        state.log.push(`Kitchen Sink! ${sinkers.map((id) => getPlayer(state, id).name).join(", ")} hit both targets exactly and take the whole pot.`);
        state.pot = 0;
        return 0;
      }
    }

    const lowWinners = pickWinners(state, lowResults, state.gameConfig.tieBreak);
    const highWinners = pickWinners(state, highResults, state.gameConfig.tieBreak);
    const lowShareChips = Math.floor(state.pot / 2);
    const highShareChips = state.pot - lowShareChips;
    let carried = 0;

    if (lowWinners.length) {
      payEvenSplit(state, lowWinners, lowShareChips);
      state.log.push(`${lowWinners.map((id) => getPlayer(state, id).name).join(", ")} win the low half (closest to ${lowTarget}).`);
    } else {
      carried += lowShareChips;
      state.log.push(`Nobody qualified for the low half — that share carries forward.`);
    }
    if (highWinners.length) {
      payEvenSplit(state, highWinners, highShareChips);
      state.log.push(`${highWinners.map((id) => getPlayer(state, id).name).join(", ")} win the high half (closest to ${highTarget}).`);
    } else {
      carried += highShareChips;
      state.log.push(`Nobody qualified for the high half — that share carries forward.`);
    }

    state.results = { kitchenSink: false, lowWinners, highWinners, lowResults, highResults };
    state.pot = 0;
    return carried;
  }

  return {
    createHandState,
    currentInitialBuybackPlayerId,
    resolveInitialBuyback,
    currentDecisionPlayerId,
    resolveHitOrStand,
    resolveBuyBack,
    handSumResult,
    resolveShowdown,
    getPlayer,
  };
})();

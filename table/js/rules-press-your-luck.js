"use strict";

// Shared engine for the "hit or stand against two numeric targets, split
// the pot" games (5.5-21, 7-27) -- games.md's "Other" bucket entries that
// score by card-value SUM rather than poker hand rank (see
// target-sum-evaluator.js for the pure math).
//
// gameConfig.bettingEnabled (both games, corrected 2026-08-26 after the
// user caught the same "documented but never built" gap 3-33 had --
// app/games-data.js's own `betting` field always described real betting
// rounds): a standard call/raise/fold round right after the deal, then
// another after each full lap where every active player gets to hit or
// stand. `consecutiveStandRoundsToEnd` controls how many all-stand laps
// in a row end the hand -- 2 for 5.5-21 (games.md's explicit "one more
// complete round of no-takers"), 1 for 7-27 (confirmed by the user, not
// restated in games.md's own entry). Folding is available in both even
// though 7-27's `bustRule: 'noBust'` means nobody there ever actually
// busts -- there's just no automatic "fold when busted" trigger for it.
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
//     bettingEnabled?: bool,       // 5.5-21: real call/raise/fold betting (see above); falsy elsewhere means ante-only
//   }
const PressYourLuckRules = (function () {
  function getPlayer(state, playerId) {
    return state.players.find((p) => p.id === playerId);
  }

  function activeCount(state) {
    return state.players.filter((p) => !p.folded).length;
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
      p.busted = false; // set true only under bustRule 'bust', once a hand clears both targets -- see checkAutoStandIfBusted
      p.buyBacksUsed = 0;
      p.folded = false; // only actually usable when gameConfig.bettingEnabled -- ante-only games never fold
    }

    const state = {
      players,
      gameConfig,
      deck,
      discardPile: [],
      pot: carriedPotChips || 0,
      anteDollars: gameConfig.anteDollars || settings.anteDollars,
      raiseIncrementDollars: settings.raiseIncrementDollars,
      maxBetDollars: settings.maxBetDollars,
      bettingRound: null,
      dealOrder,
      turnCursor: 0,
      lapHitCount: 0,
      consecutiveStandRounds: 0,
      initialBuybackCursor: 0,
      status: "dealingInitial",
      log: [],
      results: null,
      winnerId: null,
    };
    state.pot += BettingEngine.collectAntes(players, state.anteDollars);
    state.log.push(`Ante: $${state.anteDollars.toFixed(2)} each from ${players.length} players — pot starts at $${ChipEconomy.chipsToDollars(state.pot).toFixed(2)}.`);

    for (const faceUp of gameConfig.initialDeal.faceUp) {
      for (const pid of dealOrder) {
        const drawn = drawCard(state);
        getPlayer(state, pid).hand.push({ rank: drawn.rank, suit: drawn.suit, faceUp });
      }
    }
    const lastFaceUp = gameConfig.initialDeal.faceUp[gameConfig.initialDeal.faceUp.length - 1];
    if (lastFaceUp && gameConfig.buyBack) {
      state.status = "dealingInitialBuyback";
    } else if (gameConfig.bettingEnabled) {
      state.status = "betting";
      startBettingRound(state);
    } else {
      state.status = "playing";
    }
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
    if (state.initialBuybackCursor >= state.dealOrder.length) {
      if (state.gameConfig.bettingEnabled) {
        state.status = "betting";
        startBettingRound(state);
      } else {
        state.status = "playing";
      }
    }
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
  // Ends once `gameConfig.consecutiveStandRoundsToEnd` full laps pass with
  // zero hits -- 2 for 5.5-21 (games.md's explicit rule: "one more
  // complete round of no-takers is required"), 1 for 7-27 (confirmed by
  // the user, not restated in games.md's own entry). Defaults to 2 if a
  // game config doesn't set it. ---

  // A lap that completes with the hand still going on: if betting is on,
  // that's a genuine "everyone's had a chance to hit or stand" moment, so
  // a betting round follows before the next lap (or before showdown, if
  // this lap also happened to be the LAST consecutive stand round needed
  // to end the hand).
  function advanceCursor(state) {
    const roundsToEnd = state.gameConfig.consecutiveStandRoundsToEnd || 2;
    state.turnCursor += 1;
    if (state.turnCursor >= state.dealOrder.length) {
      state.turnCursor = 0;
      state.consecutiveStandRounds = state.lapHitCount === 0 ? state.consecutiveStandRounds + 1 : 0;
      state.lapHitCount = 0;
      if (state.consecutiveStandRounds >= roundsToEnd) {
        state.status = "complete";
      } else if (state.gameConfig.bettingEnabled) {
        state.status = "betting";
        startBettingRound(state);
      }
    }
  }

  // Skips silently past already-standing OR already-folded players (each
  // skip still advances the lap-completion bookkeeping), returning
  // whichever player next genuinely needs a hit-or-stand decision, or null
  // once the hand is over (or a betting round has opened).
  function currentDecisionPlayerId(state) {
    if (state.status !== "playing") return null;
    while (state.status === "playing") {
      const playerId = state.dealOrder[state.turnCursor];
      const player = getPlayer(state, playerId);
      if (player.standing || player.folded) {
        advanceCursor(state);
        continue;
      }
      return playerId;
    }
    return null;
  }

  // --- Betting (5.5-21 only; 7-27 never sets gameConfig.bettingEnabled,
  // so none of this ever runs for it) ---

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
    if (activeCount(state) <= 1) {
      const winner = state.players.find((p) => !p.folded);
      state.bettingRound = null;
      state.status = "complete";
      state.winnerId = winner ? winner.id : null;
      // Marks the hand as already resolved so the caller's "run showdown"
      // fallback (triggered whenever status flips to complete with no
      // results yet) doesn't also re-score everyone's hand and double-log
      // a low/high split on top of this outright win.
      state.outrightWinnerIds = winner ? [winner.id] : [];
      if (winner) {
        ChipEconomy.award(winner.wallet, state.pot);
        state.log.push(`${winner.name} wins uncontested — takes the pot outright.`);
        state.pot = 0;
      }
    }
  }

  // Called once a betting round closes: either the hand's already ending
  // (the configured number of consecutive stand-laps was reached before
  // this round even opened) -- in which case there's nothing left to do
  // but let the caller run showdown -- or play continues into the next
  // lap.
  function advanceAfterBetting(state) {
    if (state.status === "complete") return;
    state.bettingRound = null;
    const roundsToEnd = state.gameConfig.consecutiveStandRoundsToEnd || 2;
    if (state.consecutiveStandRounds >= roundsToEnd) {
      state.status = "complete";
    } else {
      state.status = "playing";
    }
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
    if (!canBuyBack) {
      checkAutoStandIfBusted(state, player);
      advanceCursor(state);
    }
    return { dealtCard: card, needsBuyBack: canBuyBack };
  }

  function resolveBuyBack(state, playerId, willBuy) {
    if (willBuy) applyBuyBack(state, playerId);
    else state.log.push(`${getPlayer(state, playerId).name} keeps the card.`);
    checkAutoStandIfBusted(state, getPlayer(state, playerId));
    advanceCursor(state);
  }

  // Under `bustRule: 'bust'` (5.5-21; never true for 7-27's 'noBust'), once
  // a hand exceeds BOTH targets there is nothing left to gain by hitting
  // again -- every card here is worth 0 or more, so the hand can only ever
  // move further from both targets from this point on. The AI already
  // reaches the same conclusion itself (decideHitOrStand re-evaluates
  // before every action and stands once both sides are busted), but a
  // human had no equivalent: the action panel kept offering "Take a card /
  // Stand" forever after a bust, with no visible indication anything had
  // changed, since the only feedback was the word "busted" buried inside a
  // sentence in the action panel. Auto-standing (and marking `busted` for
  // the UI) makes a bust a real, visible stopping point instead of a
  // passive scoring footnote.
  function checkAutoStandIfBusted(state, player) {
    if (state.gameConfig.bustRule !== "bust" || player.standing) return;
    const low = handSumResult(state, player, state.gameConfig.lowTarget);
    const high = handSumResult(state, player, state.gameConfig.highTarget);
    if (low.busted && high.busted) {
      player.standing = true;
      player.busted = true;
      state.log.push(`${player.name} busts — over both ${formatTargetForLog(state.gameConfig.lowTarget)} and ${formatTargetForLog(state.gameConfig.highTarget)}, done for this hand.`);
    }
  }

  function formatTargetForLog(n) {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
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
    const contenders = state.players.filter((p) => !p.folded);
    const lowResults = contenders.map((p) => ({ id: p.id, result: handSumResult(state, p, lowTarget) }));
    const highResults = contenders.map((p) => ({ id: p.id, result: handSumResult(state, p, highTarget) }));

    if (state.gameConfig.kitchenSink) {
      const sinkers = contenders
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
    getCurrentBettor,
    isBettingRoundOver,
    maxRaiseDollars,
    submitBet,
    advanceAfterBetting,
    handSumResult,
    resolveShowdown,
    getPlayer,
  };
})();

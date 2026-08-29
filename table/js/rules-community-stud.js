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

  // A Joker (games.md's "House rule: playing with Jokers" -- Cincinnati and
  // Criss Cross both have no fixed wildcard by default, so a dealer's-choice
  // Joker or two fits cleanly) is wild regardless of wildcardMode.
  function isCardWild(state, card) {
    if (card.rank === "JOKER") return true;
    return state.wildRank != null && card.rank === state.wildRank;
  }

  function holeCards(state, player) {
    return player.hand.map((c) => ({ rank: c.rank, suit: c.suit, isWild: isCardWild(state, c) }));
  }

  function revealedCommunityCards(state) {
    return state.communityCards.filter((c) => c.revealed).map((c) => ({ rank: c.rank, suit: c.suit, isWild: isCardWild(state, c) }));
  }

  function createHandState(players, dealerIndex, settings, handNumber, gameConfig) {
    const deck = Deck.shuffle(Deck.buildDeck(gameConfig.jokerCount));
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
    state.log.push(`Ante: $${settings.anteDollars.toFixed(2)} each from ${players.length} players — pot starts at $${ChipEconomy.chipsToDollars(state.pot).toFixed(2)}.`);
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
  //
  // Returns the best {high, low, arm} per arm -- `low` is null if that
  // arm's cards don't yield a qualifying (8-or-under) low hand. Shared by
  // crissCrossHandConstruction (high only) and the hi-lo path below, which
  // needs to know WHICH arm produced the winning high hand (games.md: a
  // player going for both high and low must use the same single arm for
  // both, not mix -- since this app has no manual declare step the way a
  // real table would, the low entry is simply locked to whichever arm
  // produced that player's best high hand, the one deterministic reading
  // of "same arm for both" that needs no extra UI).
  function crissCrossBestByArm(state, player) {
    const myHole = holeCards(state, player);
    const arms = [
      { name: "horizontal", indices: state.gameConfig.arms.horizontal },
      { name: "vertical", indices: state.gameConfig.arms.vertical },
    ];
    const results = [];
    for (const arm of arms) {
      const armCards = arm.indices
        .filter((i) => state.communityCards[i].revealed)
        .map((i) => ({ rank: state.communityCards[i].rank, suit: state.communityCards[i].suit, isWild: isCardWild(state, state.communityCards[i]) }));
      let bestHigh = null;
      let bestLow = null;
      for (let h = 2; h <= 4; h++) {
        const armCount = 5 - h;
        if (armCount < 1 || armCount > armCards.length) continue;
        for (const holeCombo of combinations(myHole, h)) {
          for (const armCombo of combinations(armCards, armCount)) {
            const five = holeCombo.concat(armCombo);
            const evaluated = HandEvaluator.bestHand(five);
            if (bestHigh == null || HandEvaluator.isBetter(evaluated, bestHigh)) bestHigh = evaluated;
            if (state.gameConfig.hiLo) {
              const low = HandEvaluator.bestLow([five]);
              if (low && (bestLow == null || HandEvaluator.isBetterLow(low, bestLow))) bestLow = low;
            }
          }
        }
      }
      if (bestHigh) results.push({ arm: arm.name, high: bestHigh, low: bestLow });
    }
    return results;
  }

  function crissCrossHandConstruction(state, player) {
    const byArm = crissCrossBestByArm(state, player);
    let best = null;
    for (const r of byArm) {
      if (best == null || HandEvaluator.isBetter(r.high, best)) best = r.high;
    }
    return best || { category: -1, categoryName: "No cards", tiebreakers: [] };
  }

  // Hi-lo entry for Criss Cross: the low hand must come from the SAME arm
  // that produced this player's best HIGH hand (see crissCrossBestByArm) --
  // not the best low achievable from either arm independently.
  function crissCrossLowForBestHighArm(state, player) {
    const byArm = crissCrossBestByArm(state, player);
    if (!byArm.length) return null;
    const bestHighEntry = byArm.reduce((best, r) => (best == null || HandEvaluator.isBetter(r.high, best.high) ? r : best), null);
    return bestHighEntry.low;
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
    if (state.gameConfig.hiLo) {
      resolveShowdownWithHiLo(state);
      return;
    }
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

  function payEvenSplitChips(state, winnerIds, totalChips) {
    if (winnerIds.length === 0 || totalChips === 0) return;
    const share = Math.floor(totalChips / winnerIds.length);
    const remainder = totalChips - share * winnerIds.length;
    winnerIds.forEach((id, i) => {
      const player = getPlayer(state, id);
      ChipEconomy.award(player.wallet, share + (i < remainder ? 1 : 0));
    });
  }

  // Criss Cross's optional hi-lo (games.md: "Playable hi-lo. A player
  // declaring 'both' must use the same single arm for both their high and
  // low hands" -- documented for years but never implemented, a real gap
  // surfaced 2026-08-29 alongside Follow the Queen's Low Chicago). Modeled
  // the same way rules-holdem.js's hi-lo split and rules-stud.js's new Low
  // Chicago split already work in this codebase: half the pot to the best
  // high hand, half to the best qualifying low, falling back to awarding
  // the whole pot to high alone if nobody has a qualifying low. Each
  // player's low entry is locked to the arm that produced THEIR OWN best
  // high hand (state.gameConfig.lowHandConstruction), the one deterministic
  // reading of "same arm for both" that needs no manual declare step.
  function resolveShowdownWithHiLo(state) {
    const live = state.players.filter((p) => !p.folded);
    const highResults = live.map((p) => ({ id: p.id, hand: evaluateBestHand(state, p) }));
    const bestHigh = highResults.reduce((best, r) => (best == null || HandEvaluator.isBetter(r.hand, best) ? r.hand : best), null);
    const highWinnerIds = highResults.filter((r) => HandEvaluator.compareEvaluated(r.hand, bestHigh) === 0).map((r) => r.id);

    const lowResults = live
      .map((p) => ({ id: p.id, low: state.gameConfig.lowHandConstruction(state, p) }))
      .filter((r) => r.low != null);
    let lowWinnerIds = [];
    let bestLow = null;
    if (lowResults.length) {
      bestLow = lowResults.reduce((best, r) => (best == null || HandEvaluator.isBetterLow(r.low, best) ? r.low : best), null);
      lowWinnerIds = lowResults.filter((r) => JSON.stringify(r.low.ranks) === JSON.stringify(bestLow.ranks)).map((r) => r.id);
    }

    const potChips = state.pot;
    state.potAtShowdown = potChips;
    state.pot = 0;
    state.status = "complete";
    state.bettingRound = null;
    state.winnerId = highWinnerIds[0] || null; // back-compat single-winner field, same convention rules-holdem.js/rules-stud.js use
    state.highWinnerIds = highWinnerIds;
    state.lowWinnerIds = lowWinnerIds;

    if (lowWinnerIds.length > 0) {
      const lowHalf = Math.floor(potChips / 2);
      const highHalf = potChips - lowHalf;
      payEvenSplitChips(state, highWinnerIds, highHalf);
      payEvenSplitChips(state, lowWinnerIds, lowHalf);
      state.log.push(
        `High: ${highWinnerIds.map((id) => getPlayer(state, id).name).join(", ")} with ${HandEvaluator.describe(bestHigh)}. Low: ${lowWinnerIds
          .map((id) => getPlayer(state, id).name)
          .join(", ")} with ${HandEvaluator.describeLow(bestLow)}. Pot: $${ChipEconomy.chipsToDollars(potChips).toFixed(2)}.`
      );
    } else {
      payEvenSplitChips(state, highWinnerIds, potChips);
      state.log.push(
        `${highWinnerIds.map((id) => getPlayer(state, id).name).join(", ")} win${highWinnerIds.length === 1 ? "s" : ""} the $${ChipEconomy.chipsToDollars(potChips).toFixed(
          2
        )} pot with ${HandEvaluator.describe(bestHigh)} — no qualifying low.`
      );
    }
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
    holeCards,
    cincinnatiHandConstruction,
    crissCrossHandConstruction,
    crissCrossLowForBestHighArm,
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

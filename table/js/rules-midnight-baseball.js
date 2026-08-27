"use strict";

// Midnight Baseball rule engine (games.md's "Midnight Baseball" entry). Pure
// logic, no DOM — the piece most worth carrying over to a future port.
//
// Design notes for choices games.md leaves open (see the plan's "judgment
// calls" section for the full list):
// - Players can see their whole (face-down) hand immediately, like hole cards,
//   and choose which of their own cards to flip next during their turn — the
//   "one at a time" reveal is a pacing/suspense mechanic, not hidden info from
//   the player themselves.
// - Turn order repeats in laps (seat after the dealer through the dealer,
//   then around again) rather than a single pass — a player who's since been
//   overtaken gets revisited and keeps flipping their own remaining cards to
//   try to reclaim the lead, as long as they still have cards left. The hand
//   ends once a full lap passes with nobody left who both trails the board
//   and still has cards to flip.
// - A player may voluntarily concede (stop without beating the board) after
//   at least one flip, instead of being forced to flip every card — this
//   models "folded because the odds are no longer in their favor" from
//   games.md's end condition.
const MidnightBaseball = (function () {
  function cardsPerPlayerFor(playerCount) {
    // games.md doesn't state Midnight Baseball's own card count; mirrors the
    // baseball-family deck-size scaling documented for its sibling Daytime
    // Baseball so the deal always stays within one 52-card deck.
    return playerCount >= 8 ? 6 : 7;
  }

  function getPlayer(state, playerId) {
    return state.players.find((p) => p.id === playerId);
  }

  function nonFoldedCount(state) {
    return state.players.filter((p) => !p.folded).length;
  }

  function faceUpCards(player) {
    return player.hand.filter((c) => c.faceUp).map((c) => ({ rank: c.rank, suit: c.suit, isWild: c.isWild }));
  }

  function collectAntes(state) {
    state.pot += BettingEngine.collectAntes(state.players, state.anteDollars);
    state.log.push(`Ante: $${state.anteDollars.toFixed(2)} each from ${state.players.length} players — pot starts at $${ChipEconomy.chipsToDollars(state.pot).toFixed(2)}.`);
  }

  function createHandState(players, dealerIndex, settings, handNumber) {
    const deck = Deck.shuffle(Deck.buildDeck());
    const cardsPerPlayer = cardsPerPlayerFor(players.length);
    let cursor = 0;
    for (const p of players) {
      p.hand = deck.slice(cursor, cursor + cardsPerPlayer).map((c) => ({
        rank: c.rank,
        suit: c.suit,
        faceUp: false,
        isWild: false,
        bought: false,
        isBonus: false,
      }));
      cursor += cardsPerPlayer;
      p.folded = false;
      p.bestShowingHand = null;
    }
    const referenceCard = deck[cursor];
    cursor += 1;

    const dealerFirst = players.slice(dealerIndex + 1).concat(players.slice(0, dealerIndex + 1));
    const turnOrder = dealerFirst.map((p) => p.id);

    const state = {
      players,
      dealerIndex,
      handNumber,
      deck: deck.slice(cursor),
      discardPile: [], // folded players' cards, recycled once the deck runs dry
      referenceCard,
      referenceHand: HandEvaluator.evaluatePartial([{ rank: referenceCard.rank, suit: referenceCard.suit, isWild: false }]),
      pot: 0,
      turnOrder,
      lastActorIndex: -1, // "before turnOrder[0]" — nobody has taken a reveal turn yet
      bettingRound: null,
      anteDollars: settings.anteDollars,
      raiseIncrementDollars: settings.raiseIncrementDollars,
      maxBetDollars: settings.maxBetDollars,
      status: "turns",
      log: [],
      winnerId: null,
    };
    collectAntes(state);
    state.log.push(`Beat card: ${Deck.cardLabel(referenceCard)}.`);
    return state;
  }

  // A player needs another turn if they're not folded, still have cards left
  // to flip, and the board currently beats their own showing hand — i.e. they
  // trail and could still respond. A reigning leader (or anyone tapped out)
  // is skipped without ending their eligibility for a later lap.
  function needsToAct(state, playerId) {
    const player = getPlayer(state, playerId);
    if (player.folded) return false;
    if (remainingFaceDownCount(state, playerId) === 0) return false;
    const board = currentBestHand(state).hand;
    const showing = player.bestShowingHand || evaluateShowingHand(state, playerId);
    return HandEvaluator.isBetter(board, showing);
  }

  // Searches forward from right after whoever last actually took a reveal turn
  // (wrapping), for the next player who still needs to act. Returns null once
  // a full lap turns up nobody — that's how the hand knows it's over.
  //
  // Pure read, no mutation — this gets called constantly from rendering (to
  // highlight the active seat) as well as from the turn loop, and it must be
  // safe to call repeatedly without disturbing whose turn it actually is.
  // lastActorIndex (not a separately-advanced cursor) is the single source of
  // truth for "where are we in the rotation," set only by stopTurn — the one
  // place a reveal turn actually concludes. An earlier version used a
  // `turnCursor` that only `advanceTurn`'s blind "+1" moved forward; once a
  // player could fold out of turn order (mid-bet, before their own turn), that
  // +1 could land short of the truth, since it had no idea how many players
  // the search actually skipped to find the real next actor.
  function currentTurnPlayerId(state) {
    const n = state.turnOrder.length;
    const start = (state.lastActorIndex + 1) % n;
    for (let i = 0; i < n; i++) {
      const idx = (start + i) % n;
      const pid = state.turnOrder[idx];
      if (needsToAct(state, pid)) {
        return pid;
      }
    }
    return null;
  }

  function remainingFaceDownCount(state, playerId) {
    return getPlayer(state, playerId).hand.filter((c) => !c.faceUp).length;
  }

  // Flips one of a player's own face-down cards. Returns the card and whether
  // a buy decision (3/9/4) needs resolving before the turn can continue.
  function flipCard(state, playerId, cardIndex) {
    const player = getPlayer(state, playerId);
    const card = player.hand[cardIndex];
    card.faceUp = true;
    if (card.rank === "3") return { card, needsDecision: "buy3" };
    if (card.rank === "9") return { card, needsDecision: "buy9" };
    if (card.rank === "4") return { card, needsDecision: "buy4" };
    return { card, needsDecision: null };
  }

  // Declining does NOT fold directly — the caller routes a decline through
  // stopTurn(state, playerId, "declinedWild") so every way a turn can end goes
  // through the same fold + betting-round + instant-win path.
  function resolveBuy3(state, playerId, willBuy) {
    const player = getPlayer(state, playerId);
    const card = player.hand.find((c) => c.faceUp && c.rank === "3" && !c.bought);
    const result = BaseballWildcards.resolveBuy3(card, player.wallet, willBuy);
    state.pot += result.paidChips;
    if (willBuy) state.log.push(`${player.name} buys the 3 for $3 — it's wild.`);
    return { declined: !willBuy };
  }

  function resolveBuy9(state, playerId, willBuy) {
    const player = getPlayer(state, playerId);
    const card = player.hand.find((c) => c.faceUp && c.rank === "9" && !c.bought);
    const result = BaseballWildcards.resolveBuy9(card, player.wallet, willBuy);
    state.pot += result.paidChips;
    if (willBuy) state.log.push(`${player.name} buys the 9 for $2 — it's wild.`);
    else state.log.push(`${player.name} leaves the 9 as a plain card.`);
  }

  // Draws from the leftover deal — reserved for 4-bonus buys, since that's the
  // only way cards leave the deck mid-hand. Only 4 fours exist, so with enough
  // buys (or a small leftover reserve at a fuller table) it can run dry; once
  // it does, folded players' cards (taken off the table into the discard pile)
  // get reshuffled in as the next source, rather than the buy silently failing.
  function drawCard(state) {
    const { card, reshuffled } = Deck.drawWithReshuffle(state);
    if (reshuffled) state.log.push("The draw pile ran out — reshuffling folded players' cards back in.");
    return card;
  }

  function resolveBuy4(state, playerId, willBuy) {
    const player = getPlayer(state, playerId);
    if (!willBuy) {
      state.log.push(`${player.name} passes on the bonus card.`);
      return;
    }
    const result = BaseballWildcards.resolveBuy4(player.hand, player.wallet, willBuy, () => drawCard(state));
    if (!result.drew) {
      state.log.push(`${player.name} wanted a bonus card, but no cards are left to draw.`);
      return;
    }
    state.pot += result.paidChips;
    state.log.push(`${player.name} buys a bonus card off the 4 for $1.`);
  }

  function evaluateShowingHand(state, playerId) {
    return HandEvaluator.evaluatePartial(faceUpCards(getPlayer(state, playerId)));
  }

  // The best hand a player could still end up showing: their whole hand (they
  // already know all their own cards), with any not-yet-decided 3/9 optimistically
  // assumed wild. Already-resolved cards (bought or declined) keep their real
  // status. This is what "is it even possible to beat the board" should be judged
  // against — not the showing hand alone, which is artificially weak (or empty)
  // for anyone who hasn't had their turn yet.
  function estimatePotential(state, playerId) {
    const player = getPlayer(state, playerId);
    const cards = player.hand.map((c) => {
      let isWild = c.isWild;
      if (!c.faceUp && (c.rank === "3" || c.rank === "9")) isWild = true;
      return { rank: c.rank, suit: c.suit, isWild };
    });
    return HandEvaluator.bestHand(cards);
  }

  // Recomputed from each non-folded player's own recorded best hand (rather than
  // a single cached "leader") so a later fold correctly hands the lead back to
  // whoever's showing hand is actually still best among survivors.
  function currentBestHand(state) {
    let best = state.referenceHand;
    let holderId = null;
    for (const p of state.players) {
      if (p.folded || !p.bestShowingHand) continue;
      if (HandEvaluator.isBetter(p.bestShowingHand, best)) {
        best = p.bestShowingHand;
        holderId = p.id;
      }
    }
    return { hand: best, holderId };
  }

  function hasBeatenBoard(state, playerId) {
    return HandEvaluator.isBetter(evaluateShowingHand(state, playerId), currentBestHand(state).hand);
  }

  // A folded player's cards are taken off the table entirely — not shown
  // anymore, win or lose — and go into the discard pile to be recycled into
  // the draw pile for future 4-bonus buys once the deck runs dry.
  function foldPlayer(state, playerId) {
    const player = getPlayer(state, playerId);
    player.folded = true;
    state.discardPile.push(...player.hand.map((c) => ({ rank: c.rank, suit: c.suit })));
    player.hand = [];
  }

  const STOP_MESSAGES = {
    ranOut: (name) => `${name} ran out of cards without beating the board.`,
    declinedWild: (name) => `${name} declines the 3 and folds.`,
  };

  // reason: 'beat' | 'ranOut' | 'concede' | 'declinedWild'
  function stopTurn(state, playerId, reason) {
    const player = getPlayer(state, playerId);
    state.lastActorIndex = state.turnOrder.indexOf(playerId);
    if (reason === "beat") {
      player.bestShowingHand = evaluateShowingHand(state, playerId);
      state.log.push(`${player.name} beats the board with ${HandEvaluator.describe(player.bestShowingHand)}.`);
    } else if (reason === "concede") {
      const showing = evaluateShowingHand(state, playerId);
      const board = currentBestHand(state).hand;
      const remaining = remainingFaceDownCount(state, playerId);
      foldPlayer(state, playerId);
      state.log.push(
        `${player.name} concedes — showing ${HandEvaluator.describe(showing)} with ${remaining} card(s) left, needed to beat: ${HandEvaluator.describe(board)}.`
      );
    } else {
      foldPlayer(state, playerId);
      state.log.push(STOP_MESSAGES[reason](player.name));
    }
    startBettingRound(state);
    checkForInstantWin(state);
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

  // action: 'fold' | 'call' | 'raise'
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
      const board = currentBestHand(state).hand;
      const remaining = remainingFaceDownCount(state, playerId);
      foldPlayer(state, playerId);
      state.log.push(
        `${player.name} folds — showing ${HandEvaluator.describe(showing)} with ${remaining} card(s) left, needed to beat: ${HandEvaluator.describe(board)}.`
      );
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

  // The reveal-turn side of things is entirely tracked via lastActorIndex (set
  // by stopTurn) — this just clears the finished betting round and checks
  // whether anyone's left who needs another turn.
  function advanceTurn(state) {
    if (state.status === "complete") return;
    state.bettingRound = null;
    if (currentTurnPlayerId(state) == null) {
      completeHand(state, currentBestHand(state).holderId);
    }
  }

  return {
    cardsPerPlayerFor,
    createHandState,
    currentTurnPlayerId,
    needsToAct,
    remainingFaceDownCount,
    flipCard,
    resolveBuy3,
    resolveBuy9,
    resolveBuy4,
    evaluateShowingHand,
    estimatePotential,
    hasBeatenBoard,
    currentBestHand,
    stopTurn,
    startBettingRound,
    getCurrentBettor,
    isBettingRoundOver,
    maxRaiseDollars,
    submitBet,
    advanceTurn,
    getPlayer,
    nonFoldedCount,
  };
})();

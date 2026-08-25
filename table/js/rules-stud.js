"use strict";

// Shared dealer-dealt stud engine: cards are dealt to every player on a
// fixed per-game schedule (a "street" per round: down or up, with or
// without a betting round after), instead of Midnight Baseball's
// player-paced "beat the card" reveal. Daytime Baseball and Rainy Day
// Baseball are both just a `gameConfig` on top of this one engine.
//
// gameConfig shape:
//   {
//     id, name,
//     streets(playerCount) -> [{ faceUp: bool, bettingAfter: bool }, ...],
//     wildcards: BaseballWildcards | null,        // null when this game has no fixed-rank wildcard
//     rainOutCheck?: (state, dealtCard, gameMemory) -> bool,  // true if this card rains out the hand
//     wipe?: { priceScheduleDollars: number[], finalRoundMultiplier: number },  // Free Enterprise's "buy your card" mechanic
//     firstToActId?: (state) -> playerId,          // who leads each betting round (default: fixed dealer-relative order)
//     rollingWildcard?: { triggerRank: string },    // Follow the Queen: triggerRank is always wild, and so is
//                                                    // whatever rank follows the most-recently-exposed one
//     selfDeterminedWild?: { targetSum: number, rankValue: (rank) => number|null },  // Seven and What Makes It:
//                                                    // any of a player's own cards summing to targetSum are wild
//     tableCards?: { count: number },               // The Good, the Bad and the Ugly: N cards dealt face down to
//                                                    // the table (not any player's hand) at hand start, concealed
//                                                    // until a street's tableRevealAfter fires
//     tableReveals?: [{ effect: 'wild'|'discard'|'foldOnUpMatch', label: string }],  // one entry per table card,
//                                                    // indexed by a street's tableRevealAfter
//   }
//
// A street entry can also carry `tableRevealAfter: <tableCards index>` — once
// that street's normal betting round finishes, the corresponding table card
// flips face up, its effect resolves table-wide, and a SECOND betting round
// runs on that same street before the engine advances to the next one.
//
// gameMemory is an object owned by the caller (the per-game orchestrator,
// not the per-hand state) and passed into every createHandState call for
// this game — it's how a cross-hand counter like Rainy Day's rain-out
// escalation (1 red queen the first time, 2 thereafter) survives between
// hands of the same game sitting without leaking into Midnight Baseball or
// a different game entirely.
const StudRules = (function () {
  function getPlayer(state, playerId) {
    return state.players.find((p) => p.id === playerId);
  }

  function nonFoldedCount(state) {
    return state.players.filter((p) => !p.folded).length;
  }

  // Whether a card counts as wild right now. Most games bake this onto the
  // card itself (`card.isWild`, set permanently the moment a 3/9 is bought)
  // — but Follow the Queen's wildcard rank *shifts* over the course of a
  // hand (a later exposed queen cancels the earlier "follow" rank), so a
  // card's wildness can't be decided once and cached; it has to be
  // re-evaluated against the hand's current rolling-wildcard state every
  // time a hand gets scored.
  function isCardWild(state, card) {
    if (card.isWild) return true;
    if (state.gameConfig.rollingWildcard) {
      if (card.rank === state.gameConfig.rollingWildcard.triggerRank) return true;
      if (state.followWildRank && card.rank === state.followWildRank) return true;
    }
    // The Good, the Bad and the Ugly: "The Good" reveal makes a rank wild
    // table-wide for the rest of the hand, for every card of that rank any
    // player holds (including ones dealt after the reveal) — not baked onto
    // one specific card the way a bought 3/9 is.
    if (state.wildTableRanks && state.wildTableRanks.includes(card.rank)) return true;
    return false;
  }

  function faceUpCards(state, player) {
    return player.hand.filter((c) => c.faceUp).map((c) => ({ rank: c.rank, suit: c.suit, isWild: isCardWild(state, c) }));
  }

  function allCards(state, player) {
    return player.hand.map((c) => ({ rank: c.rank, suit: c.suit, isWild: isCardWild(state, c) }));
  }

  function collectAntes(state) {
    state.pot += BettingEngine.collectAntes(state.players, state.anteDollars);
  }

  // carriedPotChips: a rained-out hand (Rainy Day Baseball) ends with no
  // winner and its pot deliberately unawarded — the caller passes that
  // amount back in here so the next hand starts with it already in the pot,
  // on top of the new antes, per games.md's "pot carries forward" rule.
  function createHandState(players, dealerIndex, settings, handNumber, gameConfig, gameMemory, carriedPotChips) {
    let deck = Deck.shuffle(Deck.buildDeck());
    const streets = gameConfig.streets(players.length);
    const dealerFirst = players.slice(dealerIndex + 1).concat(players.slice(0, dealerIndex + 1));
    const dealOrder = dealerFirst.map((p) => p.id);

    for (const p of players) {
      p.hand = [];
      p.folded = false;
    }

    // The Good, the Bad and the Ugly: N cards set aside face down as
    // "table" cards before any player cards are dealt -- these are never
    // part of anyone's hand, just a reveal trigger, so they're drawn off
    // the top once here rather than through the per-street deal path.
    let tableCards = [];
    if (gameConfig.tableCards) {
      tableCards = deck.slice(0, gameConfig.tableCards.count).map((c) => ({ rank: c.rank, suit: c.suit, revealed: false }));
      deck = deck.slice(gameConfig.tableCards.count);
    }

    const state = {
      players,
      dealerIndex,
      handNumber,
      gameConfig,
      gameMemory: gameMemory || {},
      deck,
      discardPile: [],
      pot: carriedPotChips || 0,
      streets,
      streetIndex: 0,
      dealOrder,
      dealCursor: 0,
      bettingRound: null,
      anteDollars: settings.anteDollars,
      raiseIncrementDollars: settings.raiseIncrementDollars,
      maxBetDollars: settings.maxBetDollars,
      status: "dealing",
      log: [],
      winnerId: null,
      rainedOut: false,
      tableCards,
      tableRevealsResolved: [],
    };
    collectAntes(state);
    return state;
  }

  function currentStreet(state) {
    return state.streets[state.streetIndex];
  }

  // Whoever in dealOrder (skipping folded players) hasn't yet received this
  // street's card. Returns null once everyone still in has one.
  function nextDealTarget(state) {
    for (let i = state.dealCursor; i < state.dealOrder.length; i++) {
      const pid = state.dealOrder[i];
      if (!getPlayer(state, pid).folded) {
        state.dealCursor = i;
        return pid;
      }
    }
    return null;
  }

  function isStreetDealingComplete(state) {
    return nextDealTarget(state) == null;
  }

  // Deals one card to the next player still owed one this street. Returns
  // {playerId, card, needsDecision, rainedOut, exhausted} — needsDecision is
  // 'buy3'|'buy9'|'buy4' (baseball-family games), 'wipe' (Free Enterprise),
  // or null. A game only ever configures one of wildcards/wipe, so these
  // never compete for the same dealt card.
  //
  // Draws through the same reshuffle-safe path 4-bonus buys use, not a bare
  // `state.deck.shift()`: at a full table, normal per-street dealing alone
  // can use most of the deck (e.g. 8 players x 6 cards = 48 of 52), so a
  // handful of 4-bonus buys before anyone's folded (the only source of the
  // discard pile) can exhaust it during ordinary dealing, not just bonus
  // draws. `exhausted: true` (deck AND discard pile both empty) is a rare
  // edge case the caller should treat as "stop dealing, go to showdown with
  // what's been dealt" rather than a crash.
  function dealNextCard(state) {
    const playerId = nextDealTarget(state);
    if (playerId == null) return null;
    const player = getPlayer(state, playerId);
    const street = currentStreet(state);
    const { card: raw, reshuffled } = Deck.drawWithReshuffle(state);
    if (reshuffled) state.log.push("The draw pile ran out — reshuffling folded players' cards back in.");
    if (!raw) {
      state.dealCursor += 1;
      return { playerId, card: null, needsDecision: null, rainedOut: false, exhausted: true };
    }
    const card = { rank: raw.rank, suit: raw.suit, faceUp: street.faceUp, isWild: false, bought: false, isBonus: false };
    player.hand.push(card);
    state.dealCursor += 1;

    let rainedOut = false;
    if (state.gameConfig.rainOutCheck && state.gameConfig.rainOutCheck(state, card, state.gameMemory)) {
      rainedOut = true;
      state.rainedOut = true;
    }

    // Follow the Queen: whatever rank immediately follows an exposed queen
    // (or the trigger rank generally) becomes wild table-wide until a later
    // trigger card cancels it. Resolve any pending trigger with THIS card
    // first, then check whether this same card arms the NEXT one -- so a
    // queen immediately followed by another queen re-arms correctly instead
    // of being treated as its own follow-target.
    if (card.faceUp && state.gameConfig.rollingWildcard) {
      if (state.pendingRollingWild) {
        state.followWildRank = card.rank;
        state.pendingRollingWild = false;
        state.log.push(`${card.rank}s are now wild, following the ${state.gameConfig.rollingWildcard.triggerRank}.`);
      }
      if (card.rank === state.gameConfig.rollingWildcard.triggerRank) {
        state.pendingRollingWild = true;
      }
    }

    let needsDecision = null;
    if (!rainedOut && card.faceUp && state.gameConfig.wildcards) {
      if (card.rank === "3") needsDecision = "buy3";
      else if (card.rank === "9") needsDecision = "buy9";
      else if (card.rank === "4") needsDecision = "buy4";
    } else if (!rainedOut && card.faceUp && state.gameConfig.wipe) {
      needsDecision = "wipe";
    }
    return { playerId, card, needsDecision, rainedOut };
  }

  // The wipe price escalates with how many wipes have happened this hand
  // (across all players, not per-player — games.md doesn't scope it any
  // narrower), and doubles on the final round a wipe is even possible.
  // That's NOT necessarily the literal last street: Free Enterprise's own
  // last street is a down card (wipes only ever apply to face-up deals),
  // so comparing against `streets.length - 1` directly meant the "doubled
  // on the final round" rule could never actually fire — a real bug, found
  // by re-checking this against games.md's wording rather than the deal
  // shape alone. Exposed so the UI can show the price before the player
  // decides.
  function currentWipePriceDollars(state) {
    const schedule = state.gameConfig.wipe.priceScheduleDollars;
    const wipeCount = state.wipeCount || 0;
    const base = schedule[Math.min(wipeCount, schedule.length - 1)];
    const lastWipeableStreetIndex = state.streets.reduce((lastIdx, street, idx) => (street.faceUp ? idx : lastIdx), -1);
    const isFinalWipeableStreet = state.streetIndex === lastWipeableStreetIndex;
    return isFinalWipeableStreet ? base * state.gameConfig.wipe.finalRoundMultiplier : base;
  }

  // Free Enterprise's "buy your card": discard the card just dealt and draw
  // a replacement (still face-up), at an escalating price. Unlike the
  // baseball-family buys, this isn't about making a card wild — it's a
  // straight do-over on a card that isn't helping.
  function resolveWipe(state, playerId, willWipe) {
    const player = getPlayer(state, playerId);
    if (!willWipe) {
      state.log.push(`${player.name} keeps the card.`);
      return;
    }
    const priceDollars = currentWipePriceDollars(state);
    const oldCard = player.hand[player.hand.length - 1];
    state.discardPile.push({ rank: oldCard.rank, suit: oldCard.suit });
    const replacement = drawCard(state);
    if (!replacement) {
      state.log.push(`${player.name} wanted to wipe, but no cards are left to draw.`);
      return;
    }
    player.hand[player.hand.length - 1] = { rank: replacement.rank, suit: replacement.suit, faceUp: true, isWild: false, bought: false, isBonus: false };
    const { paid } = ChipEconomy.pay(player.wallet, ChipEconomy.dollarsToChips(priceDollars));
    state.pot += paid;
    state.wipeCount = (state.wipeCount || 0) + 1;
    state.log.push(`${player.name} wipes the card for $${priceDollars.toFixed(2)}.`);
  }

  // Same signatures as rules-midnight-baseball.js's resolveBuy3/9/4, so AI
  // and UI code paths can share shape — but here the target card is always
  // "whoever's hand just got a card this deal step," found the same way MB
  // finds it (safe here too: a stud engine only ever has one live unresolved
  // 3/9 outstanding per player at a time, since the next street doesn't deal
  // until this one's decisions are resolved).
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
    const cards = faceUpCards(state, getPlayer(state, playerId));
    if (state.gameConfig.selfDeterminedWild) {
      const { targetSum, rankValue } = state.gameConfig.selfDeterminedWild;
      return HandEvaluator.bestHandWithSumWild(cards, targetSum, rankValue);
    }
    return HandEvaluator.evaluatePartial(cards);
  }

  // Best current showing hand among non-folded players, purely from
  // face-up cards — recomputed fresh each call since stud's dealing is
  // simultaneous per street rather than a player-paced reveal (no MB-style
  // cached "bestShowingHand" is needed).
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

  function streetsRemaining(state) {
    return state.streets.length - state.streetIndex - 1;
  }

  function foldPlayer(state, playerId) {
    const player = getPlayer(state, playerId);
    player.folded = true;
    state.discardPile.push(...player.hand.map((c) => ({ rank: c.rank, suit: c.suit })));
    player.hand = [];
  }

  function startBettingRound(state) {
    let activeIds = state.players.filter((p) => !p.folded).map((p) => p.id);
    if (state.gameConfig.firstToActId) {
      const leaderId = state.gameConfig.firstToActId(state);
      const idx = activeIds.indexOf(leaderId);
      if (idx > 0) activeIds = activeIds.slice(idx).concat(activeIds.slice(0, idx));
    }
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

  // A rain-out ends the hand outright with no winner — the pot is meant to
  // carry forward to the next hand (games.md), so it's deliberately left
  // sitting in state.pot rather than awarded; the caller (the per-game
  // orchestrator) is responsible for carrying state.pot into the next
  // createHandState call instead of starting it back at zero.
  function completeHandRainedOut(state) {
    state.status = "complete";
    state.winnerId = null;
    state.bettingRound = null;
    state.log.push("Rained out! The pot carries forward to the next hand.");
  }

  // The Good, the Bad and the Ugly: flips the indexed table card and
  // applies its effect table-wide, once, the first time its street's
  // betting round closes. `discard` strips the matching rank from every
  // live hand outright (down and up cards alike -- games.md doesn't scope
  // it to just the visible ones); `foldOnUpMatch` only checks up cards,
  // since that's the one games.md explicitly ties to the *up* card.
  function resolveTableReveal(state, revealIndex) {
    const tableCard = state.tableCards[revealIndex];
    const { effect, label } = state.gameConfig.tableReveals[revealIndex];
    tableCard.revealed = true;
    state.tableRevealsResolved.push(revealIndex);
    state.log.push(`"${label}" revealed: ${Deck.cardLabel(tableCard)}.`);

    if (effect === "wild") {
      state.wildTableRanks = state.wildTableRanks || [];
      state.wildTableRanks.push(tableCard.rank);
      state.log.push(`${tableCard.rank}s are now wild.`);
    } else if (effect === "discard") {
      for (const p of state.players) {
        if (p.folded) continue;
        const before = p.hand.length;
        p.hand = p.hand.filter((c) => c.rank !== tableCard.rank);
        if (p.hand.length < before) state.log.push(`${p.name} discards ${tableCard.rank}(s) matching "${label}".`);
      }
    } else if (effect === "foldOnUpMatch") {
      for (const p of state.players) {
        if (p.folded) continue;
        if (p.hand.some((c) => c.faceUp && c.rank === tableCard.rank)) {
          foldPlayer(state, p.id);
          state.log.push(`${p.name} folds — up-card matches "${label}".`);
        }
      }
      checkForInstantWin(state);
    }
  }

  // Closes out the current street's betting (or skips straight past a
  // no-betting street) and moves to the next one, or to showdown once the
  // schedule is exhausted. A street with `tableRevealAfter` set gets a
  // reveal + a second betting round inserted before it actually advances --
  // the reveal only fires once (tracked in tableRevealsResolved), so the
  // second betting round's own close-out falls through to the normal
  // advance below.
  function advanceStreet(state) {
    if (state.status === "complete") return;
    state.bettingRound = null;
    const street = currentStreet(state);
    if (street.tableRevealAfter != null && !state.tableRevealsResolved.includes(street.tableRevealAfter)) {
      resolveTableReveal(state, street.tableRevealAfter);
      if (state.status === "complete") return;
      startBettingRound(state);
      return;
    }
    state.streetIndex += 1;
    state.dealCursor = 0;
    if (state.streetIndex >= state.streets.length) {
      resolveShowdown(state);
    }
  }

  function resolveShowdown(state) {
    if (state.status === "complete") return;
    const selfWild = state.gameConfig.selfDeterminedWild;
    let winnerId = null;
    let bestHand = null;
    for (const p of state.players) {
      if (p.folded) continue;
      const cards = allCards(state, p);
      const hand = selfWild ? HandEvaluator.bestHandWithSumWild(cards, selfWild.targetSum, selfWild.rankValue) : HandEvaluator.bestHand(cards);
      if (bestHand == null || HandEvaluator.isBetter(hand, bestHand)) {
        bestHand = hand;
        winnerId = p.id;
      }
    }
    completeHand(state, winnerId);
  }

  // Declining a 3 folds the player outright (required to stay in the hand,
  // same house rule as Midnight Baseball) — routed through one function so
  // every caller (AI loop, human UI) gets the same fold + log + instant-win
  // check rather than duplicating it.
  function declineThreeAndFold(state, playerId) {
    const player = getPlayer(state, playerId);
    foldPlayer(state, playerId);
    state.log.push(`${player.name} declines the 3 and folds.`);
    checkForInstantWin(state);
  }

  return {
    createHandState,
    currentStreet,
    nextDealTarget,
    isStreetDealingComplete,
    dealNextCard,
    resolveBuy3,
    resolveBuy9,
    resolveBuy4,
    resolveWipe,
    currentWipePriceDollars,
    declineThreeAndFold,
    evaluateShowingHand,
    currentBestShowingHand,
    streetsRemaining,
    startBettingRound,
    getCurrentBettor,
    isBettingRoundOver,
    maxRaiseDollars,
    submitBet,
    advanceStreet,
    resolveTableReveal,
    resolveShowdown,
    completeHandRainedOut,
    foldPlayer,
    checkForInstantWin,
    getPlayer,
    nonFoldedCount,
  };
})();

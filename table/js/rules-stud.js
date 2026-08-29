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
//     enterprisePile?: { priceScheduleDollars: number[], finalRoundMultiplier: number },  // Free Enterprise's
//                                                    // shared 3-card buy pile (see resolveEnterpriseBuy/Wipe/Free below) —
//                                                    // priceScheduleDollars is positional ($1/$2/$3 for pile slots 0/1/2),
//                                                    // not per-count-of-wipes-so-far the way it first looked
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
    // A Joker (games.md's "House rule: playing with Jokers" -- Free
    // Enterprise has no wildcard rule of its own, so a dealer's-choice
    // Joker or two fits cleanly) is wild no matter how it was dealt.
    if (card.rank === "JOKER") return true;
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
    state.log.push(`Ante: $${state.anteDollars.toFixed(2)} each from ${state.players.length} players — pot starts at $${ChipEconomy.chipsToDollars(state.pot).toFixed(2)}.`);
  }

  // carriedPotChips: a rained-out hand (Rainy Day Baseball) ends with no
  // winner and its pot deliberately unawarded — the caller passes that
  // amount back in here so the next hand starts with it already in the pot,
  // on top of the new antes, per games.md's "pot carries forward" rule.
  function createHandState(players, dealerIndex, settings, handNumber, gameConfig, gameMemory, carriedPotChips) {
    let deck = Deck.shuffle(Deck.buildDeck(gameConfig.jokerCount));
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

    // Free Enterprise: a shared 3-card face-up pile, drawn off the top of
    // the deck before any player card, refilled from the same source
    // throughout the hand (see refillEnterprisePile).
    let enterprisePile = [];
    if (gameConfig.enterprisePile) {
      enterprisePile = deck.slice(0, 3).map((c) => ({ rank: c.rank, suit: c.suit }));
      deck = deck.slice(3);
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
      enterprisePile,
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
  // 'buy3'|'buy9'|'buy4' (baseball-family games), 'enterprisePile' (Free
  // Enterprise), or null. A game only ever configures one of
  // wildcards/enterprisePile, so these never compete for the same dealt card.
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

    // Free Enterprise: nobody's dealt a card directly here -- their card
    // for this round comes from a turn at the shared pile (buy/wipe/free),
    // which decides both its identity and its face-up/face-down status.
    // Nothing to draw yet; the caller resolves the decision via
    // resolveEnterpriseBuy/Wipe/Free below. Only pile-round streets
    // trigger this -- FREE_ENTERPRISE_CONFIG's initial 2 streets set a
    // real `faceUp: false` (the plain "2 down to start" deal), while its
    // pile-round streets deliberately leave `faceUp` undefined, which is
    // the only thing distinguishing them. REAL BUG (caught live, not by
    // testing): checking `state.gameConfig.enterprisePile` alone fired on
    // every street including those first 2, so the initial down cards
    // were never actually dealt at all -- players went straight into pile
    // decisions with an empty hand from turn one.
    if (state.gameConfig.enterprisePile && street.faceUp === undefined) {
      state.dealCursor += 1;
      return { playerId, card: null, needsDecision: "enterprisePile", rainedOut: false };
    }

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
    let eliminatedPlayerId = null;
    if (state.gameConfig.rainOutCheck && state.gameConfig.rainOutCheck(state, card, state.gameMemory)) {
      // games.md's optional "once you're out, you're out" rule (Rainy Day
      // Baseball): instead of killing the whole hand, only the player just
      // dealt the rain-out card is eliminated for the rest of THIS hand —
      // everyone else keeps playing. Off by default (rainOutScope unset ==
      // the base "whole hand rains out" rule).
      if (state.gameConfig.rainOutScope === "dealtPlayerOnly") {
        eliminatedPlayerId = playerId;
        foldPlayer(state, playerId);
        state.log.push(`${player.name} is rained out — eliminated for the rest of this hand ("once you're out, you're out").`);
      } else {
        rainedOut = true;
        state.rainedOut = true;
      }
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
    if (!rainedOut && !eliminatedPlayerId && card.faceUp && state.gameConfig.wildcards) {
      if (card.rank === "3") needsDecision = "buy3";
      else if (card.rank === "9") needsDecision = "buy9";
      else if (card.rank === "4") needsDecision = "buy4";
    }
    return { playerId, card, needsDecision, rainedOut, eliminatedPlayerId };
  }

  // Free Enterprise's Enterprise pile: a shared 3-card face-up spread a
  // player buys from (or wipes, or skips for a free card) instead of being
  // dealt directly. Position-priced ($1/$2/$3 by pile slot, not by how many
  // wipes have happened — the earlier draft of this rule assumed a single
  // escalating price and had to be corrected against the real house rule),
  // doubled on the final round. `state.streetIndex` doubles as "which round
  // of the pile is this" here, since every street uses the pile the same
  // way (no fixed up/down schedule the way other stud games have).
  function currentEnterprisePriceDollars(state, position) {
    const schedule = state.gameConfig.enterprisePile.priceScheduleDollars;
    const base = schedule[position];
    const isFinalStreet = state.streetIndex === state.streets.length - 1;
    return isFinalStreet ? base * state.gameConfig.enterprisePile.finalRoundMultiplier : base;
  }

  // Tops the pile back up to 3 from the deck (reshuffling the discard pile
  // in if it runs dry, same reshuffle-safe path as everything else this
  // engine draws from) -- called after any card leaves the pile, whether
  // bought or wiped away.
  function refillEnterprisePile(state) {
    while (state.enterprisePile.length < 3) {
      const card = drawCard(state);
      if (!card) break;
      state.enterprisePile.push({ rank: card.rank, suit: card.suit });
    }
  }

  // Buying a pile card leaves it face up -- the whole table already saw it
  // sitting in the pile, so there's nothing left to hide.
  function resolveEnterpriseBuy(state, playerId, position) {
    const player = getPlayer(state, playerId);
    const priceDollars = currentEnterprisePriceDollars(state, position);
    const chosen = state.enterprisePile.splice(position, 1)[0];
    const { paid } = ChipEconomy.pay(player.wallet, ChipEconomy.dollarsToChips(priceDollars));
    state.pot += paid;
    player.hand.push({ rank: chosen.rank, suit: chosen.suit, faceUp: true, isWild: false, bought: false, isBonus: false });
    refillEnterprisePile(state);
    state.log.push(`${player.name} buys the ${Deck.cardLabel(chosen)} from the pile for $${priceDollars.toFixed(2)}.`);
  }

  // Wiping is free -- it just discards the current 3 and deals a fresh 3.
  // It doesn't resolve the player's own card for this round by itself; the
  // caller must follow up with resolveEnterpriseBuy or resolveEnterpriseFree
  // against the new pile (a player can only wipe once per turn, so the
  // follow-up never offers "wipe" again).
  function resolveEnterpriseWipe(state) {
    state.discardPile.push(...state.enterprisePile.map((c) => ({ rank: c.rank, suit: c.suit })));
    state.enterprisePile = [];
    refillEnterprisePile(state);
    state.log.push("The Enterprise pile is wiped — 3 fresh cards dealt.");
  }

  // Skipping the pile for a free card off the top of the deck -- dealt
  // face down, since nobody (the table included) has seen it.
  function resolveEnterpriseFree(state, playerId) {
    const player = getPlayer(state, playerId);
    const card = drawCard(state);
    if (!card) {
      state.log.push(`${player.name} wanted a free card, but none are left to draw.`);
      return;
    }
    player.hand.push({ rank: card.rank, suit: card.suit, faceUp: false, isWild: false, bought: false, isBonus: false });
    state.log.push(`${player.name} takes a free card, face down.`);
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
    if (state.gameConfig.lowChicago) {
      resolveShowdownWithLowChicago(state);
      return;
    }
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

  // Follow the Queen's optional "Low Chicago" companion side pot (games.md:
  // "best spade in the hole is a separate side pot" -- documented for years
  // in this game's own description text but never actually implemented
  // anywhere, a real gap surfaced 2026-08-29). Modeled the same way
  // rules-holdem.js's hi-lo split already works in this codebase: the pot
  // is split in half between the best high hand and whoever holds the
  // lowest concealed (down-card) spade, falling back to awarding the whole
  // pot to the high hand alone if nobody has a down spade at all. Aces
  // count LOW for this purpose (games.md: "best low spade" -- the natural
  // reading of "low" here is rank, not this project's usual Ace-high
  // convention), unlike every other rank comparison in this engine. Ties on
  // either side split evenly (games.md's explicit tie-breaker for the low
  // side; splitting the high side too is this project's general "House
  // rule: split-pot ties" convention, applied here since a fresh showdown
  // path was being written anyway -- the shared completeHand() used by
  // every OTHER stud game still only supports a single high winner, a
  // separate pre-existing gap not touched by this change).
  function lowChicagoSpadeValue(card) {
    return card.rank === "A" ? 1 : Deck.RANK_VALUES[card.rank];
  }

  function resolveShowdownWithLowChicago(state) {
    const selfWild = state.gameConfig.selfDeterminedWild;
    const live = state.players.filter((p) => !p.folded);
    const highResults = live.map((p) => {
      const cards = allCards(state, p);
      const hand = selfWild ? HandEvaluator.bestHandWithSumWild(cards, selfWild.targetSum, selfWild.rankValue) : HandEvaluator.bestHand(cards);
      return { id: p.id, hand };
    });
    const bestHigh = highResults.reduce((best, r) => (best == null || HandEvaluator.isBetter(r.hand, best) ? r.hand : best), null);
    const highWinnerIds = highResults.filter((r) => HandEvaluator.compareEvaluated(r.hand, bestHigh) === 0).map((r) => r.id);

    const lowResults = live
      .map((p) => {
        const downSpades = p.hand.filter((c) => !c.faceUp && c.suit === "S");
        if (!downSpades.length) return null;
        const lowest = downSpades.reduce((best, c) => (lowChicagoSpadeValue(c) < lowChicagoSpadeValue(best) ? c : best));
        return { id: p.id, card: lowest, value: lowChicagoSpadeValue(lowest) };
      })
      .filter(Boolean);
    let lowWinnerIds = [];
    let bestLowCard = null;
    if (lowResults.length) {
      bestLowCard = lowResults.reduce((best, r) => (r.value < best.value ? r : best));
      lowWinnerIds = lowResults.filter((r) => r.value === bestLowCard.value).map((r) => r.id);
    }

    const potChips = state.pot;
    state.potAtShowdown = potChips;
    state.pot = 0;
    state.status = "complete";
    state.bettingRound = null;
    state.winnerId = highWinnerIds[0] || null; // back-compat single-winner field, same convention rules-holdem.js uses
    state.highWinnerIds = highWinnerIds;
    state.lowWinnerIds = lowWinnerIds;

    if (lowWinnerIds.length > 0) {
      const lowHalf = Math.floor(potChips / 2);
      const highHalf = potChips - lowHalf;
      payEvenSplitChips(state, highWinnerIds, highHalf);
      payEvenSplitChips(state, lowWinnerIds, lowHalf);
      state.log.push(
        `High: ${highWinnerIds.map((id) => getPlayer(state, id).name).join(", ")} with ${HandEvaluator.describe(bestHigh)}. Low Chicago: ${lowWinnerIds
          .map((id) => getPlayer(state, id).name)
          .join(", ")} with the ${Deck.cardLabel(bestLowCard.card)}. Pot: $${ChipEconomy.chipsToDollars(potChips).toFixed(2)}.`
      );
    } else {
      payEvenSplitChips(state, highWinnerIds, potChips);
      state.log.push(
        `${highWinnerIds.map((id) => getPlayer(state, id).name).join(", ")} win${highWinnerIds.length === 1 ? "s" : ""} the $${ChipEconomy.chipsToDollars(potChips).toFixed(
          2
        )} pot with ${HandEvaluator.describe(bestHigh)} — nobody held a spade in the hole for Low Chicago.`
      );
    }
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
    currentEnterprisePriceDollars,
    resolveEnterpriseBuy,
    resolveEnterpriseWipe,
    resolveEnterpriseFree,
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

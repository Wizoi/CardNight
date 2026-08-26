"use strict";

// Acey Ducey ("In Between") -- games.md's "Other" bucket. A single specific
// game: one active player at a time sees 2 shown cards and may bet up to
// the current pot that a 3rd card falls strictly between them ("passing"
// entirely is always allowed). No poker hand ranking anywhere in this game
// at all -- just a single-card rank comparison, and a house-specific rank
// order (Aces LOW, Kings HIGH) unlike every other game in this project,
// which is why rankValue() lives here instead of reusing Deck.RANK_VALUES
// (that table has Aces high, the more common convention, which this game
// explicitly overrides).
//
// Judgment call on the ending condition: games.md says "the game only ends
// once the full deck is consumed and a player wins the entire pot" -- read
// here as two DISTINCT ways a hand can end, whichever comes first: (a) some
// bet happens to exactly clear the current pot (a legal bet, since the max
// bet IS the whole pot), ending immediately with that player taking
// everything, or (b) the deck runs out first, in which case the pot
// carries forward to the next hand (same carry-forward pattern used
// throughout this project for other under-specified endings). Dealt cards
// are genuinely spent, not recycled from a discard pile -- letting the deck
// actually run dry within a single hand is what makes ending (b) reachable
// at all, matching the "full deck is consumed" wording directly.
const AceyDuceyRules = (function () {
  const RANK_ORDER = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

  function rankValue(rank) {
    return RANK_ORDER.indexOf(rank) + 1;
  }

  function getPlayer(state, playerId) {
    return state.players.find((p) => p.id === playerId);
  }

  function drawCard(state) {
    if (!state.deck.length) return null;
    return state.deck.shift();
  }

  function createHandState(players, dealerIndex, settings, carriedPotChips) {
    const deck = Deck.shuffle(Deck.buildDeck());
    const turnOrder = players
      .slice(dealerIndex + 1)
      .concat(players.slice(0, dealerIndex + 1))
      .map((p) => p.id);
    const state = {
      players,
      deck,
      pot: carriedPotChips || 0,
      anteDollars: settings.anteDollars,
      turnOrder,
      turnCursor: 0,
      status: "awaitingDeal", // -> 'awaitingBet' -> 'awaitingDeal' (next turn) | 'complete'
      shownCards: null,
      thirdCard: null,
      log: [],
      lastResult: null, // {playerId, betDollars, outcome: 'pass'|'win'|'lose'|'post'}
    };
    state.pot += BettingEngine.collectAntes(players, state.anteDollars);
    return state;
  }

  function currentActivePlayerId(state) {
    if (state.status === "complete") return null;
    return state.turnOrder[state.turnCursor];
  }

  function dealShownCards(state) {
    const a = drawCard(state);
    const b = drawCard(state);
    if (!a || !b) {
      state.status = "complete";
      state.log.push("The deck ran out — the pot carries forward to the next hand.");
      return null;
    }
    state.shownCards = [a, b];
    state.thirdCard = null;
    state.status = "awaitingBet";
    return state.shownCards;
  }

  // { lo, hi }: the two shown ranks in ascending order (Ace low, King
  // high); `gap`: how many ranks fall strictly between them (0 if adjacent
  // or a pair -- no bet can possibly win in that case).
  function gapInfo(shownCards) {
    const v1 = rankValue(shownCards[0].rank);
    const v2 = rankValue(shownCards[1].rank);
    const lo = Math.min(v1, v2);
    const hi = Math.max(v1, v2);
    return { lo, hi, gap: Math.max(0, hi - lo - 1) };
  }

  function resolveBet(state, playerId, betDollars) {
    const player = getPlayer(state, playerId);
    if (!betDollars || betDollars <= 0) {
      state.log.push(`${player.name} passes.`);
      state.lastResult = { playerId, betDollars: 0, outcome: "pass" };
      advanceTurn(state);
      return;
    }

    const third = drawCard(state);
    if (!third) {
      state.status = "complete";
      state.log.push("The deck ran out mid-bet — the pot carries forward to the next hand.");
      return;
    }
    state.thirdCard = third;
    const { lo, hi } = gapInfo(state.shownCards);
    const v3 = rankValue(third.rank);
    const outcome = v3 === lo || v3 === hi ? "post" : v3 > lo && v3 < hi ? "win" : "lose";
    const betChips = ChipEconomy.dollarsToChips(betDollars);

    if (outcome === "win") {
      const won = Math.min(betChips, state.pot);
      state.pot -= won;
      ChipEconomy.award(player.wallet, won);
      state.log.push(`${player.name} bets $${betDollars.toFixed(2)} — ${Deck.cardLabel(third)} falls between and wins $${ChipEconomy.chipsToDollars(won).toFixed(2)}.`);
      if (state.pot === 0) {
        state.status = "complete";
        state.log.push(`${player.name} takes the whole pot outright.`);
      }
    } else {
      const lossDollars = outcome === "post" ? betDollars * 2 : betDollars;
      const { paid } = ChipEconomy.pay(player.wallet, ChipEconomy.dollarsToChips(lossDollars));
      state.pot += paid;
      if (outcome === "post") {
        state.log.push(`${player.name} bets $${betDollars.toFixed(2)} — ${Deck.cardLabel(third)} hits the post! Loses double: $${lossDollars.toFixed(2)}.`);
      } else {
        state.log.push(`${player.name} bets $${betDollars.toFixed(2)} — ${Deck.cardLabel(third)} is outside the range. Loses $${lossDollars.toFixed(2)}.`);
      }
    }
    state.lastResult = { playerId, betDollars, outcome };
    if (state.status !== "complete") advanceTurn(state);
  }

  function advanceTurn(state) {
    state.turnCursor = (state.turnCursor + 1) % state.turnOrder.length;
    state.shownCards = null;
    state.thirdCard = null;
    state.status = "awaitingDeal";
  }

  return { rankValue, createHandState, currentActivePlayerId, dealShownCards, gapInfo, resolveBet, getPlayer };
})();

"use strict";

// 3-5-7 Guts: structurally different from the other three guts games (see
// rules-guts.js) in a way that doesn't fit that shared engine — it's a
// single FIXED 3-round hand (3 cards -> 5 -> 7, wild rank escalating
// 3s -> 5s -> 7s), with no early end at all ("games.md: no early-win
// rule") — even a lone remaining player just carries alone through the
// rest of the rounds rather than winning early. Antes accumulate across
// all 3 rounds into one pot, finally awarded in full at round 3's
// showdown among whoever's still in.
//
// Known simplification: games.md also documents a per-round "the lowest
// hand must match the pot and pay the highest hand" side-payment after
// EVERY round's decision — not implemented here (a genuinely ambiguous
// detail on top of an already-ambiguous game; see CLAUDE.md). This engine
// implements the dominant, unambiguous shape instead: 3 escalating rounds,
// fold-or-stay each round with no early end, one pot built from antes
// across all 3, awarded once at the very end.
const Guts357Rules = (function () {
  function getPlayer(state, playerId) {
    return state.players.find((p) => p.id === playerId);
  }

  function isCardWild(state, card) {
    return card.rank === state.wildRank;
  }

  function evaluateHand(state, player) {
    return HandEvaluator.evaluatePartial(player.hand.map((c) => ({ rank: c.rank, suit: c.suit, isWild: isCardWild(state, c) })));
  }

  // Round 3 would need 56 cards at a full 8-player table (7 x 8) -- more
  // than a deck holds -- so it trims down to 6 there, with the wild rank
  // adjusted to match (per games.md's own instruction), same "shrink the
  // last street, keep the rank in sync with the card count" pattern used
  // throughout this project.
  function round3Size(playerCount) {
    return playerCount >= 8 ? 6 : 7;
  }
  function round3WildRank(playerCount) {
    return playerCount >= 8 ? "6" : "7";
  }

  function roundSizeFor(roundIndex, playerCount) {
    if (roundIndex === 0) return 3;
    if (roundIndex === 1) return 5;
    return round3Size(playerCount);
  }
  function wildRankFor(roundIndex, playerCount) {
    if (roundIndex === 0) return "3";
    if (roundIndex === 1) return "5";
    return round3WildRank(playerCount);
  }

  // A bare pair is a much stronger signal in a 3-card hand than a 7-card
  // one -- see ai-guts-profiles.js's decideStayIn for the same idea applied
  // to the other guts games.
  function categoryShiftForRound(roundIndex) {
    if (roundIndex === 0) return 0;
    if (roundIndex === 1) return 1;
    return 2;
  }

  function createHandState(players, settings, carriedPotChips) {
    const deck = Deck.shuffle(Deck.buildDeck());
    for (const p of players) {
      p.hand = [];
      p.folded = false;
    }
    return {
      players,
      deck,
      roundIndex: 0,
      wildRank: null,
      stayDecisions: {},
      pot: carriedPotChips || 0,
      anteDollars: settings.anteDollars,
      status: "dealingRound",
      log: [],
      winnerId: null,
      noContest: false,
    };
  }

  function eligiblePlayers(state) {
    return state.players.filter((p) => !p.folded);
  }

  function dealRound(state) {
    const size = roundSizeFor(state.roundIndex, state.players.length);
    const priorSize = state.roundIndex === 0 ? 0 : roundSizeFor(state.roundIndex - 1, state.players.length);
    const increment = size - priorSize;
    const eligible = eligiblePlayers(state);
    for (const p of eligible) {
      const cards = state.deck.splice(0, increment).map((c) => ({ rank: c.rank, suit: c.suit }));
      p.hand.push(...cards);
    }
    state.wildRank = wildRankFor(state.roundIndex, state.players.length);
    state.pot += BettingEngine.collectAntes(eligible, state.anteDollars);
    state.stayDecisions = {};
    state.status = "declaring";
    state.log.push(`Round ${state.roundIndex + 1}: ${size}-card hands, ${state.wildRank}s wild.`);
  }

  function submitStayDecision(state, playerId, stayingIn) {
    state.stayDecisions[playerId] = stayingIn;
    const player = getPlayer(state, playerId);
    if (!stayingIn) {
      player.folded = true;
      state.log.push(`${player.name} folds.`);
    } else {
      state.log.push(`${player.name} stays in.`);
    }
  }

  function stayersThisRound(state) {
    return state.players.filter((p) => !p.folded && state.stayDecisions[p.id] === true);
  }

  function decideStayIn(state, player, profile) {
    const hand = evaluateHand(state, player);
    const shift = categoryShiftForRound(state.roundIndex);
    if (hand.category > HandEvaluator.CATEGORY.HIGH_CARD || shift > 0) {
      return hand.category >= profile.gutsMinCategoryToStay + shift;
    }
    if (profile.gutsMinCategoryToStay > HandEvaluator.CATEGORY.HIGH_CARD) return false;
    const topRankValue = hand.tiebreakers && hand.tiebreakers[0];
    return topRankValue >= Deck.RANK_VALUES.J;
  }

  function resolveFinalShowdown(state) {
    const stayers = stayersThisRound(state);
    let winnerId = null;
    let bestHand = null;
    for (const p of stayers) {
      const hand = evaluateHand(state, p);
      if (bestHand == null || HandEvaluator.isBetter(hand, bestHand)) {
        bestHand = hand;
        winnerId = p.id;
      }
    }
    const winner = getPlayer(state, winnerId);
    ChipEconomy.award(winner.wallet, state.pot);
    state.status = "complete";
    state.winnerId = winnerId;
    if (stayers.length === 1) {
      state.log.push(`${winner.name} was the last one remaining and wins the $${ChipEconomy.chipsToDollars(state.pot).toFixed(2)} pot outright.`);
    } else {
      state.log.push(`${winner.name} wins the $${ChipEconomy.chipsToDollars(state.pot).toFixed(2)} pot with ${HandEvaluator.describe(bestHand)}.`);
    }
    state.pot = 0;
  }

  // Called once every still-eligible player has declared for this round.
  // No early end even if only one player remains -- they just carry alone
  // into the next round, per games.md's explicit "no early-win rule."
  function advanceAfterDeclaring(state) {
    const stayers = stayersThisRound(state);
    if (stayers.length === 0) {
      state.status = "complete";
      state.winnerId = null;
      state.noContest = true;
      state.log.push("Nobody stayed in — the pot carries forward to the next 3-5-7 hand.");
      return;
    }
    if (state.roundIndex === 2) {
      resolveFinalShowdown(state);
      return;
    }
    state.roundIndex += 1;
    state.status = "dealingRound";
  }

  return {
    createHandState,
    dealRound,
    submitStayDecision,
    eligiblePlayers,
    stayersThisRound,
    decideStayIn,
    advanceAfterDeclaring,
    evaluateHand,
    getPlayer,
    isCardWild,
  };
})();

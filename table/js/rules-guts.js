"use strict";

// Shared "open-loop" Guts engine: ante only, no raise/max-bet structure at
// all (games.md's "House rule: chips & betting" — a genuinely different
// betting shape than every other family here, so BettingEngine's call/raise
// machinery doesn't apply; only its ante collection is reused). Every
// player antes and privately/simultaneously declares in or out; among
// those "in," the best hand wins the pot outright; every OTHER "in" player
// who lost must match that same pot amount to keep the escalating cycle
// going. The cycle only truly ends when exactly one player is "in" and
// wins uncontested (games.md: "Ends only when one player bets and wins
// outright") — a 2+-way showdown always just continues the cycle, however
// it comes out. Deep or Double Screw, 3 Buy 5 / 5 Buy 5, and Four-Two-Two
// are all just a `gameConfig` on top of this one engine; 3-5-7 Guts is
// structurally different enough (a fixed 3-round single hand with no early
// end at all) to get its own small engine instead — see rules-guts-357.js.
//
// gameConfig shape:
//   {
//     id, name,
//     dealSize(playerCount) -> number,
//     wildRanks: string[],                 // fixed wild ranks, e.g. Four-Two-Two's ["2"]
//     flipWildcardCount?: number,          // Deep or Double Screw's flip-up-wildcard variant
//     bonusCards?: number,                 // Four-Two-Two: cards dealt to stayers only, after the decision
//     exchangePriceDollars?: number,       // 3 Buy 5 / 5 Buy 5: optional one-card exchange, price per card
//     passing?: (playerCount) -> {left, right} | null,  // Deep or Double Screw's neighbor-passing step
//     loserPolicy: 'allNonWinners' | 'lowestOnly',
//     anteDollars?: number,                // overrides settings.anteDollars if the game's ante differs from the standard default
//   }
const GutsRules = (function () {
  function getPlayer(state, playerId) {
    return state.players.find((p) => p.id === playerId);
  }

  function isCardWild(state, card) {
    return !!(state.wildRanks && state.wildRanks.includes(card.rank));
  }

  function allCards(state, player) {
    return player.hand.map((c) => ({ rank: c.rank, suit: c.suit, isWild: isCardWild(state, c) }));
  }

  // Works for any hand size (3 up to 7 across these games) — evaluatePartial
  // already dispatches to the full best-5-of-N search at >=5 cards, or a
  // groups-only comparison below that.
  function evaluateHand(state, player) {
    return HandEvaluator.evaluatePartial(allCards(state, player));
  }

  function createRoundState(players, settings, gameConfig, carriedPotChips) {
    const deck = Deck.shuffle(Deck.buildDeck());
    const dealSize = gameConfig.dealSize(players.length);
    let cursor = 0;
    for (const p of players) {
      p.hand = deck.slice(cursor, cursor + dealSize).map((c) => ({ rank: c.rank, suit: c.suit }));
      cursor += dealSize;
      p.folded = false;
    }

    let wildRanks = (gameConfig.wildRanks || []).slice();
    let flippedWildcards = [];
    if (gameConfig.flipWildcardCount) {
      flippedWildcards = deck.slice(cursor, cursor + gameConfig.flipWildcardCount).map((c) => ({ rank: c.rank, suit: c.suit }));
      cursor += gameConfig.flipWildcardCount;
      wildRanks = wildRanks.concat(flippedWildcards.map((c) => c.rank));
    }

    const state = {
      players,
      gameConfig,
      deck: deck.slice(cursor),
      wildRanks,
      flippedWildcards,
      stayDecisions: {},
      pot: carriedPotChips || 0,
      anteDollars: gameConfig.anteDollars || settings.anteDollars,
      status: "declaring",
      log: [],
      winnerId: null,
      loserIds: [],
      potAtShowdown: 0,
      noContest: false,
      cycleComplete: false,
    };
    state.pot += BettingEngine.collectAntes(players, state.anteDollars);
    if (flippedWildcards.length) {
      state.log.push(`Flipped wildcard${flippedWildcards.length > 1 ? "s" : ""}: ${flippedWildcards.map((c) => Deck.cardLabel(c)).join(", ")}.`);
    }

    if (gameConfig.passing) {
      const counts = gameConfig.passing(players.length);
      if (counts) resolvePassing(state, counts.left, counts.right);
    }
    return state;
  }

  // Naive but consistent heuristic applied uniformly to every seat (human
  // included, not just AI) — each player passes their own lowest-ranked
  // non-wild cards left/right, simultaneously, then receives from both
  // neighbors. A real player would judge this by what actually helps their
  // OWN hand rather than a blind rank cutoff, but adding a card-picker UI
  // for this one sub-mechanic is disproportionate scope for how niche it
  // is — a documented simplification, not a modeled player decision.
  function resolvePassing(state, leftCount, rightCount) {
    const n = state.players.length;
    const outgoing = state.players.map((p) => {
      const sorted = p.hand
        .slice()
        .sort((a, b) => (isCardWild(state, a) ? 99 : Deck.RANK_VALUES[a.rank]) - (isCardWild(state, b) ? 99 : Deck.RANK_VALUES[b.rank]));
      return { toLeft: sorted.slice(0, leftCount), toRight: sorted.slice(leftCount, leftCount + rightCount) };
    });
    state.players.forEach((p, i) => {
      const passed = outgoing[i].toLeft.concat(outgoing[i].toRight);
      p.hand = p.hand.filter((c) => !passed.includes(c));
    });
    state.players.forEach((p, i) => {
      const leftIdx = (i - 1 + n) % n;
      const rightIdx = (i + 1) % n;
      state.players[leftIdx].hand.push(...outgoing[i].toLeft);
      state.players[rightIdx].hand.push(...outgoing[i].toRight);
    });
    state.log.push(`Cards passed: ${leftCount} left, ${rightCount} right, all around the table.`);
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

  function allDecided(state) {
    return state.players.every((p) => state.stayDecisions[p.id] != null);
  }

  function inPlayers(state) {
    return state.players.filter((p) => state.stayDecisions[p.id] === true);
  }

  // Four-Two-Two: stayers get 2 more cards, dealt after the decision, before
  // showdown.
  function dealBonusCards(state, count) {
    for (const p of inPlayers(state)) {
      const cards = state.deck.splice(0, count).map((c) => ({ rank: c.rank, suit: c.suit }));
      p.hand.push(...cards);
    }
    state.log.push(`Everyone who stayed in draws ${count} more card(s).`);
  }

  // 3 Buy 5 / 5 Buy 5's "buy/exchange a card" mechanic: discard one card,
  // draw a replacement, at a dealer-set price (games.md doesn't specify a
  // number — $1/card here is a judgment call, not a documented rule).
  function buyExchange(state, playerId, cardIndex) {
    const player = getPlayer(state, playerId);
    const priceDollars = state.gameConfig.exchangePriceDollars;
    if (player.wallet.chips < ChipEconomy.dollarsToChips(priceDollars)) return false;
    const replacement = state.deck.shift();
    if (!replacement) return false;
    const { paid } = ChipEconomy.pay(player.wallet, ChipEconomy.dollarsToChips(priceDollars));
    state.pot += paid;
    player.hand[cardIndex] = { rank: replacement.rank, suit: replacement.suit };
    state.log.push(`${player.name} exchanges a card for $${priceDollars.toFixed(2)}.`);
    return true;
  }

  function resolveShowdown(state) {
    const stayers = inPlayers(state);
    state.potAtShowdown = state.pot;

    if (stayers.length === 0) {
      state.status = "complete";
      state.winnerId = null;
      state.loserIds = [];
      state.noContest = true;
      state.cycleComplete = false;
      state.log.push("Nobody stayed in — the pot carries forward untouched.");
      return;
    }

    if (stayers.length === 1) {
      const winner = stayers[0];
      ChipEconomy.award(winner.wallet, state.pot);
      state.pot = 0;
      state.status = "complete";
      state.winnerId = winner.id;
      state.loserIds = [];
      state.cycleComplete = true;
      state.log.push(`${winner.name} was the only one in and wins the $${ChipEconomy.chipsToDollars(state.potAtShowdown).toFixed(2)} pot outright.`);
      return;
    }

    let bestHand = null;
    let winnerId = null;
    let worstHand = null;
    let worstId = null;
    for (const p of stayers) {
      const hand = evaluateHand(state, p);
      if (bestHand == null || HandEvaluator.isBetter(hand, bestHand)) {
        bestHand = hand;
        winnerId = p.id;
      }
      if (worstHand == null || HandEvaluator.isBetter(worstHand, hand)) {
        worstHand = hand;
        worstId = p.id;
      }
    }
    const winner = getPlayer(state, winnerId);
    ChipEconomy.award(winner.wallet, state.pot);
    state.pot = 0;
    state.loserIds = state.gameConfig.loserPolicy === "lowestOnly" ? [worstId] : stayers.filter((p) => p.id !== winnerId).map((p) => p.id);
    state.status = "complete";
    state.winnerId = winnerId;
    state.cycleComplete = false;
    state.log.push(`${winner.name} wins the $${ChipEconomy.chipsToDollars(state.potAtShowdown).toFixed(2)} pot with ${HandEvaluator.describe(bestHand)}.`);
  }

  // Each loser independently matches the just-contested pot amount (not a
  // split share) to keep the cycle going — this is what makes the pot
  // escalate hand over hand. Capped at each loser's wallet, same all-in-short
  // pattern ChipEconomy uses everywhere else in the project.
  function collectLoserMatches(state) {
    if (state.noContest) return state.potAtShowdown;
    let carried = 0;
    for (const loserId of state.loserIds) {
      const loser = getPlayer(state, loserId);
      const { paid } = ChipEconomy.pay(loser.wallet, state.potAtShowdown);
      carried += paid;
      state.log.push(`${loser.name} matches the pot ($${ChipEconomy.chipsToDollars(state.potAtShowdown).toFixed(2)}) to keep the game going.`);
    }
    return carried;
  }

  return {
    createRoundState,
    submitStayDecision,
    allDecided,
    inPlayers,
    evaluateHand,
    dealBonusCards,
    buyExchange,
    resolveShowdown,
    collectLoserMatches,
    getPlayer,
    isCardWild,
  };
})();

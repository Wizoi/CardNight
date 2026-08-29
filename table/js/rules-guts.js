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
//     lowestCardWild?: boolean,            // Deep or Double Screw: each player's OWN lowest-ranked card(s) are wild
//     flipWildcardCount?: number,          // Deep or Double Screw's optional additional flip-up wildcard(s), on top of lowestCardWild
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

  // `player` is optional -- only needed to check lowestCardWild, which is
  // per-player (each player's own hand has its own lowest rank), unlike
  // wildRanks/flip-ups which are fixed, table-wide ranks. Callers that don't
  // have a player in scope (e.g. the passing heuristic, which runs before
  // any player's final post-pass hand -- and therefore final lowest card --
  // is even determined) just get the fixed-rank check.
  function isCardWild(state, card, player) {
    if (state.wildRanks && state.wildRanks.includes(card.rank)) return true;
    if (player && state.gameConfig.lowestCardWild) {
      const lowValue = playerLowestValue(player);
      if (lowValue != null && Deck.RANK_VALUES[card.rank] === lowValue) return true;
    }
    return false;
  }

  // A tie for lowest rank (e.g. two 6s) makes every card of that rank wild,
  // not just one arbitrary instance -- consistent with how every other
  // wildcard rule in this project (bought 3s/9s, a fixed wildRanks list)
  // treats wildness as a property of a RANK, never a single card object.
  function playerLowestValue(player) {
    if (!player.hand.length) return null;
    return Math.min(...player.hand.map((c) => Deck.RANK_VALUES[c.rank]));
  }

  function allCards(state, player) {
    return player.hand.map((c) => ({ rank: c.rank, suit: c.suit, isWild: isCardWild(state, c, player) }));
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

    // Deep or Double Screw's optional dealer's-choice dummy hand: another
    // full hand's worth of cards, dealt face down, belonging to nobody --
    // games.md: "any player who loses (including losing against a dummy
    // hand) must match the lost pot." Only actually dealt when it fits
    // within one 52-card deck alongside every real player's hand -- the
    // same per-player-count check the real deal size already makes, just
    // one hand further (deck.length is still the full undealt 52/54+ here,
    // since deck itself is only ever read via non-mutating .slice()). A
    // dealer choosing this at a table size where it can't fit is a silent
    // no-op here -- the picker UI already warns "won't fit at this size"
    // before the choice is even made (see game-registry.js).
    let dummyHand = null;
    if (gameConfig.dummyHandEnabled && (players.length + 1) * dealSize <= deck.length) {
      dummyHand = { id: "__dummy__", name: "the dummy hand", hand: deck.slice(cursor, cursor + dealSize).map((c) => ({ rank: c.rank, suit: c.suit })) };
      cursor += dealSize;
    }

    const passCounts = gameConfig.passing ? gameConfig.passing(players.length) : null;

    const state = {
      players,
      gameConfig,
      deck: deck.slice(cursor),
      wildRanks,
      flippedWildcards,
      dummyHand,
      passCounts,
      passSelections: {},
      stayDecisions: {},
      pot: carriedPotChips || 0,
      anteDollars: gameConfig.anteDollars || settings.anteDollars,
      status: passCounts ? "passing" : "declaring",
      log: [],
      winnerId: null,
      loserIds: [],
      potAtShowdown: 0,
      noContest: false,
      dummyBeatEveryone: false,
      cycleComplete: false,
    };
    state.pot += BettingEngine.collectAntes(players, state.anteDollars);
    state.log.push(`Ante: $${state.anteDollars.toFixed(2)} each from ${players.length} players — pot starts at $${ChipEconomy.chipsToDollars(state.pot).toFixed(2)}.`);
    if (flippedWildcards.length) {
      state.log.push(`Flipped wildcard${flippedWildcards.length > 1 ? "s" : ""}: ${flippedWildcards.map((c) => Deck.cardLabel(c)).join(", ")}.`);
    }
    if (dummyHand) {
      state.log.push("A dummy hand is in play — anyone who stays in has to beat it too.");
    }
    return state;
  }

  // Deep or Double Screw's neighbor-passing (rebuilt 2026-08-25 to be a real
  // player choice, not an automated heuristic): each player privately picks
  // which of their own cards go left/right (`submitPassSelection`); once
  // everyone's in, `resolvePassingFromSelections` redistributes all of them
  // simultaneously. `defaultPassSelection` is only the AI's OWN decision
  // function now (a plain lowest-non-wild-first heuristic, unchanged from
  // the old automatic behavior) — the human instead picks via the UI.
  //
  // Only fixed-rank wildness (wildRanks -- e.g. a flip-up wildcard) is
  // considered here, not lowestCardWild: a player's final lowest card can't
  // be known until AFTER passing resolves, so there's no meaningful "avoid
  // passing away my wildcard" heuristic to apply at this point -- whatever
  // ends up lowest in the post-pass hand becomes wild regardless.
  function defaultPassSelection(state, player, leftCount, rightCount) {
    const sorted = player.hand
      .map((c, i) => ({ c, i }))
      .sort((a, b) => (isCardWild(state, a.c) ? 99 : Deck.RANK_VALUES[a.c.rank]) - (isCardWild(state, b.c) ? 99 : Deck.RANK_VALUES[b.c.rank]));
    return {
      toLeftIdx: sorted.slice(0, leftCount).map((x) => x.i),
      toRightIdx: sorted.slice(leftCount, leftCount + rightCount).map((x) => x.i),
    };
  }

  function submitPassSelection(state, playerId, toLeftIdx, toRightIdx) {
    const player = getPlayer(state, playerId);
    const toLeft = toLeftIdx.map((i) => player.hand[i]);
    const toRight = toRightIdx.map((i) => player.hand[i]);
    state.passSelections[playerId] = { toLeft, toRight };
    state.log.push(`${player.name} passes ${toLeft.length} card(s) left, ${toRight.length} right.`);
  }

  function allPassSelectionsSubmitted(state) {
    return state.players.every((p) => state.passSelections[p.id] != null);
  }

  // Two passes, same as the original heuristic: remove everyone's outgoing
  // cards first, then distribute -- so a card leaving one hand can't be
  // read back out of its ORIGINAL owner's hand as still present partway
  // through (the removal and the distribution both key off the selections
  // captured at submission time, not the live, already-mutated hand).
  function resolvePassingFromSelections(state) {
    const n = state.players.length;
    state.players.forEach((p) => {
      const sel = state.passSelections[p.id];
      p.hand = p.hand.filter((c) => !sel.toLeft.includes(c) && !sel.toRight.includes(c));
    });
    state.players.forEach((p, i) => {
      const sel = state.passSelections[p.id];
      const leftIdx = (i - 1 + n) % n;
      const rightIdx = (i + 1) % n;
      state.players[leftIdx].hand.push(...sel.toLeft);
      state.players[rightIdx].hand.push(...sel.toRight);
    });
    state.status = "declaring";
    state.log.push(`Cards passed: ${state.passCounts.left} left, ${state.passCounts.right} right, all around the table.`);
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

    const dummyHand = state.dummyHand ? evaluateHand(state, state.dummyHand) : null;

    if (stayers.length === 1) {
      const winner = stayers[0];
      const winnerHand = evaluateHand(state, winner);
      if (dummyHand && HandEvaluator.isBetter(dummyHand, winnerHand)) {
        // Being the only one in isn't an automatic win with a dummy hand
        // on the table -- still has to beat it, same as games.md's
        // "losing against a dummy hand" framing. A loss like any other:
        // matches the pot, cycle continues.
        state.status = "complete";
        state.winnerId = null;
        state.loserIds = [winner.id];
        state.cycleComplete = false;
        state.dummyBeatEveryone = true;
        state.log.push(`${winner.name} was the only one in, but the dummy hand (${HandEvaluator.describe(dummyHand)}) beats them — must match the pot to keep the game going.`);
        return;
      }
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

    if (dummyHand && HandEvaluator.isBetter(dummyHand, bestHand)) {
      // Even the best real hand loses to the dummy -- nobody wins the
      // pot, and EVERY stayer (not just the usual all-but-winner) has
      // lost and must match it to keep the cycle going.
      state.loserIds = stayers.map((p) => p.id);
      state.status = "complete";
      state.winnerId = null;
      state.cycleComplete = false;
      state.dummyBeatEveryone = true;
      state.log.push(`The dummy hand (${HandEvaluator.describe(dummyHand)}) beats everyone who stayed in — no winner; every stayer must match the pot.`);
      return;
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
  // pattern ChipEconomy uses everywhere else in the project. Four-Two-Two's
  // optional "max loss per deal" (gameConfig.maxLossPerDealDollars) caps
  // what a loser owes below the full pot match too, if set -- a genuine
  // reduction in what gets carried forward, not just a wallet-affordability
  // limit like the ChipEconomy.pay cap already provides.
  function collectLoserMatches(state) {
    if (state.noContest) return state.potAtShowdown;
    const capChips = state.gameConfig.maxLossPerDealDollars
      ? Math.min(state.potAtShowdown, ChipEconomy.dollarsToChips(state.gameConfig.maxLossPerDealDollars))
      : state.potAtShowdown;
    let carried = 0;
    for (const loserId of state.loserIds) {
      const loser = getPlayer(state, loserId);
      const { paid } = ChipEconomy.pay(loser.wallet, capChips);
      carried += paid;
      state.log.push(`${loser.name} matches ${capChips < state.potAtShowdown ? "the max loss" : "the pot"} ($${ChipEconomy.chipsToDollars(capChips).toFixed(2)}) to keep the game going.`);
    }
    return carried;
  }

  return {
    createRoundState,
    defaultPassSelection,
    submitPassSelection,
    allPassSelectionsSubmitted,
    resolvePassingFromSelections,
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

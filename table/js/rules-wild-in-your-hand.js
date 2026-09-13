"use strict";

// Wild in Your Hand -- games.md's newest Guts entry, and a genuinely different
// shape from the rest of the family (see rules-guts.js's own "ante only, no
// raise/max-bet structure at all" framing -- this game breaks that). After
// the deal and a Deep-or-Double-Screw-style passing step, a shared 6-card
// pyramid (rows of 1, 2, 3) is revealed one row at a time, each followed by
// a REAL flat call-or-fold betting round (50c, matching the ante -- no
// raising at all, so this reuses none of BettingEngine's round machinery,
// just plain per-player pay-or-fold bookkeeping). Once all 3 rows/rounds are
// done, everyone still in simultaneously declares in or out, exactly like
// every other Guts game; among those "in," the best hand wins the whole pot
// outright. The escalation is gentler than the rest of the family too: a
// declare-stage loser only antes again for the next hand (not the whole
// pot) to keep the cycle going -- see collectLoserAntes below.
//
// gameConfig shape: { id, name, jokerCount?: number (default 2) }
const WildInYourHandRules = (function () {
  const PYRAMID_ROW_SIZES = [1, 2, 3];

  function getPlayer(state, playerId) {
    return state.players.find((p) => p.id === playerId);
  }

  function activePlayers(state) {
    return state.players.filter((p) => !p.folded);
  }

  function activeCount(state) {
    return activePlayers(state).length;
  }

  // A revealed pyramid card's own RANK is wild for anyone holding that rank
  // (it never joins anyone's hand) -- a Joker in the deck is always wild
  // wherever it lands, same as every other Joker-eligible game here.
  function isCardWild(state, card) {
    return card.rank === "JOKER" || state.wildRanks.includes(card.rank);
  }

  // A revealed communal Joker (see revealNextPyramidRow) is a genuine extra
  // wild card every player may use -- appended as a shared, ownerless card
  // to each player's own evaluation pool rather than actually dealt to
  // anyone, since a Joker has no rank for others to match the normal way.
  function allCards(state, player) {
    const cards = player.hand.map((c) => ({ rank: c.rank, suit: c.suit, isWild: isCardWild(state, c) }));
    if (state.communityJokerRevealed) cards.push({ rank: "JOKER", suit: null, isWild: true });
    return cards;
  }

  function evaluateHand(state, player) {
    return HandEvaluator.evaluatePartial(allCards(state, player));
  }

  // 7 cards fits one deck (54, with 2 Jokers) alongside the 6-card pyramid
  // up to 6 players; trimmed further at 7-8 so the deal never runs the deck
  // dry -- a judgment call, since games.md doesn't specify scaling (every
  // other multi-card Guts game in this project scales the same way).
  function dealSizeFor(playerCount) {
    if (playerCount <= 6) return 7;
    if (playerCount === 7) return 6;
    return 5;
  }

  function passCountsFor(dealSize) {
    return dealSize >= 7 ? { left: 2, right: 1 } : { left: 1, right: 1 };
  }

  function createRoundState(players, settings, gameConfig, carriedPotChips) {
    const jokerCount = gameConfig.jokerCount != null ? gameConfig.jokerCount : 2;
    const deck = Deck.shuffle(Deck.buildDeck(jokerCount));
    const dealSize = dealSizeFor(players.length);
    let cursor = 0;
    for (const p of players) {
      p.hand = deck.slice(cursor, cursor + dealSize).map((c) => ({ rank: c.rank, suit: c.suit }));
      cursor += dealSize;
      p.folded = false;
    }
    const pyramid = PYRAMID_ROW_SIZES.map((size) => {
      const cards = deck.slice(cursor, cursor + size).map((c) => ({ rank: c.rank, suit: c.suit }));
      cursor += size;
      return cards;
    });

    const anteDollars = gameConfig.anteDollars || settings.anteDollars;
    const state = {
      players,
      gameConfig,
      deck: deck.slice(cursor),
      discardPile: [],
      pyramid,
      pyramidRevealed: [false, false, false],
      wildRanks: [],
      communityJokerRevealed: false,
      passCounts: passCountsFor(dealSize),
      passSelections: {},
      rowIndex: -1, // -1 = still passing; 0/1/2 = that row's betting is open
      rowDecisions: {},
      stayDecisions: {},
      pot: carriedPotChips || 0,
      anteDollars,
      rowBetDollars: anteDollars, // "match the ante" -- flat, no raising
      status: "passing",
      log: [],
      winnerIds: [],
      winnerId: null,
      loserIds: [],
      potAtShowdown: 0,
      noContest: false,
      cycleComplete: false,
    };
    state.pot += BettingEngine.collectAntes(players, anteDollars);
    state.log.push(`Ante: $${anteDollars.toFixed(2)} each from ${players.length} players — pot starts at $${ChipEconomy.chipsToDollars(state.pot).toFixed(2)}.`);
    return state;
  }

  // --- Passing (identical shape to Deep or Double Screw's, own copy since
  // this engine's state shape and escalation semantics diverge too much
  // elsewhere to share rules-guts.js's version directly) ---

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
    state.log.push(`Cards passed: ${state.passCounts.left} left, ${state.passCounts.right} right, all around the table.`);
    revealNextPyramidRow(state);
  }

  // --- The pyramid + 3 flat call-or-fold rounds ---

  function revealNextPyramidRow(state) {
    state.rowIndex += 1;
    const row = state.pyramid[state.rowIndex];
    state.pyramidRevealed[state.rowIndex] = true;
    const newRanks = [];
    for (const card of row) {
      if (card.rank === "JOKER") {
        state.communityJokerRevealed = true;
      } else if (!state.wildRanks.includes(card.rank)) {
        state.wildRanks.push(card.rank);
        newRanks.push(card.rank);
      }
    }
    const cardLabels = row.map((c) => Deck.cardLabel(c)).join(", ");
    state.log.push(`Row ${state.rowIndex + 1} revealed: ${cardLabels}.`);
    if (newRanks.length) state.log.push(`${newRanks.join(", ")}s are now wild for anyone holding one.`);
    if (row.some((c) => c.rank === "JOKER")) state.log.push("A Joker is revealed on the table — everyone may use it as an extra wild card.");
    state.rowDecisions = {};
    state.status = "rowBetting";
  }

  function currentRowDecisionPlayerId(state) {
    if (state.status !== "rowBetting") return null;
    const p = state.players.find((pl) => !pl.folded && state.rowDecisions[pl.id] == null);
    return p ? p.id : null;
  }

  function submitRowDecision(state, playerId, payingIn) {
    const player = getPlayer(state, playerId);
    state.rowDecisions[playerId] = payingIn;
    if (!payingIn) {
      player.folded = true;
      state.log.push(`${player.name} folds.`);
    } else {
      const { paid } = ChipEconomy.pay(player.wallet, ChipEconomy.dollarsToChips(state.rowBetDollars));
      state.pot += paid;
      state.log.push(`${player.name} puts in $${state.rowBetDollars.toFixed(2)} to stay in.`);
    }
    checkForInstantWin(state);
  }

  function allRowDecided(state) {
    return state.players.every((p) => p.folded || state.rowDecisions[p.id] != null);
  }

  // Called once every still-active player has decided this row.
  function advanceAfterRow(state) {
    if (state.status === "complete") return;
    if (state.rowIndex >= PYRAMID_ROW_SIZES.length - 1) {
      state.status = "declaring";
      state.stayDecisions = {};
    } else {
      revealNextPyramidRow(state);
    }
  }

  // --- Declare (identical shape to every other Guts game's) ---

  function submitStayDecision(state, playerId, stayingIn) {
    state.stayDecisions[playerId] = stayingIn;
    const player = getPlayer(state, playerId);
    if (!stayingIn) {
      player.folded = true;
      state.log.push(`${player.name} folds.`);
    } else {
      state.log.push(`${player.name} stays in.`);
    }
    checkForInstantWin(state);
  }

  function allDeclared(state) {
    return state.players.every((p) => p.folded || state.stayDecisions[p.id] != null);
  }

  function inPlayers(state) {
    return state.players.filter((p) => state.stayDecisions[p.id] === true);
  }

  // Same "only one active player left" shortcut every BettingEngine-driven
  // family already applies -- fires the instant a fold (during row betting
  // OR the declare) leaves at most one player standing, skipping whatever
  // rows/declare would otherwise still be ahead of them.
  function checkForInstantWin(state) {
    if (state.status === "complete") return;
    const active = activePlayers(state);
    if (active.length > 1) return;
    state.potAtShowdown = state.pot;
    state.status = "complete";
    state.cycleComplete = false;
    if (active.length === 1) {
      const winner = active[0];
      ChipEconomy.award(winner.wallet, state.pot);
      state.pot = 0;
      state.winnerIds = [winner.id];
      state.winnerId = winner.id;
      state.loserIds = [];
      state.cycleComplete = true;
      state.log.push(`${winner.name} is the only one left and wins the $${ChipEconomy.chipsToDollars(state.potAtShowdown).toFixed(2)} pot outright.`);
    } else {
      state.winnerIds = [];
      state.winnerId = null;
      state.loserIds = [];
      state.noContest = true;
      state.log.push("Everybody folded — the pot carries forward untouched.");
    }
  }

  // Splits evenly among exact ties (games.md's standard split-pot-ties
  // default) -- a genuine improvement over rules-guts.js's own showdown,
  // which doesn't split ties among "in" players; built correctly from the
  // start here rather than propagating that latent gap into new code.
  function resolveShowdown(state) {
    const stayers = inPlayers(state);
    state.potAtShowdown = state.pot;

    if (stayers.length === 0) {
      state.status = "complete";
      state.winnerIds = [];
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
      state.winnerIds = [winner.id];
      state.winnerId = winner.id;
      state.loserIds = [];
      state.cycleComplete = true;
      state.log.push(`${winner.name} was the only one in and wins the $${ChipEconomy.chipsToDollars(state.potAtShowdown).toFixed(2)} pot outright.`);
      return;
    }

    // Find the best hand, then a second pass picks every EXACT tie against
    // it (isBetter alone only tells us strictly-better, not equal) -- same
    // convention Midnight Baseball's own split-pot fix uses.
    let bestHand = null;
    for (const p of stayers) {
      const hand = evaluateHand(state, p);
      if (bestHand == null || HandEvaluator.isBetter(hand, bestHand)) bestHand = hand;
    }
    const winnerIds = stayers
      .filter((p) => {
        const hand = evaluateHand(state, p);
        return !HandEvaluator.isBetter(bestHand, hand) && !HandEvaluator.isBetter(hand, bestHand);
      })
      .map((p) => p.id);

    const winnerNames = winnerIds.map((id) => getPlayer(state, id).name);
    const share = Math.floor(state.pot / winnerIds.length);
    const remainder = state.pot - share * winnerIds.length;
    winnerIds.forEach((id, i) => {
      ChipEconomy.award(getPlayer(state, id).wallet, share + (i < remainder ? 1 : 0));
    });
    state.pot = 0;
    state.status = "complete";
    state.winnerIds = winnerIds;
    state.winnerId = winnerIds[0];
    state.loserIds = stayers.filter((p) => !winnerIds.includes(p.id)).map((p) => p.id);
    state.cycleComplete = false;
    const verb = winnerIds.length > 1 ? "win" : "wins";
    state.log.push(`${winnerNames.join(", ")} ${verb} the $${ChipEconomy.chipsToDollars(state.potAtShowdown).toFixed(2)} pot with ${HandEvaluator.describe(bestHand)}.`);
  }

  // A declare-stage loser only antes again for the next hand -- NOT the
  // whole pot, unlike every other Guts game's collectLoserMatches. Row-
  // betting folders and declare-folders are simply done for this whole
  // deal (no further obligation); the WHOLE roster re-antes fresh on the
  // very next hand regardless (createRoundState resets `folded` for
  // everyone), so there's no separate "who's still in the cycle" state to
  // track between hands here either.
  function collectLoserAntes(state) {
    if (state.noContest) return state.potAtShowdown;
    const anteChips = ChipEconomy.dollarsToChips(state.anteDollars);
    let carried = 0;
    for (const loserId of state.loserIds) {
      const loser = getPlayer(state, loserId);
      const { paid } = ChipEconomy.pay(loser.wallet, anteChips);
      carried += paid;
      state.log.push(`${loser.name} antes $${state.anteDollars.toFixed(2)} again to keep the game going.`);
    }
    return carried;
  }

  return {
    createRoundState,
    defaultPassSelection,
    submitPassSelection,
    allPassSelectionsSubmitted,
    resolvePassingFromSelections,
    currentRowDecisionPlayerId,
    submitRowDecision,
    allRowDecided,
    advanceAfterRow,
    submitStayDecision,
    allDeclared,
    inPlayers,
    resolveShowdown,
    collectLoserAntes,
    evaluateHand,
    getPlayer,
    isCardWild,
  };
})();

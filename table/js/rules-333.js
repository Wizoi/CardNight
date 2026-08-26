"use strict";

// 3-33 (333) -- games.md's "Other" bucket. A single specific game, not a
// shared family, so unlike rules-press-your-luck.js there's no separate
// game-configs file; the game's own numbers (targets 3/33, matching its
// name -- the minimum possible 3-card sum with 3 aces-low is exactly 3, and
// the maximum with 3 aces-high is exactly 33) live right here.
//
// Genuinely the only game in this project with ZERO live player decisions
// once the ante is paid: the dealer flips a community card each of 5
// rounds, any matching-rank card in a hand is auto-discarded, and the hand
// plays itself out mechanically from there. No ai-333-profiles.js exists
// because there's nothing for an AI to decide -- the human's only agency
// is pacing (clicking to reveal the next card).
//
// Judgment call, consistent with 5.5-21/7-27 (this game's target-sum
// siblings): no "Betting:" field is stated in games.md for this game
// either, so it's treated as ante-only, same as its siblings -- no
// raise/call/fold layer.
const Rules333 = (function () {
  const LOW_TARGET = 3;
  const HIGH_TARGET = 33;
  const TOTAL_ROUNDS = 5;

  function cardValue(card) {
    if (card.rank === "A") return [1, 11];
    if (card.rank === "J" || card.rank === "Q" || card.rank === "K") return [10];
    return [Number(card.rank)];
  }

  function getPlayer(state, playerId) {
    return state.players.find((p) => p.id === playerId);
  }

  function drawCard(state) {
    const { card, reshuffled } = Deck.drawWithReshuffle(state);
    if (reshuffled) state.log.push("The draw pile ran out — reshuffling discards back in.");
    return card;
  }

  function payEvenSplit(state, winnerIds, totalChips) {
    if (!winnerIds.length || totalChips <= 0) return;
    const share = Math.floor(totalChips / winnerIds.length);
    const remainder = totalChips - share * winnerIds.length;
    winnerIds.forEach((id, i) => {
      ChipEconomy.award(getPlayer(state, id).wallet, share + (i < remainder ? 1 : 0));
    });
  }

  function createHandState(players, dealerIndex, settings, carriedPotChips) {
    const deck = Deck.shuffle(Deck.buildDeck());
    for (const p of players) p.hand = [];
    let cursor = 0;
    for (const p of players) {
      p.hand = deck.slice(cursor, cursor + 3).map((c) => ({ rank: c.rank, suit: c.suit }));
      cursor += 3;
    }
    const state = {
      players,
      deck: deck.slice(cursor),
      discardPile: [],
      pot: carriedPotChips || 0,
      anteDollars: settings.anteDollars,
      roundIndex: 0,
      matchedRanksSoFar: [],
      communityCards: [],
      status: "revealing",
      log: [],
      results: null,
      outrightWinnerIds: null,
    };
    state.pot += BettingEngine.collectAntes(players, state.anteDollars);

    const ultimaIds = players.filter((p) => p.hand.length === 3 && p.hand.every((c) => c.rank === "A")).map((p) => p.id);
    if (ultimaIds.length) {
      payEvenSplit(state, ultimaIds, state.pot);
      state.status = "complete";
      state.outrightWinnerIds = ultimaIds;
      state.log.push(`Ultima! ${ultimaIds.map((id) => getPlayer(state, id).name).join(", ")} dealt three Aces — takes the whole pot outright.`);
      state.pot = 0;
    }
    return state;
  }

  function isRevealDone(state) {
    return state.status !== "revealing";
  }

  // Flips one community card, redrawing (without consuming an extra
  // round) if its rank already came up and was discarded in an earlier
  // round -- games.md: a repeat rank would have nothing left to match
  // meaningfully, so it's set aside and a fresh one drawn instead.
  function revealNextCommunityCard(state) {
    if (state.status !== "revealing") return null;
    let card = null;
    let guard = 0;
    do {
      card = drawCard(state);
      guard += 1;
    } while (card && state.matchedRanksSoFar.includes(card.rank) && guard < 60);
    if (!card) {
      // Deck exhausted before 5 fresh ranks came up -- vanishingly rare at
      // realistic table sizes (max 8 players x 3 cards = 24 dealt), but
      // handled rather than crashing: go straight to showdown with
      // whatever rounds did happen.
      state.status = "complete";
      resolveShowdown(state);
      return null;
    }
    state.communityCards.push(card);
    state.matchedRanksSoFar.push(card.rank);
    state.roundIndex += 1;

    const emptiedIds = [];
    for (const p of state.players) {
      const before = p.hand.length;
      p.hand = p.hand.filter((c) => c.rank !== card.rank);
      if (p.hand.length < before) {
        state.log.push(`${p.name} discards the matching ${card.rank}.`);
        if (p.hand.length === 0) emptiedIds.push(p.id);
      }
    }

    if (emptiedIds.length) {
      payEvenSplit(state, emptiedIds, state.pot);
      state.status = "complete";
      state.outrightWinnerIds = emptiedIds;
      state.log.push(`${emptiedIds.map((id) => getPlayer(state, id).name).join(", ")} discarded their last card — takes the whole pot outright.`);
      state.pot = 0;
      return { card, emptiedIds };
    }
    if (state.roundIndex >= TOTAL_ROUNDS) {
      state.status = "complete";
      resolveShowdown(state);
    }
    return { card, emptiedIds };
  }

  function handSumResult(state, player, target) {
    return TargetSumEvaluator.bestForTarget(player.hand, cardValue, target, "noBust");
  }

  function pickWinners(state, results) {
    const bestDistance = Math.min(...results.map((r) => r.result.distance));
    return results.filter((r) => r.result.distance === bestDistance).map((r) => r.id);
  }

  // Returns unawarded chips (nobody-qualifies edge case, same
  // carry-forward pattern used throughout this project) -- not expected in
  // practice here since 'noBust' means every remaining player always has
  // SOME achievable sum for both sides.
  function resolveShowdown(state) {
    const lowResults = state.players.filter((p) => p.hand.length > 0).map((p) => ({ id: p.id, result: handSumResult(state, p, LOW_TARGET) }));
    const highResults = state.players.filter((p) => p.hand.length > 0).map((p) => ({ id: p.id, result: handSumResult(state, p, HIGH_TARGET) }));
    const lowWinners = lowResults.length ? pickWinners(state, lowResults) : [];
    const highWinners = highResults.length ? pickWinners(state, highResults) : [];

    const lowShareChips = Math.floor(state.pot / 2);
    const highShareChips = state.pot - lowShareChips;
    let carried = 0;
    if (lowWinners.length) {
      payEvenSplit(state, lowWinners, lowShareChips);
      state.log.push(`${lowWinners.map((id) => getPlayer(state, id).name).join(", ")} win the low half (closest to ${LOW_TARGET}).`);
    } else {
      carried += lowShareChips;
    }
    if (highWinners.length) {
      payEvenSplit(state, highWinners, highShareChips);
      state.log.push(`${highWinners.map((id) => getPlayer(state, id).name).join(", ")} win the high half (closest to ${HIGH_TARGET}).`);
    } else {
      carried += highShareChips;
    }
    state.results = { lowWinners, highWinners, lowResults, highResults };
    state.pot = 0;
    return carried;
  }

  return {
    LOW_TARGET,
    HIGH_TARGET,
    TOTAL_ROUNDS,
    cardValue,
    getPlayer,
    createHandState,
    isRevealDone,
    revealNextCommunityCard,
    handSumResult,
  };
})();

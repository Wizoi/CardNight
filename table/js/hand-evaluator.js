"use strict";

// Best 5-card poker hand evaluator, including wildcards (3s/9s bought per house rule)
// and Five of a Kind — same category order as app/games-data.js's HAND_RANKINGS.
// Pure logic, no DOM.
const HandEvaluator = (function () {
  const CATEGORY = {
    HIGH_CARD: 0,
    PAIR: 1,
    TWO_PAIR: 2,
    TRIPS: 3,
    STRAIGHT: 4,
    FLUSH: 5,
    FULL_HOUSE: 6,
    QUADS: 7,
    STRAIGHT_FLUSH: 8,
    FIVE_OF_A_KIND: 9,
  };

  const CATEGORY_NAMES = [
    "High Card",
    "Pair",
    "Two Pair",
    "Three of a Kind",
    "Straight",
    "Flush",
    "Full House",
    "Four of a Kind",
    "Straight Flush",
    "Five of a Kind",
  ];

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

  // Evaluates exactly 5 concrete {rank, suit} cards. Wild cards must already have a
  // chosen identity by this point — duplicate (rank, suit) pairs across different
  // wild sources are allowed, since that's how Five of a Kind becomes possible.
  function evaluateFixedFive(cards) {
    const values = cards.map((c) => Deck.RANK_VALUES[c.rank]).sort((a, b) => b - a);
    const isFlush = cards.every((c) => c.suit === cards[0].suit);

    const uniqueValues = [...new Set(values)];
    let isStraight = false;
    let straightHigh = null;
    if (uniqueValues.length === 5) {
      if (uniqueValues[0] - uniqueValues[4] === 4) {
        isStraight = true;
        straightHigh = uniqueValues[0];
      } else if (uniqueValues.join(",") === "14,5,4,3,2") {
        // wheel: A-2-3-4-5, ace plays low
        isStraight = true;
        straightHigh = 5;
      }
    }

    const countByValue = {};
    for (const v of values) countByValue[v] = (countByValue[v] || 0) + 1;
    const groups = Object.entries(countByValue)
      .map(([value, count]) => ({ value: Number(value), count }))
      .sort((a, b) => b.count - a.count || b.value - a.value);

    const counts = groups.map((g) => g.count);
    const tiebreakGroups = groups.map((g) => g.value);

    if (counts[0] === 5) {
      return { category: CATEGORY.FIVE_OF_A_KIND, tiebreakers: [groups[0].value] };
    }
    if (isStraight && isFlush) {
      return { category: CATEGORY.STRAIGHT_FLUSH, tiebreakers: [straightHigh] };
    }
    if (counts[0] === 4) {
      return { category: CATEGORY.QUADS, tiebreakers: tiebreakGroups };
    }
    if (counts[0] === 3 && counts[1] === 2) {
      return { category: CATEGORY.FULL_HOUSE, tiebreakers: tiebreakGroups };
    }
    if (isFlush) {
      return { category: CATEGORY.FLUSH, tiebreakers: values };
    }
    if (isStraight) {
      return { category: CATEGORY.STRAIGHT, tiebreakers: [straightHigh] };
    }
    if (counts[0] === 3) {
      return { category: CATEGORY.TRIPS, tiebreakers: tiebreakGroups };
    }
    if (counts[0] === 2 && counts[1] === 2) {
      return { category: CATEGORY.TWO_PAIR, tiebreakers: tiebreakGroups };
    }
    if (counts[0] === 2) {
      return { category: CATEGORY.PAIR, tiebreakers: tiebreakGroups };
    }
    return { category: CATEGORY.HIGH_CARD, tiebreakers: values };
  }

  function compareEvaluated(a, b) {
    if (a.category !== b.category) return a.category - b.category;
    for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
      const av = a.tiebreakers[i] || 0;
      const bv = b.tiebreakers[i] || 0;
      if (av !== bv) return av - bv;
    }
    return 0;
  }

  function isBetter(a, b) {
    return compareEvaluated(a, b) > 0;
  }

  // cards: [{rank, suit, isWild}]. Returns the best achievable 5-card evaluation,
  // trying every rank/suit identity a wild card could take on.
  function bestHand(cards) {
    if (!cards || cards.length === 0) {
      return { category: -1, categoryName: "No cards", tiebreakers: [] };
    }
    if (cards.length < 5) {
      const evaluated = evaluateGroupsOnly(cards);
      return { ...evaluated, categoryName: CATEGORY_NAMES[evaluated.category] };
    }
    const nonWild = cards.filter((c) => !c.isWild);
    const wildCount = cards.length - nonWild.length;

    if (wildCount === 0) {
      const k = Math.min(5, nonWild.length);
      return bestFromCombos(nonWild, k);
    }

    // Wild identity candidates: full 52-card space is exact and cheap for the
    // realistic case of 1-2 wilds; capped to base-derived ranks/suits beyond that
    // so a rare 3+-wild hand can't blow up evaluation time.
    let candidateRanks = Deck.RANKS;
    let candidateSuits = Deck.SUITS;
    if (wildCount > 2) {
      candidateRanks = [...new Set(nonWild.map((c) => c.rank))];
      if (candidateRanks.length === 0) candidateRanks = Deck.RANKS;
      candidateSuits = [...new Set(nonWild.map((c) => c.suit))];
      if (candidateSuits.length === 0) candidateSuits = Deck.SUITS;
    }
    const identityPool = [];
    for (const rank of candidateRanks) {
      for (const suit of candidateSuits) identityPool.push({ rank, suit });
    }

    const baseSize = Math.max(0, Math.min(nonWild.length, 5 - wildCount));
    const baseCombos = baseSize > 0 ? combinations(nonWild, baseSize) : [[]];

    let best = null;
    for (const base of baseCombos) {
      const slotsNeeded = 5 - base.length;
      best = bestOverWildAssignments(base, slotsNeeded, identityPool, best);
    }
    return best || { category: -1, categoryName: "No cards", tiebreakers: [] };
  }

  function bestOverWildAssignments(base, slotsNeeded, identityPool, best) {
    if (slotsNeeded === 0) {
      const evaluated = evaluateFixedFive(base);
      if (!best || isBetter(evaluated, best)) {
        return { ...evaluated, categoryName: CATEGORY_NAMES[evaluated.category] };
      }
      return best;
    }
    for (const identity of identityPool) {
      const withIdentity = base.concat([identity]);
      best = bestOverWildAssignments(withIdentity, slotsNeeded - 1, identityPool, best);
    }
    return best;
  }

  function bestFromCombos(cards, k) {
    let best = null;
    for (const combo of combinations(cards, k)) {
      const evaluated = evaluateFixedFive(combo);
      if (!best || isBetter(evaluated, best)) {
        best = { ...evaluated, categoryName: CATEGORY_NAMES[evaluated.category] };
      }
    }
    return best;
  }

  // Fewer than 5 cards revealed so far still needs a comparable "showing hand" —
  // straights/flushes aren't decidable without 5 real cards, so this only tracks
  // groups (pair/trips/quads/five-of-a-kind), which is how partial stud hands are
  // compared at the table anyway. Wilds are greedily assigned to the biggest
  // existing group, since that's the only group they could usefully inflate.
  function evaluateGroupsOnly(cards) {
    const nonWild = cards.filter((c) => !c.isWild);
    const wildCount = cards.length - nonWild.length;

    const countByValue = {};
    for (const c of nonWild) {
      const v = Deck.RANK_VALUES[c.rank];
      countByValue[v] = (countByValue[v] || 0) + 1;
    }
    let groups = Object.entries(countByValue)
      .map(([value, count]) => ({ value: Number(value), count }))
      .sort((a, b) => b.count - a.count || b.value - a.value);

    if (wildCount > 0) {
      if (groups.length === 0) {
        groups = [{ value: Deck.RANK_VALUES.A, count: wildCount }];
      } else {
        groups[0] = { ...groups[0], count: groups[0].count + wildCount };
      }
      groups.sort((a, b) => b.count - a.count || b.value - a.value);
    }

    const counts = groups.map((g) => g.count);
    const tiebreakGroups = groups.map((g) => g.value);

    if (counts[0] >= 5) return { category: CATEGORY.FIVE_OF_A_KIND, tiebreakers: [groups[0].value] };
    if (counts[0] === 4) return { category: CATEGORY.QUADS, tiebreakers: tiebreakGroups };
    if (counts[0] === 3 && counts[1] === 2) return { category: CATEGORY.FULL_HOUSE, tiebreakers: tiebreakGroups };
    if (counts[0] === 3) return { category: CATEGORY.TRIPS, tiebreakers: tiebreakGroups };
    if (counts[0] === 2 && counts[1] === 2) return { category: CATEGORY.TWO_PAIR, tiebreakers: tiebreakGroups };
    if (counts[0] === 2) return { category: CATEGORY.PAIR, tiebreakers: tiebreakGroups };
    // No pairs at all: every group has count 1, so tiebreakGroups is already the
    // full sorted value list — including a lone wild's assumed best value
    // (e.g. an Ace), which plain nonWild-only high cards would have dropped.
    return { category: CATEGORY.HIGH_CARD, tiebreakers: tiebreakGroups.length ? tiebreakGroups : [0] };
  }

  function evaluatePartial(cards) {
    if (!cards || cards.length === 0) {
      return { category: -1, categoryName: "No cards", tiebreakers: [] };
    }
    if (cards.length >= 5) return bestHand(cards);
    const evaluated = evaluateGroupsOnly(cards);
    return { ...evaluated, categoryName: CATEGORY_NAMES[evaluated.category] };
  }

  function rankName(value) {
    return Deck.RANKS[value - 2] || String(value);
  }

  // A category name alone can hide the real story (e.g. two "Three of a Kind"
  // hands can be worlds apart) — this spells out the actual ranks involved so
  // log/debug output is never ambiguous about why one hand beat another.
  function describe(evaluated) {
    const t = evaluated.tiebreakers || [];
    switch (evaluated.category) {
      case CATEGORY.FIVE_OF_A_KIND:
        return `Five of a Kind (${rankName(t[0])}s)`;
      case CATEGORY.STRAIGHT_FLUSH:
        return `Straight Flush (${rankName(t[0])}-high)`;
      case CATEGORY.QUADS:
        return `Four of a Kind (${rankName(t[0])}s)`;
      case CATEGORY.FULL_HOUSE:
        return `Full House (${rankName(t[0])}s over ${rankName(t[1])}s)`;
      case CATEGORY.FLUSH:
        return `Flush (${rankName(t[0])}-high)`;
      case CATEGORY.STRAIGHT:
        return `Straight (${rankName(t[0])}-high)`;
      case CATEGORY.TRIPS:
        return `Three of a Kind (${rankName(t[0])}s)`;
      case CATEGORY.TWO_PAIR:
        return `Two Pair (${rankName(t[0])}s and ${rankName(t[1])}s)`;
      case CATEGORY.PAIR:
        return `Pair of ${rankName(t[0])}s`;
      case CATEGORY.HIGH_CARD:
        return t[0] ? `${rankName(t[0])} High` : "No hand";
      default:
        return evaluated.categoryName || "No hand";
    }
  }

  // Can `values` be split into disjoint groups that each sum to exactly
  // `target`? (Seven and What Makes It: "a card can't be used in more than
  // one combination at the same time.") Small brute-force backtracking —
  // fine at hand-size scale (at most 7 cards).
  function canPartitionIntoSumGroups(values, target) {
    function solve(remaining) {
      if (remaining.length === 0) return true;
      const [first, ...rest] = remaining;
      const n = rest.length;
      for (let mask = 0; mask < 1 << n; mask++) {
        let sum = first;
        const usedIdx = [];
        for (let i = 0; i < n; i++) {
          if (mask & (1 << i)) {
            sum += rest[i];
            usedIdx.push(i);
          }
        }
        if (sum === target) {
          const leftover = rest.filter((_, i) => !usedIdx.includes(i));
          if (solve(leftover)) return true;
        }
      }
      return false;
    }
    return solve(values);
  }

  // Self-determined wildcard evaluation (Seven and What Makes It): any set
  // of a player's own cards summing to exactly `targetSum` is wild — not a
  // fixed rank, not dealer-triggered, chosen fresh per player from whatever
  // they're holding. `rankValue(rank)` returns that card's numeric value for
  // this purpose, or null if the rank can't participate at all (games.md
  // doesn't say what face cards count as here, so they're excluded from
  // consideration entirely rather than guessing a value for them).
  //
  // Tries every subset of the hand as a "candidate wild set" (there are at
  // most 2^7 for a full 7-card hand) and keeps only the ones that actually
  // satisfy the disjoint-sum-groups constraint — cheap, since it's just
  // integer arithmetic. Only *maximal* valid subsets (no other valid subset
  // is a strict superset) are actually scored via bestHand/evaluatePartial,
  // which is the expensive part once any wilds are involved (bestHand's own
  // wild-identity search grows fast with wild count): a strict superset
  // that's still valid always weakly dominates a smaller valid subset,
  // since a wild card marked in the superset can always fall back to its
  // own real identity in bestHand's resolution search, so the extra
  // (non-maximal) candidates could never win and don't need to be scored.
  function bestHandWithSumWild(cards, targetSum, rankValue) {
    const n = cards.length;
    const validMasks = [];
    for (let mask = 0; mask < 1 << n; mask++) {
      const wildValues = [];
      let eligible = true;
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) {
          const v = rankValue(cards[i].rank);
          if (v == null) {
            eligible = false;
            break;
          }
          wildValues.push(v);
        }
      }
      if (!eligible) continue;
      if (wildValues.length > 0 && !canPartitionIntoSumGroups(wildValues, targetSum)) continue;
      validMasks.push(mask);
    }

    const maximalMasks = validMasks.filter(
      (mask) => !validMasks.some((other) => other !== mask && (other & mask) === mask)
    );

    let best = null;
    for (const mask of maximalMasks) {
      const candidateCards = cards.map((c, i) => ({ rank: c.rank, suit: c.suit, isWild: !!(mask & (1 << i)) }));
      const evaluated = candidateCards.length >= 5 ? bestHand(candidateCards) : evaluatePartial(candidateCards);
      if (best == null || isBetter(evaluated, best)) best = evaluated;
    }
    return best || { category: -1, categoryName: "No cards", tiebreakers: [] };
  }

  // Ace-to-eight low hand evaluation (hold'em's optional hi-lo split): a
  // qualifying low is exactly 5 UNPAIRED cards each ranked 8-or-under, aces
  // counting low — straights/flushes are irrelevant to a low hand, only
  // the 5 ranks matter. No wildcard support here: none of this project's
  // hold'em variants have a fixed wildcard rule at all, so the extra
  // complexity of an assignable-to-any-low-rank wild card isn't needed.
  function aceLowValue(rank) {
    if (rank === "A") return 1;
    const n = Number(rank);
    return Number.isFinite(n) && n <= 8 ? n : null;
  }

  // Evaluates exactly 5 concrete {rank, suit} cards as a low hand. Returns
  // {qualifies: false} if any card is above 8 or any two share a rank;
  // otherwise {qualifies: true, ranks: [5 ace-low values, sorted ascending]}.
  function evaluateLowFive(cards) {
    const values = [];
    for (const c of cards) {
      const v = aceLowValue(c.rank);
      if (v == null || values.includes(v)) return { qualifies: false };
      values.push(v);
    }
    values.sort((a, b) => a - b);
    return { qualifies: true, ranks: values };
  }

  // Lower ranks win a low hand -- compare from the HIGHEST card in each
  // hand downward (the opposite direction from a high-hand tiebreak), same
  // as standard ace-to-eight low comparison rules.
  function isBetterLow(a, b) {
    for (let i = 4; i >= 0; i--) {
      if (a.ranks[i] !== b.ranks[i]) return a.ranks[i] < b.ranks[i];
    }
    return false;
  }

  // candidateFiveCardHands: an array of already-assembled 5-card arrays
  // (the caller is responsible for generating whichever combos its game's
  // hand/board split rule allows -- this function doesn't know about
  // hole/board cards at all, just scores whichever exact hands it's given).
  // Returns the best qualifying low, or null if none of the candidates
  // qualify at all.
  function bestLow(candidateFiveCardHands) {
    let best = null;
    for (const combo of candidateFiveCardHands) {
      const evaluated = evaluateLowFive(combo);
      if (!evaluated.qualifies) continue;
      if (best == null || isBetterLow(evaluated, best)) best = evaluated;
    }
    return best;
  }

  function describeLow(low) {
    if (!low) return "No qualifying low";
    const names = low.ranks
      .slice()
      .sort((a, b) => b - a)
      .map((v) => (v === 1 ? "A" : String(v)));
    return `${names.join("-")} low`;
  }

  return {
    CATEGORY,
    CATEGORY_NAMES,
    bestHand,
    evaluatePartial,
    bestHandWithSumWild,
    compareEvaluated,
    isBetter,
    describe,
    bestLow,
    isBetterLow,
    describeLow,
  };
})();

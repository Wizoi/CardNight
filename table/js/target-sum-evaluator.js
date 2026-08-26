"use strict";

// Shared scoring utility for the "closest to a target number, split pot"
// games (3-33, 5.5-21, 7-27) — a genuinely different scoring model than
// poker hand ranking: a hand's value is the SUM of its cards (with some
// ranks flexible, e.g. an Ace counting as 1 or 11), compared against one or
// two numeric targets rather than a 5-card category. Pure math, no DOM, no
// game-specific turn structure — each game's own rules-*.js still owns its
// deal/turn/betting shape, the same split this project uses everywhere else
// (HandEvaluator is the poker-hand equivalent of this for every other game).
const TargetSumEvaluator = (function () {
  // cardValueFn(card) -> number[], the possible values this one card could
  // contribute (a fixed-value card returns a single-element array). Returns
  // every achievable total across the hand's full cartesian product of
  // per-card choices -- cheap at hand sizes this small (well under 2^10).
  function achievableSums(hand, cardValueFn) {
    let sums = [0];
    for (const card of hand) {
      const options = cardValueFn(card);
      const next = new Set();
      for (const s of sums) {
        for (const v of options) next.add(s + v);
      }
      sums = [...next];
    }
    return sums;
  }

  // bustRule 'bust': only sums <= target are in contention; the best is the
  // highest such sum (closest from below), or `busted: true` if every
  // achievable sum exceeds the target (5.5-21's rule -- going over disqualifies
  // a hand from THAT side entirely).
  // bustRule 'noBust': the best is whichever achievable sum has the smallest
  // absolute distance from the target, over or under (7-27/3-33's rule --
  // there's no such thing as busting, just closer or farther).
  function bestForTarget(hand, cardValueFn, target, bustRule) {
    const sums = achievableSums(hand, cardValueFn);
    if (bustRule === "bust") {
      const valid = sums.filter((s) => s <= target);
      if (!valid.length) return { busted: true, value: null, distance: Infinity };
      const value = Math.max(...valid);
      return { busted: false, value, distance: target - value };
    }
    let best = null;
    for (const s of sums) {
      const d = Math.abs(s - target);
      if (best == null || d < best.distance) best = { value: s, distance: d };
    }
    return { busted: false, value: best.value, distance: best.distance };
  }

  return { achievableSums, bestForTarget };
})();

"use strict";

// Deterministic AI awareness profiles sharing one heuristic — not random per
// hand (only the *default assignment* of a profile to a seat is randomized,
// at setup time). Each function takes the profile as data, so every seat
// runs through the exact same decision logic with different thresholds; the
// PROFILES map is the only thing that varies.
//
// Originally just three shared buckets (cautious/balanced/aggressive), with
// all 10 player archetypes (personas/players/OVERVIEW.md) funneled into one
// of them via table-people.js's ARCHETYPE_PROFILE -- 5 of the 10 landed on
// "balanced" and played identically, a fidelity gap the Rules Referee
// persona flagged when the setup UI's play-style badge was first added (see
// CLAUDE.md). Expanded 2026-08-28 to give each archetype its own tuned
// profile below, reusing these exact same fields -- no decision function
// anywhere had to change, since they were always written to read whatever
// profile object they're handed, never assuming exactly three exist. The
// original three names are kept as-is (nothing else in the app references
// them, but removing working, harmless code isn't worth it) as a documented
// fallback shape/reference point for anything added later.
//
// Tuning below is a judgment call, not measured against real play -- each
// archetype's numbers are pulled toward its OVERVIEW.md psychological sketch
// (e.g. The Fortress's loss-aversion means the tightest gutsMinCategoryToStay
// and pressYourLuckStandThreshold in the roster) using the same knobs the
// original three already established the range for. Two archetypes are
// explicitly approximated rather than fully modeled: The Storm's tilt spiral
// and The Streak Chaser's hot-hand/gambler's-fallacy swings are genuinely
// STATE-DEPENDENT (they change behavior after a win/loss streak within a
// sitting) -- modeling that for real would mean threading recent-result
// tracking through every session-*.js, a materially bigger feature than a
// static profile tuning pass. Both get a fixed baseline approximating their
// average tendency instead (Storm: confident/sharp; Streak Chaser: loosely
// aggressive, since chasing both hot and cold streaks nets out to "plays and
// bets more than a disciplined player would") -- a known simplification, not
// a bug, flagged here so it isn't mistaken for the real thing later.
const AIProfiles = (function () {
  const PROFILES = {
    cautious: {
      name: "cautious",
      label: "Cautious",
      buyWildOnlyOnCategoryGain: true, // only pays for a 9 if it changes the hand's category, not just a kicker
      chancePerCard: 0.5, // how many "hand categories" of gap one more unknown flip is assumed worth closing
      raiseWhenLeading: false,
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.TWO_PAIR, // guts games: a fully-known hand needs to be genuinely strong to risk the ante
      pressYourLuckStandThreshold: 3, // 5.5-21/7-27: stands once already within this far of either target, rather than pushing for exact
      aceyDuceyMinWinProb: 0.5, // Acey Ducey: only bets when the gap between the two shown cards looks genuinely safe
      aceyDuceyBetFraction: 0.25, // ...and even then, risks only a quarter of the pot
      blindBluffScaryRankValue: 12, // Blind Man's Bluff: folds once any visible opponent shows a Queen or better (own card is hidden, so this is the only signal there is)
      blindBluffRaiseBelowRankValue: 7, // ...and only raises when the best visible opposing card is quite low
    },
    balanced: {
      name: "balanced",
      label: "Balanced",
      buyWildOnlyOnCategoryGain: false,
      chancePerCard: 1,
      raiseWhenLeading: true,
      raiseMinCategory: HandEvaluator.CATEGORY.TWO_PAIR, // won't raise on a lead this thin
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.PAIR,
      pressYourLuckStandThreshold: 1.5,
      aceyDuceyMinWinProb: 0.3,
      aceyDuceyBetFraction: 0.5,
      blindBluffScaryRankValue: 14, // only an Ace showing among opponents scares balanced off
      blindBluffRaiseBelowRankValue: 10,
    },
    aggressive: {
      name: "aggressive",
      label: "Aggressive",
      buyWildOnlyOnCategoryGain: false,
      chancePerCard: 1.5,
      raiseWhenLeading: true,
      raiseMinCategory: HandEvaluator.CATEGORY.PAIR, // presses even a modest lead
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.HIGH_CARD, // stays in almost every guts hand -- fits the reckless archetype
      pressYourLuckStandThreshold: 0.5, // keeps hitting until right on top of a target or busted
      aceyDuceyMinWinProb: 0.15,
      aceyDuceyBetFraction: 1, // goes for broke on any decent-looking gap
      blindBluffScaryRankValue: 99, // never folds -- fits the reckless archetype
      blindBluffRaiseBelowRankValue: 13, // raises unless someone's showing an outright Ace
    },

    // Tight-aggressive: selective, purposeful, explicit-probability-driven
    // (Tendler's Process Model, the TAG archetype). Plays a genuinely narrow
    // range, but presses it on purpose once committed -- not just "cautious
    // but a little looser."
    "the-calculator": {
      name: "the-calculator",
      label: "Tight-Aggressive",
      buyWildOnlyOnCategoryGain: true,
      chancePerCard: 0.75,
      raiseWhenLeading: true,
      raiseMinCategory: HandEvaluator.CATEGORY.TWO_PAIR,
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.TWO_PAIR,
      pressYourLuckStandThreshold: 2,
      aceyDuceyMinWinProb: 0.4,
      aceyDuceyBetFraction: 0.35,
      blindBluffScaryRankValue: 13,
      blindBluffRaiseBelowRankValue: 9,
    },

    // Maniac: the loosest, most volatile seat in the roster on purpose --
    // wide range, raises on nothing, never backs down (LAG/maniac taxonomy,
    // illusion-of-control bias).
    "live-wire": {
      name: "live-wire",
      label: "Maniac",
      buyWildOnlyOnCategoryGain: false,
      chancePerCard: 1.8,
      raiseWhenLeading: true,
      raiseMinCategory: HandEvaluator.CATEGORY.HIGH_CARD,
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.HIGH_CARD,
      pressYourLuckStandThreshold: 0.25,
      aceyDuceyMinWinProb: 0.1,
      aceyDuceyBetFraction: 1,
      blindBluffScaryRankValue: 99,
      blindBluffRaiseBelowRankValue: 14,
    },

    // The nit: the tightest seat in the roster, on purpose -- loss aversion
    // (Kahneman & Tversky) means a chip lost hurts roughly twice as much as
    // an equivalent chip won, so almost nothing clears the bar to risk one.
    fortress: {
      name: "fortress",
      label: "Nit",
      buyWildOnlyOnCategoryGain: true,
      chancePerCard: 0.3,
      raiseWhenLeading: false,
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.TRIPS,
      pressYourLuckStandThreshold: 4,
      aceyDuceyMinWinProb: 0.65,
      aceyDuceyBetFraction: 0.15,
      blindBluffScaryRankValue: 10,
      blindBluffRaiseBelowRankValue: 5,
    },

    // Approximated (see the file-level note above): The Storm's real trait is
    // a state-dependent tilt spiral after a bad beat, not modeled here.
    // Baseline is its "even" state -- skilled and confident, a hair sharper
    // and more willing to press than Balanced, reflecting real skill rather
    // than recklessness.
    storm: {
      name: "storm",
      label: "Sharp (untilted)",
      buyWildOnlyOnCategoryGain: false,
      chancePerCard: 1.1,
      raiseWhenLeading: true,
      raiseMinCategory: HandEvaluator.CATEGORY.PAIR,
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.PAIR,
      pressYourLuckStandThreshold: 1.2,
      aceyDuceyMinWinProb: 0.25,
      aceyDuceyBetFraction: 0.6,
      blindBluffScaryRankValue: 13,
      blindBluffRaiseBelowRankValue: 11,
    },

    // Small-ball: plays a lot of hands cheaply to keep gathering information
    // (Negreanu's documented style) rather than either folding early or
    // blowing pots up -- lots of calls/continuations, raises only once a
    // hand is genuinely good, not just "currently ahead."
    diplomat: {
      name: "diplomat",
      label: "Small-Ball",
      buyWildOnlyOnCategoryGain: false,
      chancePerCard: 1.1,
      raiseWhenLeading: true,
      raiseMinCategory: HandEvaluator.CATEGORY.TWO_PAIR,
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.PAIR,
      pressYourLuckStandThreshold: 1.5,
      aceyDuceyMinWinProb: 0.3,
      aceyDuceyBetFraction: 0.4,
      blindBluffScaryRankValue: 13,
      blindBluffRaiseBelowRankValue: 10,
    },

    // Unreadable (Ivey-style): the defining trait is that bet-sizing and
    // pacing look identical whether the hand is strong or weak -- a genuine
    // tell-suppression trait none of these numeric bet-shape knobs can
    // really capture (there's no opponent-facing "tell" to suppress in this
    // engine at all). Deliberately centered dead-middle of the whole
    // roster's range instead: a true "textbook, gives away nothing" baseline
    // rather than leaning tight or loose either way.
    wall: {
      name: "wall",
      label: "Unreadable",
      buyWildOnlyOnCategoryGain: false,
      chancePerCard: 1,
      raiseWhenLeading: true,
      raiseMinCategory: HandEvaluator.CATEGORY.TWO_PAIR,
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.PAIR,
      pressYourLuckStandThreshold: 1.5,
      aceyDuceyMinWinProb: 0.3,
      aceyDuceyBetFraction: 0.5,
      blindBluffScaryRankValue: 14,
      blindBluffRaiseBelowRankValue: 10,
    },

    // Annie Duke's "resulting" concept: judges decisions on their own merit,
    // not on how the hand happened to turn out -- process-driven and
    // disciplined like The Calculator, but the trait here is refusing to
    // overreact to a bad beat rather than raw probability calculation, so
    // it's tuned a notch looser than the pure-TAG Calculator.
    statistician: {
      name: "statistician",
      label: "Process-Driven",
      buyWildOnlyOnCategoryGain: true,
      chancePerCard: 0.9,
      raiseWhenLeading: true,
      raiseMinCategory: HandEvaluator.CATEGORY.TWO_PAIR,
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.PAIR,
      pressYourLuckStandThreshold: 1.8,
      aceyDuceyMinWinProb: 0.35,
      aceyDuceyBetFraction: 0.4,
      blindBluffScaryRankValue: 13,
      blindBluffRaiseBelowRankValue: 10,
    },

    // Approximated (see the file-level note above): the hot-hand/gambler's-
    // fallacy swings (bets bigger after wins, chases losses expecting a
    // correction) are genuinely state-dependent and not modeled here.
    // Baseline nets those two opposing pulls out to "plays and bets more
    // than a disciplined player would, most of the time."
    "streak-chaser": {
      name: "streak-chaser",
      label: "Streaky (avg.)",
      buyWildOnlyOnCategoryGain: false,
      chancePerCard: 1.3,
      raiseWhenLeading: true,
      raiseMinCategory: HandEvaluator.CATEGORY.PAIR,
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.HIGH_CARD,
      pressYourLuckStandThreshold: 0.75,
      aceyDuceyMinWinProb: 0.2,
      aceyDuceyBetFraction: 0.7,
      blindBluffScaryRankValue: 14,
      blindBluffRaiseBelowRankValue: 12,
    },

    // Low discipline, high creativity (the bridge-player-study "Subversive"
    // cluster): deliberately plays unconventional, non-optimal lines rather
    // than simply loose-aggressive ones. Modeled as an unusual mix no other
    // profile has -- stays in on nearly anything (unconventional starting
    // range) but, distinctly, does NOT press a lead either (withholds the
    // "obvious" raise on purpose) -- loose-passive, a genuinely odd
    // combination that reads as contrarian rather than just reckless.
    subversive: {
      name: "subversive",
      label: "Unconventional",
      buyWildOnlyOnCategoryGain: false,
      chancePerCard: 1.4,
      raiseWhenLeading: false,
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.HIGH_CARD,
      pressYourLuckStandThreshold: 0.4,
      aceyDuceyMinWinProb: 0.12,
      aceyDuceyBetFraction: 0.85,
      blindBluffScaryRankValue: 99,
      blindBluffRaiseBelowRankValue: 14,
    },

    // Veteran temperament (Brunson-style): even-keeled and consistent
    // regardless of stakes, essentially immune to tilt. Tuned as a stable,
    // measured profile -- a notch tighter than Balanced across the board,
    // reflecting decades of internalized variance rather than caution.
    "steady-hand": {
      name: "steady-hand",
      label: "Veteran",
      buyWildOnlyOnCategoryGain: true,
      chancePerCard: 0.85,
      raiseWhenLeading: true,
      raiseMinCategory: HandEvaluator.CATEGORY.TWO_PAIR,
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.PAIR,
      pressYourLuckStandThreshold: 1.7,
      aceyDuceyMinWinProb: 0.35,
      aceyDuceyBetFraction: 0.35,
      blindBluffScaryRankValue: 12,
      blindBluffRaiseBelowRankValue: 9,
    },
  };

  const PROFILE_NAMES = Object.keys(PROFILES);

  function randomProfileName() {
    return PROFILE_NAMES[Math.floor(Math.random() * PROFILE_NAMES.length)];
  }

  function profileFor(name) {
    return PROFILES[name] || PROFILES.balanced;
  }

  function decideBuy3(player) {
    // The 3 is required to stay in the hand at all — always buy if it's
    // affordable, regardless of profile.
    return player.wallet.chips >= ChipEconomy.dollarsToChips(3);
  }

  // Judged only from what's actually face-up so far — a player doesn't know
  // their own still-hidden cards any more than an opponent watching them
  // would, so this can't peek at the rest of the hand.
  function decideBuy9(player, profile, cardIndex) {
    if (player.wallet.chips < ChipEconomy.dollarsToChips(2)) return false;
    const faceUp = player.hand.filter((c) => c.faceUp);
    const asCards = (nineIsWild) =>
      faceUp.map((c, i) => ({ rank: c.rank, suit: c.suit, isWild: i === cardIndex ? nineIsWild : c.isWild }));
    const withWild = HandEvaluator.evaluatePartial(asCards(true));
    const withoutWild = HandEvaluator.evaluatePartial(asCards(false));
    if (!HandEvaluator.isBetter(withWild, withoutWild)) return false;
    // Cautious skips a wild that's only a marginal kicker bump to an already-made
    // hand, but with nothing made yet (still just High Card), a wild is cheap
    // insurance worth taking regardless of profile — there's a whole hand of
    // future flips left to pair it with.
    if (profile.buyWildOnlyOnCategoryGain && withoutWild.category > HandEvaluator.CATEGORY.HIGH_CARD) {
      return withWild.category > withoutWild.category;
    }
    return true;
  }

  function decideBuy4(player) {
    return player.wallet.chips >= ChipEconomy.dollarsToChips(1);
  }

  // No legitimate basis to prefer one still-hidden card over another — flip in
  // dealt order rather than peeking to pick a "better" one.
  function decideNextCardIndex(player) {
    return player.hand.findIndex((c) => !c.faceUp);
  }

  // Worth continuing/calling without knowing what's actually under the
  // remaining cards: weigh the category gap against how many unknown flips
  // are left to close it, at a profile-scaled optimism per flip. This is the
  // same reasoning a player watching from outside the hand could make.
  function worthPursuing(showing, board, remainingCards, profile) {
    if (!HandEvaluator.isBetter(board, showing)) return true;
    const gap = board.category - showing.category;
    return remainingCards * profile.chancePerCard >= gap;
  }

  function decideContinue(player, state, profile) {
    const remaining = MidnightBaseball.remainingFaceDownCount(state, player.id);
    if (remaining === 0) return false;
    const showing = MidnightBaseball.evaluateShowingHand(state, player.id);
    const board = MidnightBaseball.currentBestHand(state).hand;
    return worthPursuing(showing, board, remaining, profile);
  }

  // A fully-revealed hand has no more upside (every card is already shown)
  // and nothing hidden from opponents either — raising it only makes sense if
  // it's genuinely strong, not just "currently ahead." Still-live hands get
  // the profile's normal (more lenient) threshold since they might improve.
  function worthRaisingAsLeader(player, state, profile) {
    if (!profile.raiseWhenLeading) return false;
    const showing = MidnightBaseball.evaluateShowingHand(state, player.id);
    const remaining = MidnightBaseball.remainingFaceDownCount(state, player.id);
    const minCategory = remaining === 0 ? HandEvaluator.CATEGORY.TRIPS : profile.raiseMinCategory;
    return showing.category >= minCategory;
  }

  function decideBet(player, state, profile) {
    const br = state.bettingRound;
    const toCallChips = br.currentBetChips - br.committed[player.id];
    const best = MidnightBaseball.currentBestHand(state);
    const isLeader = best.holderId === player.id;

    if (!isLeader && toCallChips > 0) {
      const showing = MidnightBaseball.evaluateShowingHand(state, player.id);
      const remaining = MidnightBaseball.remainingFaceDownCount(state, player.id);
      if (!worthPursuing(showing, best.hand, remaining, profile)) {
        return { action: "fold" };
      }
    }
    if (isLeader && worthRaisingAsLeader(player, state, profile)) {
      const maxRaise = MidnightBaseball.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) return { action: "raise", raiseDollars: Math.min(state.raiseIncrementDollars, maxRaise) };
    }
    return { action: "call" };
  }

  return {
    PROFILES,
    PROFILE_NAMES,
    randomProfileName,
    profileFor,
    decideBuy3,
    decideBuy9,
    decideBuy4,
    decideNextCardIndex,
    worthPursuing,
    decideContinue,
    decideBet,
  };
})();

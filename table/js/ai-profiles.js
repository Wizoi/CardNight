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
      bluffFrequency: 0, // never raises on a hand that doesn't actually warrant it
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
      bluffFrequency: 0.05,
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
      bluffFrequency: 0.15,
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
      bluffFrequency: 0.08, // selective and purposeful even when bluffing, not never
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
      bluffFrequency: 0.25, // the loosest in the roster -- "raises on nothing" is close to literal
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
      bluffFrequency: 0, // nothing clears the bar to risk a chip, bluffed or otherwise
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
      bluffFrequency: 0.1,
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
      bluffFrequency: 0.05,
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
      bluffFrequency: 0.1, // a real, unpredictable bluff rate is the whole point of "gives away nothing"
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
      bluffFrequency: 0.05,
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
      bluffFrequency: 0.15,
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
      // With raiseWhenLeading off, bluffing is this profile's ONLY path to
      // ever raising at all -- fitting, since an unpredictable raise
      // untethered from actual hand strength IS the "contrarian" trait,
      // not just a flavor add-on the way it is for other profiles.
      bluffFrequency: 0.2,
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
      bluffFrequency: 0.05,
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

  // --- Shared betting-flavor helpers (2026-08-29 pass) ---
  // Reused across every family's own decideBet instead of re-deriving the
  // same bet-sizing/bluffing/opponent-count/pot-odds logic in each one.
  // Prompted by two real reports: Omaha AI seats re-raising each other
  // near-indefinitely on a low TWO_PAIR (fixed narrowly at the time with a
  // per-player raise-count cap in ai-holdem-profiles.js), and a follow-up
  // ask for what OTHER poker AI/betting engines do generally to feel more
  // natural. A background research pass (public/academic poker bots, CMU's
  // Libratus/Pluribus, general game-AI "believability vs. optimality"
  // literature) converged on a short list worth building: scaled bet
  // sizing, occasional bluffing, opponent-count-aware thresholds, and a
  // pot-odds nudge -- see CLAUDE.md for the full research writeup.
  //
  // Deliberately does NOT touch the guts family (Deep or Double Screw, 3
  // Buy 5, Four-Two-Two, 3-5-7 Guts) -- games.md states it as ante-only,
  // no raise/max-bet structure exists there at all, so none of this
  // applies.

  // How far a hand's category clears the raise bar, bucketed into a small
  // number of bet-sizing tiers (0 = doesn't clear at all -- callers should
  // never reach scaledRaiseDollars with tier 0 outside a deliberate bluff).
  function confidenceTier(categoryGapAboveBar) {
    if (categoryGapAboveBar <= 0) return 0;
    if (categoryGapAboveBar === 1) return 1;
    if (categoryGapAboveBar === 2) return 2;
    return 3;
  }

  // Scales a raise's SIZE by confidence tier instead of always the flat
  // increment: a marginal raise-worthy hand still just min-raises, a
  // clearly-ahead hand raises a few increments, and a near-nuts hand pushes
  // for as much of maxRaiseDollars as is available -- still bounded by it
  // (and by whatever cap on ante-based families' own low max bet already
  // applies). A tier-1 size (a plain, unremarkable-looking raise) is also
  // what shouldBluff's raises use, specifically so a bluff can't be picked
  // out by its size alone.
  function scaledRaiseDollars(tier, raiseIncrementDollars, maxRaiseDollarsAllowed) {
    if (maxRaiseDollarsAllowed <= 0) return 0;
    const multiplier = [1, 1, 2, 4][tier] || 1;
    return Math.min(maxRaiseDollarsAllowed, raiseIncrementDollars * multiplier);
  }

  // A small, per-archetype chance to raise despite NOT actually clearing
  // the normal bar -- sized exactly like a real tier-1 value raise (see
  // scaledRaiseDollars) so it can't be told apart by size. Independent of
  // profile.raiseWhenLeading on purpose: Subversive has raiseWhenLeading
  // false (never presses an actual lead) but a real bluffFrequency, since
  // an unpredictable raise untethered from hand strength IS its defining
  // trait, not a lead it's declining to press.
  function shouldBluff(profile) {
    return Math.random() < (profile.bluffFrequency || 0);
  }

  // Fewer live opponents justifies looser raising (heads-up: only one hand
  // to beat); more live opponents calls for tighter raising (a marginal
  // edge means less against 4-5 live hands than against 1). Returns a
  // category-tier shift to fold into a raiseBarFor-style calculation, the
  // same units raiseBarFor's own streets/reveals-remaining term already
  // uses.
  function opponentCountBarAdjustment(liveOpponentCount) {
    if (liveOpponentCount <= 1) return -1;
    if (liveOpponentCount >= 4) return 1;
    return 0;
  }

  function liveOpponentCount(players, selfId) {
    return players.filter((p) => !p.folded && p.id !== selfId).length;
  }

  // A crude pot-odds nudge -- NOT real equity estimation, just "how cheap
  // is this call relative to what's already in the pot." Deliberately
  // ADDITIVE ONLY: it can make an already-marginal hand a little more
  // worth chasing when the price is cheap, but can never override a hand
  // that's already a clear fold under the normal category-gap heuristic --
  // avoids the two heuristics ever giving flatly contradictory answers.
  // Returned in the same fractional units as profile.chancePerCard (a
  // "how many categories of gap one more unknown card is worth," not raw
  // dollars), so callers just add it directly to chancePerCard before the
  // usual remainingCards * chancePerCard >= gap comparison.
  function potOddsChanceBonus(toCallChips, potChips) {
    if (toCallChips <= 0 || potChips <= 0) return 0;
    const odds = toCallChips / (potChips + toCallChips);
    if (odds <= 0.1) return 0.3; // very cheap relative to the pot -- worth stretching for
    if (odds <= 0.2) return 0.15;
    return 0;
  }

  // Worth continuing/calling without knowing what's actually under the
  // remaining cards: weigh the category gap against how many unknown flips
  // are left to close it, at a profile-scaled optimism per flip. This is the
  // same reasoning a player watching from outside the hand could make.
  function worthPursuing(showing, board, remainingCards, profile, chanceBonus) {
    if (!HandEvaluator.isBetter(board, showing)) return true;
    const gap = board.category - showing.category;
    return remainingCards * (profile.chancePerCard + (chanceBonus || 0)) >= gap;
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
  // the profile's normal threshold, tightened by how many of the player's
  // OWN face-down cards remain -- instead of one flat threshold for the
  // whole hand regardless of how many are still to flip. Same fix applied
  // everywhere else this pattern existed (2026-08-29, reported against
  // Criss Cross): a showing hand that already clears the bar with several
  // cards still unflipped is a much weaker signal than the same category
  // with just one card left.
  function raiseBarForLeader(remaining, profile, barAdjustment) {
    if (remaining === 0) return HandEvaluator.CATEGORY.TRIPS;
    return Math.min(HandEvaluator.CATEGORY.STRAIGHT_FLUSH, profile.raiseMinCategory + Math.floor(remaining / 2) + (barAdjustment || 0));
  }

  function worthRaisingAsLeader(player, state, profile, barAdjustment) {
    if (!profile.raiseWhenLeading) return false;
    const showing = MidnightBaseball.evaluateShowingHand(state, player.id);
    const remaining = MidnightBaseball.remainingFaceDownCount(state, player.id);
    return showing.category >= raiseBarForLeader(remaining, profile, barAdjustment);
  }

  function decideBet(player, state, profile) {
    const br = state.bettingRound;
    const toCallChips = br.currentBetChips - br.committed[player.id];
    const best = MidnightBaseball.currentBestHand(state);
    const isLeader = best.holderId === player.id;

    // A bluff raise here means claiming the lead without actually holding
    // it -- independent of isLeader on purpose, same as every other
    // family's shouldBluff check. Checked before the fold gate below so a
    // hand that would otherwise fold still gets a shot at it.
    if (shouldBluff(profile)) {
      const maxRaise = MidnightBaseball.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) return { action: "raise", raiseDollars: scaledRaiseDollars(1, state.raiseIncrementDollars, maxRaise) };
    }

    if (!isLeader && toCallChips > 0) {
      const showing = MidnightBaseball.evaluateShowingHand(state, player.id);
      const remaining = MidnightBaseball.remainingFaceDownCount(state, player.id);
      const potOddsBonus = potOddsChanceBonus(toCallChips, state.pot);
      if (!worthPursuing(showing, best.hand, remaining, profile, potOddsBonus)) {
        return { action: "fold" };
      }
    }
    const barAdjustment = opponentCountBarAdjustment(liveOpponentCount(state.players, player.id));
    if (isLeader && worthRaisingAsLeader(player, state, profile, barAdjustment)) {
      const maxRaise = MidnightBaseball.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) {
        const showing = MidnightBaseball.evaluateShowingHand(state, player.id);
        const remaining = MidnightBaseball.remainingFaceDownCount(state, player.id);
        const tier = confidenceTier(showing.category - raiseBarForLeader(remaining, profile, barAdjustment));
        return { action: "raise", raiseDollars: scaledRaiseDollars(tier, state.raiseIncrementDollars, maxRaise) };
      }
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
    confidenceTier,
    scaledRaiseDollars,
    shouldBluff,
    opponentCountBarAdjustment,
    liveOpponentCount,
    potOddsChanceBonus,
  };
})();

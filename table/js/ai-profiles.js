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
// original three already established the range for.
//
// The Storm's tilt spiral and The Streak Chaser's hot-hand/gambler's-
// fallacy swings are genuinely STATE-DEPENDENT (they change behavior after
// a win/loss streak within a sitting) -- PROFILES below still holds each
// one's plain baseline (Storm: confident/sharp; Streak Chaser: loosely
// aggressive), but see profileForState() further down, which layers a real,
// recent-results-driven overlay on top (2026-11-23, design review finding
// #3) -- table-night.js's recentResultsByPlayerId is what makes this
// state available everywhere profileFor() already was.
const AIProfiles = (function () {
  const PROFILES = {
    cautious: {
      name: "cautious",
      label: "Cautious",
      talkativeness: 0.2, // quiet -- doesn't volunteer much (2026-11-23, design review finding #8)
      tempo: 1.1, // a hair more deliberate than baseline
      buyWildOnlyOnCategoryGain: true, // only pays for a 9 if it changes the hand's category, not just a kicker
      chancePerCard: 0.5, // how many "hand categories" of gap one more unknown flip is assumed worth closing
      // How many extra call-worthy category tiers a bet this big demands, scaled
      // by toCall/pot inside worthContinuing (2026-11-23, design review finding
      // #4) -- loss aversion (Kahneman & Tversky) "grows with stake size," so a
      // pot-sized bet should genuinely spook a tight profile, not just a flat
      // category bar that ignores how much is actually being risked.
      lossAversion: 2,
      raiseWhenLeading: false,
      bluffFrequency: 0, // never raises on a hand that doesn't actually warrant it
      reRaiseChanceAdjustment: -0.4, // a renewed raise reads as real strength worth respecting
      opponentAdaptSensitivity: 0.3,
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.TWO_PAIR, // guts games: a fully-known hand needs to be genuinely strong to risk the ante
      // Multiplies potRiskShift's "pot in antes" term (2026-11-23, design
      // review finding #5) -- a flat shift applied the same tightening to
      // every archetype regardless of how much a growing pot should
      // actually deter THIS one. Fortress-like tight profiles get more
      // than 1x (feel the escalation more); Live Wire-like loose profiles
      // get 0 (an escalating pot barely registers).
      gutsPotRiskSensitivity: 1.5,
      pressYourLuckStandThreshold: 3, // 5.5-21/7-27: stands once already within this far of either target, rather than pushing for exact
      aceyDuceyMinWinProb: 0.5, // Acey Ducey: only bets when the gap between the two shown cards looks genuinely safe
      aceyDuceyBetFraction: 0.25, // ...and even then, risks only a quarter of the pot
      blindBluffScaryRankValue: 12, // Blind Man's Bluff: folds once any visible opponent shows a Queen or better (own card is hidden, so this is the only signal there is)
      blindBluffRaiseBelowRankValue: 7, // ...and only raises when the best visible opposing card is quite low
    },
    balanced: {
      name: "balanced",
      label: "Balanced",
      talkativeness: 0.35, // matches this project's old flat QUIP_CHANCE default -- the generic baseline
      tempo: 1,
      buyWildOnlyOnCategoryGain: false,
      chancePerCard: 1,
      lossAversion: 1,
      raiseWhenLeading: true,
      raiseMinCategory: HandEvaluator.CATEGORY.TWO_PAIR, // won't raise on a lead this thin
      bluffFrequency: 0.05,
      reRaiseChanceAdjustment: -0.15,
      opponentAdaptSensitivity: 0.3,
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.PAIR,
      gutsPotRiskSensitivity: 1,
      pressYourLuckStandThreshold: 1.5,
      aceyDuceyMinWinProb: 0.3,
      aceyDuceyBetFraction: 0.5,
      blindBluffScaryRankValue: 14, // only an Ace showing among opponents scares balanced off
      blindBluffRaiseBelowRankValue: 10,
    },
    aggressive: {
      name: "aggressive",
      label: "Aggressive",
      talkativeness: 0.45,
      tempo: 0.8, // quick, doesn't linger over a decision
      buyWildOnlyOnCategoryGain: false,
      chancePerCard: 1.5,
      lossAversion: 0, // bet size doesn't change the calculus -- fits the reckless archetype
      raiseWhenLeading: true,
      raiseMinCategory: HandEvaluator.CATEGORY.PAIR, // presses even a modest lead
      bluffFrequency: 0.15,
      reRaiseChanceAdjustment: 0.1, // doesn't back down from renewed aggression
      opponentAdaptSensitivity: 0.15, // mostly plays its own game regardless of who's across the table
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.HIGH_CARD, // stays in almost every guts hand -- fits the reckless archetype
      gutsPotRiskSensitivity: 0, // an escalating pot barely registers -- fits the reckless archetype
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
      talkativeness: 0.3,
      tempo: 1.4, // visibly pauses to work out odds (2026-11-23, design review finding #8 -- also the natural home for a `thinking` quip bucket, not yet wired)
      // gameCategoryAffinity: a per-games.md-category multiplier on top of
      // TableNight's own anti-repeat picker weighting (2026-11-23, see
      // table-night.js's weightedRandomGame) -- lets an AI dealer with a
      // known archetype lean toward games.md categories that genuinely fit
      // its documented psychology (personas/players/OVERVIEW.md), without
      // ever excluding a category outright. Kept to a deliberately narrow
      // 0.5-1.6 range across the whole roster so no archetype reads as
      // "only ever plays X" -- a nudge, not a hard preference. The
      // Calculator (explicit-probability-driven, Tendler's Process Model)
      // favors the most information-dense, calculable games -- hold'em's
      // pot odds, stud's showing-hand math, Poker Scored's clean hand-rank
      // gates -- over Guts' pure-nerve, no-information escalation.
      gameCategoryAffinity: {
        "Texas Hold'em variant": 1.4,
        "Stud-based": 1.3,
        "Poker Scored": 1.3,
        "Community Stud": 1.2,
        Baseball: 1,
        Other: 0.8,
        Guts: 0.6,
      },
      buyWildOnlyOnCategoryGain: true,
      chancePerCard: 0.75,
      lossAversion: 1, // explicit-probability-driven -- a bet's actual size is itself part of the calculation
      raiseWhenLeading: true,
      raiseMinCategory: HandEvaluator.CATEGORY.TWO_PAIR,
      bluffFrequency: 0.08, // selective and purposeful even when bluffing, not never
      reRaiseChanceAdjustment: -0.2, // process-driven -- respects a genuine renewed signal
      // Lowered from 0.5 (2026-11-23, follow-up review): probability-driven
      // doesn't mean opponent-read-driven -- the Calculator's whole style is
      // computing its OWN hand's odds correctly, not primarily adjusting to
      // how loose or tight the table's been playing. The Diplomat, whose
      // entire archetype IS deliberate information-gathering, is the more
      // genuinely opponent-adaptive profile in the roster now.
      opponentAdaptSensitivity: 0.35,
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.TWO_PAIR,
      gutsPotRiskSensitivity: 1, // explicit-probability-driven -- weighs the growing pot the same way it weighs everything else
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
      talkativeness: 0.55, // talks trash and reacts loudly
      tempo: 0.6, // fast -- doesn't deliberate
      // See the-calculator's gameCategoryAffinity comment for the general
      // shape. The Live Wire (wide range, chaos over EV, illusion-of-
      // control) leans into Guts' escalating-nerve pot wars and the
      // Baseball family's chaotic wildcard-buy swings over anything that
      // rewards the Calculator's kind of disciplined, calculable play.
      gameCategoryAffinity: {
        Guts: 1.6,
        Other: 1.3,
        Baseball: 1.3,
        "Stud-based": 1,
        "Community Stud": 0.9,
        "Texas Hold'em variant": 0.7,
        "Poker Scored": 0.7,
      },
      buyWildOnlyOnCategoryGain: false,
      chancePerCard: 1.8,
      lossAversion: 0, // calls an unlimited bet with any pair -- fits "plays like a calling station" on purpose
      raiseWhenLeading: true,
      raiseMinCategory: HandEvaluator.CATEGORY.HIGH_CARD,
      bluffFrequency: 0.25, // the loosest in the roster -- "raises on nothing" is close to literal
      bluffSizing: "big", // overbets everything, bluff or not -- no reason for a bluff to look any smaller
      reRaiseChanceAdjustment: 0.3, // never backs down -- if anything, digs in harder
      opponentAdaptSensitivity: 0, // raises on nothing regardless of who's across the table -- doesn't adapt at all
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.HIGH_CARD,
      gutsPotRiskSensitivity: 0, // raises on nothing regardless of who's across the table or how big the pot's gotten
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
      talkativeness: 0.25, // minimal unprompted talk
      tempo: 1.2,
      // See the-calculator's gameCategoryAffinity comment for the general
      // shape. The Fortress (extreme loss aversion, folds anything short
      // of a near-lock) favors games it can cheaply bow out of street by
      // street -- stud's showing-hand math, Poker Scored's narrow-range
      // gates -- and most avoids Guts, whose ante-escalation structurally
      // forces repeated re-exposure every hand, the nit's nightmare.
      gameCategoryAffinity: {
        "Poker Scored": 1.4,
        "Stud-based": 1.3,
        "Community Stud": 1.2,
        "Texas Hold'em variant": 1.1,
        Baseball: 1,
        Other: 0.7,
        Guts: 0.5,
      },
      buyWildOnlyOnCategoryGain: true,
      chancePerCard: 0.3,
      lossAversion: 2, // the tightest in the roster -- a big bet should spook it the most
      raiseWhenLeading: false,
      bluffFrequency: 0, // nothing clears the bar to risk a chip, bluffed or otherwise
      reRaiseChanceAdjustment: -0.5, // folds hard to any renewed aggression -- loss aversion at its most acute
      opponentAdaptSensitivity: 0.2, // plays its own tight game regardless, but a looser table still nudges it slightly looser
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.TRIPS,
      gutsPotRiskSensitivity: 1.5, // extreme loss aversion -- feels an escalating pot more than almost anyone in the roster
      pressYourLuckStandThreshold: 4,
      aceyDuceyMinWinProb: 0.65,
      aceyDuceyBetFraction: 0.15,
      blindBluffScaryRankValue: 10,
      blindBluffRaiseBelowRankValue: 5,
    },

    // Real, state-dependent tilt spiral after a bad beat now modeled via
    // profileForState() (2026-11-23) -- this is just the baseline/"even"
    // state the overlay applies on top of: skilled and confident, a hair
    // sharper and more willing to press than Balanced, reflecting real
    // skill rather than recklessness.
    storm: {
      name: "storm",
      label: "Tilts After Bad Beats",
      talkativeness: 0.4, // baseline -- profileForState's tilt overlay bumps this up while tilted
      tempo: 1, // baseline -- profileForState's tilt overlay speeds this up while tilted
      // See the-calculator's gameCategoryAffinity comment for the general
      // shape. The Storm (skilled but combustible, spirals after perceived
      // bad luck) gravitates to the most visibly dramatic, swing-heavy
      // games -- the Baseball family's beat-the-board reversals, Guts'
      // escalating pots, hold'em's big multi-street swings -- where a bad
      // beat actually has room to be dramatic.
      gameCategoryAffinity: {
        Baseball: 1.4,
        Guts: 1.3,
        "Texas Hold'em variant": 1.2,
        Other: 1.1,
        "Stud-based": 1,
        "Community Stud": 0.9,
        "Poker Scored": 0.8,
      },
      buyWildOnlyOnCategoryGain: false,
      chancePerCard: 1.1,
      lossAversion: 1,
      raiseWhenLeading: true,
      raiseMinCategory: HandEvaluator.CATEGORY.PAIR,
      bluffFrequency: 0.1,
      reRaiseChanceAdjustment: -0.1,
      opponentAdaptSensitivity: 0.4, // skilled and confident -- reads the table for real
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.PAIR,
      // Baseline (even-keeled) value -- profileForState's tilt overlay
      // drops this to 0 after a bad beat (2026-11-23, design review
      // finding #5's own "Storm dropping to 0 while tilted" note): a
      // tilted player isn't weighing the escalating pot rationally at all.
      gutsPotRiskSensitivity: 1,
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
      talkativeness: 0.55, // running friendly patter
      tempo: 1,
      // See the-calculator's gameCategoryAffinity comment for the general
      // shape. The Diplomat (social, reads people through conversation,
      // adaptive small-ball) favors games with the most visible repeated
      // decision points to read and adapt against -- stud's showing-hand-
      // leads-betting dynamic, Community Stud's shared board, the Baseball
      // family's reveal-and-react rhythm.
      gameCategoryAffinity: {
        "Stud-based": 1.3,
        "Community Stud": 1.3,
        Baseball: 1.2,
        Other: 1,
        "Texas Hold'em variant": 1,
        "Poker Scored": 0.9,
        Guts: 0.8,
      },
      buyWildOnlyOnCategoryGain: false,
      chancePerCard: 1.1,
      lossAversion: 0.75,
      raiseWhenLeading: true,
      raiseMinCategory: HandEvaluator.CATEGORY.TWO_PAIR,
      bluffFrequency: 0.05,
      reRaiseChanceAdjustment: -0.2, // small-ball -- avoids blowing up a pot against renewed aggression
      // Raised from 0.5 to 0.6 (2026-11-23, follow-up review) -- the
      // roster's single most opponent-read-driven profile: info-gathering
      // calls exist specifically to build a read, so that read should move
      // this player's own play more than anyone else's.
      opponentAdaptSensitivity: 0.6,
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.PAIR,
      gutsPotRiskSensitivity: 0.75,
      pressYourLuckStandThreshold: 1.5,
      aceyDuceyMinWinProb: 0.3,
      aceyDuceyBetFraction: 0.4,
      blindBluffScaryRankValue: 13,
      blindBluffRaiseBelowRankValue: 10,
    },

    // Unreadable (Ivey-style): the defining trait is that bet-sizing and
    // pacing look identical whether the hand is strong or weak. This WAS a
    // trait none of these numeric bet-shape knobs could really capture --
    // but isn't anymore: `bluffSizing: "mirror"` (finding #7) and a flat
    // `tempo: 1` (finding #8) are exactly that tell-suppression, realized
    // as real behavior once bet-sizing tiers and per-profile pacing
    // existed to suppress a tell WITH. Deliberately centered dead-middle
    // of the whole roster's range otherwise: a true "textbook, gives away
    // nothing" baseline rather than leaning tight or loose either way.
    wall: {
      name: "wall",
      label: "Unreadable",
      talkativeness: 0.12, // minimal unprompted talk -- most of this archetype's own lines are about NOT talking
      tempo: 1, // a fixed, unremarkable pace is itself its tell suppression -- never faster or slower than baseline
      // See the-calculator's gameCategoryAffinity comment for the general
      // shape. The Wall (deliberate information control, a wide hidden
      // range masked behind total consistency) favors games with the most
      // private information to mask in the first place -- hold'em's deep
      // hole cards across a full multi-street hand, Community Stud's
      // private-hole-plus-shared-board split -- and least favors Guts,
      // whose binary in/out declare leaves little room for a mask at all.
      gameCategoryAffinity: {
        "Texas Hold'em variant": 1.4,
        "Community Stud": 1.3,
        "Stud-based": 1.1,
        Baseball: 1,
        "Poker Scored": 1,
        Other: 0.9,
        Guts: 0.7,
      },
      buyWildOnlyOnCategoryGain: false,
      chancePerCard: 1,
      lossAversion: 1, // dead-middle here too, matching every other textbook-steady knob
      raiseWhenLeading: true,
      raiseMinCategory: HandEvaluator.CATEGORY.TWO_PAIR,
      bluffFrequency: 0.1, // a real, unpredictable bluff rate is the whole point of "gives away nothing"
      bluffSizing: "mirror", // draws the bluff's size tier from the same spread a value raise would use -- tell suppression, realized as actual behavior now that sizing tiers exist (2026-11-23, design review finding #7)
      reRaiseChanceAdjustment: -0.1, // textbook-steady, dead-middle reaction to match
      opponentAdaptSensitivity: 0.35, // textbook-solid play reads the table without showing it
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.PAIR,
      gutsPotRiskSensitivity: 1, // dead-middle here too, matching every other textbook-steady knob
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
      talkativeness: 0.25, // explicitly immune to the result-driven social swings of #3, which now has something to contrast with
      tempo: 1.2, // deliberate, process-driven pacing
      // See the-calculator's gameCategoryAffinity comment for the general
      // shape. The Statistician (Annie Duke's "resulting" -- judges
      // decisions on process, not outcome) favors the most decision-dense,
      // analyzable games (hold'em, Poker Scored's clean hand-rank math,
      // stud/Community Stud's showing-hand math) over the luck-forward
      // "Other" grab-bag and Guts' binary declare, both thinner on the
      // kind of process worth separating from outcome.
      gameCategoryAffinity: {
        "Texas Hold'em variant": 1.4,
        "Poker Scored": 1.3,
        "Stud-based": 1.2,
        "Community Stud": 1.2,
        Baseball: 1,
        Guts: 0.7,
        Other: 0.7,
      },
      buyWildOnlyOnCategoryGain: true,
      chancePerCard: 0.9,
      lossAversion: 1, // process-driven like the Calculator -- a bet's size is real evidence, weighed the same every time
      raiseWhenLeading: true,
      raiseMinCategory: HandEvaluator.CATEGORY.TWO_PAIR,
      bluffFrequency: 0.05,
      reRaiseChanceAdjustment: -0.15, // disciplined, process-driven response to a real signal
      opponentAdaptSensitivity: 0.45, // process-driven -- updates its read on someone as evidence accumulates
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.PAIR,
      gutsPotRiskSensitivity: 1, // process-driven like the Calculator -- weighs the growing pot as real evidence
      pressYourLuckStandThreshold: 1.8,
      aceyDuceyMinWinProb: 0.35,
      aceyDuceyBetFraction: 0.4,
      blindBluffScaryRankValue: 13,
      blindBluffRaiseBelowRankValue: 10,
    },

    // Real, state-dependent hot-hand/gambler's-fallacy swings (bets bigger
    // after wins, chases losses expecting a correction) now modeled via
    // profileForState() (2026-11-23) -- this baseline is the "neither hot
    // nor due" state the overlay applies on top of, netting those two
    // opposing pulls out to "plays and bets more than a disciplined
    // player would, most of the time."
    "streak-chaser": {
      name: "streak-chaser",
      label: "Rides Streaks",
      talkativeness: 0.45,
      tempo: 0.8,
      // See the-calculator's gameCategoryAffinity comment for the general
      // shape. The Streak Chaser (hot-hand/gambler's-fallacy, believes in
      // momentum and rituals) favors games that resolve fast and often, so
      // a "streak" is actually visible and trackable hand to hand -- Guts'
      // quick escalating resolution, the "Other" grab-bag's fast rounds --
      // over hold'em's slower, more deliberate multi-street pacing.
      gameCategoryAffinity: {
        Guts: 1.4,
        Other: 1.3,
        Baseball: 1.2,
        "Stud-based": 1,
        "Community Stud": 0.9,
        "Poker Scored": 0.9,
        "Texas Hold'em variant": 0.8,
      },
      buyWildOnlyOnCategoryGain: false,
      chancePerCard: 1.3,
      lossAversion: 0.25, // a hot/due streak matters far more to this archetype than the bet's actual size
      raiseWhenLeading: true,
      raiseMinCategory: HandEvaluator.CATEGORY.PAIR,
      bluffFrequency: 0.15,
      reRaiseChanceAdjustment: 0.15, // loose enough to keep chasing rather than back off
      opponentAdaptSensitivity: 0.1, // driven by its own streaks, not by reading the table
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.HIGH_CARD,
      gutsPotRiskSensitivity: 0.25, // a hot/due streak matters far more to this archetype than how big the pot's gotten
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
      talkativeness: 0.35,
      tempo: 0.9,
      // See the-calculator's gameCategoryAffinity comment for the general
      // shape. Grounded directly in personas/subversive.md's own stated
      // favorite decision points, not just a generic guess: Boise's
      // flexible hand-construction rule ("a particular favorite... the
      // 'correct' combination is genuinely debatable"), hi-lo declares
      // (Anaconda/Omaha-family/Criss Cross), and the Baseball family's
      // priced wildcard-buy bluffing -- so hold'em, Community Stud, and
      // the "Other" grab-bag (which carries most of the hi-lo-adjacent
      // target-sum games) lead, with Baseball just behind.
      gameCategoryAffinity: {
        Other: 1.3,
        "Community Stud": 1.3,
        "Texas Hold'em variant": 1.3,
        Baseball: 1.1,
        "Stud-based": 1,
        "Poker Scored": 0.8,
        Guts: 0.8,
      },
      buyWildOnlyOnCategoryGain: false,
      chancePerCard: 1.4,
      lossAversion: 0.25, // stays in on nearly anything, by design -- bet size barely registers
      raiseWhenLeading: false,
      // With raiseWhenLeading off, bluffing and pattern-breaking are this
      // profile's only two paths to ever raising at all. bluffFrequency
      // raises baselessly (hand strength irrelevant); patternBreakRate
      // (2026-11-23, design review finding #10) is the opposite -- an
      // unpredictable chance to actually press a genuine monster hand
      // (gated by raiseMinCategory below) it would otherwise always
      // decline to, replacing the old "never raises for value, full
      // stop" rigidity (itself a fixed, perfectly predictable pattern)
      // with real unpredictability in BOTH directions.
      bluffFrequency: 0.2,
      patternBreakRate: 0.15,
      raiseMinCategory: HandEvaluator.CATEGORY.TRIPS, // only a genuine monster breaks the pattern
      reRaiseChanceAdjustment: 0, // contrarian, not predictably timid or predictably stubborn either way
      opponentAdaptSensitivity: 0.2, // some awareness, but plays unconventionally regardless of what it implies
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.HIGH_CARD,
      gutsPotRiskSensitivity: 0.25, // stays in on nearly anything, by design -- an escalating pot barely registers
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
      talkativeness: 0.3, // offers calm unsolicited perspective, but doesn't run its mouth
      tempo: 1, // identical process in a huge pot and a tiny one -- pacing is flat too, Brunson-style
      // Deliberately flat (no lean either way), unlike every other
      // archetype's gameCategoryAffinity -- the Steady Hand's whole trait
      // is treating a huge pot and a tiny one, any game at all, with
      // identical process (Brunson-style, decades of variance long since
      // internalized as normal). Indifference IS the characterization
      // here, not an oversight.
      gameCategoryAffinity: {
        Guts: 1,
        "Stud-based": 1,
        "Community Stud": 1,
        Baseball: 1,
        "Texas Hold'em variant": 1,
        "Poker Scored": 1,
        Other: 1,
      },
      buyWildOnlyOnCategoryGain: true,
      chancePerCard: 0.85,
      // A flat constant, deliberately never scaled by anything else in this
      // profile (tilt, streaks, the table's mood) -- Brunson-style, the same
      // identical process in a huge pot and a tiny one (2026-11-23, design
      // review finding #6's distinguishing mechanism for this archetype).
      lossAversion: 1,
      raiseWhenLeading: true,
      raiseMinCategory: HandEvaluator.CATEGORY.TWO_PAIR,
      bluffFrequency: 0.05,
      reRaiseChanceAdjustment: -0.05, // even-keeled, barely reacts either way
      opponentAdaptSensitivity: 0.4, // decades of internalized reads -- genuinely adapts, just doesn't show it
      gutsMinCategoryToStay: HandEvaluator.CATEGORY.PAIR,
      gutsPotRiskSensitivity: 1, // the same flat constant as lossAversion -- identical process in a huge pot and a tiny one
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

  // State-dependent profile overlays (2026-11-23, design review finding
  // #3). The Storm and Streak Chaser were previously fixed baselines
  // approximating their "average" tendency (see the file-level comment's
  // history) -- this makes their actual defining trait (oscillating after
  // bad luck; believing in streaks) genuinely react to how THIS NIGHT has
  // actually gone, via table-night.js's recentResultsByPlayerId (the last
  // ~5 hands per player: won / lostAtShowdown / folded, plus net chips).
  // Returns an ADJUSTED COPY -- the base profile object is never mutated,
  // same as every other archetype's decision functions already treat the
  // profile they're handed as plain, read-only data. `recentResults` may
  // be null/undefined/empty (a player with no history yet, or a family
  // that hasn't wired this through) and just falls back to the plain
  // base profile, so this is always safe to call everywhere profileFor
  // already was.
  const STORM_TILT_HANDS = 3; // the tilt overlay's own trigger window: how many of the most recent hands count as "recently"
  const STORM_SIGNIFICANT_LOSS_CHIPS = -4; // -$1.00 at the default 25-cent chip -- a judgment call (games.md doesn't define "significant"), not folding (folding costs little and isn't a bad beat)
  const STREAK_WINDOW_HANDS = 5;
  const STREAK_HOT_WIN_COUNT = 2; // 2+ wins in the window reads as "on a heater"
  const STREAK_DUE_LOSS_COUNT = 3; // 3+ non-wins (folded or lost at showdown) reads as "due for a correction"

  function profileForState(name, recentResults) {
    const base = profileFor(name);
    if (!recentResults || !recentResults.length) return base;

    if (name === "storm") {
      const recentWindow = recentResults.slice(-STORM_TILT_HANDS);
      const tilted = recentWindow.some((r) => r.result === "lostAtShowdown" && r.netChips <= STORM_SIGNIFICANT_LOSS_CHIPS);
      if (!tilted) return base;
      return {
        ...base,
        chancePerCard: base.chancePerCard + 0.5,
        raiseMinCategory: Math.max(HandEvaluator.CATEGORY.HIGH_CARD, base.raiseMinCategory - 1),
        bluffFrequency: base.bluffFrequency * 2,
        reRaiseChanceAdjustment: base.reRaiseChanceAdjustment + 0.3,
        opponentAdaptSensitivity: 0,
        // Design review finding #5's own note: a tilted player isn't
        // rationally weighing an escalating Guts pot at all.
        gutsPotRiskSensitivity: 0,
        // Finding #8's own "Storm faster while tilted" note: reacts
        // louder and quicker after a bad beat, not calmer and slower.
        talkativeness: Math.min(1, base.talkativeness + 0.25),
        tempo: base.tempo * 0.7,
      };
    }

    if (name === "streak-chaser") {
      const recentWindow = recentResults.slice(-STREAK_WINDOW_HANDS);
      const wins = recentWindow.filter((r) => r.result === "won").length;
      const nonWins = recentWindow.filter((r) => r.result !== "won").length;
      if (wins >= STREAK_HOT_WIN_COUNT) {
        return { ...base, raiseWhenLeading: true, bluffFrequency: base.bluffFrequency + 0.1, chancePerCard: base.chancePerCard + 0.3 };
      }
      if (nonWins >= STREAK_DUE_LOSS_COUNT) {
        return { ...base, chancePerCard: base.chancePerCard + 0.3, reRaiseChanceAdjustment: base.reRaiseChanceAdjustment + 0.1 };
      }
      return base;
    }

    return base;
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

  // 2026-11-23, design review finding #11: this used to always buy if
  // affordable, regardless of archetype -- a $1 bonus card is still a
  // speculative buy (one more chance to improve, nothing guaranteed), so
  // the roster's most loss-averse profiles (Fortress/cautious,
  // lossAversion >= 2) skip it outright, treating even a cheap gamble as
  // not worth the risk. `profile` is optional so a caller that still
  // hasn't resolved one (none currently do) keeps the old behavior
  // rather than breaking.
  function decideBuy4(player, profile) {
    if (player.wallet.chips < ChipEconomy.dollarsToChips(1)) return false;
    if (profile && profile.lossAversion >= 2) return false;
    return true;
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

  // profile.patternBreakRate (2026-11-23, design review finding #10):
  // Subversive's old "never raises for value" (raiseWhenLeading: false,
  // full stop) was itself a fixed, perfectly predictable rule -- a player
  // who only ever calls, even holding a straight flush, reads as a
  // calling station, not a genuinely creative/contrarian one. A small
  // chance to raise a monster anyway (breaking its own established
  // pattern) is wired into every raiseWhenLeading gate alongside the
  // normal check, so this archetype occasionally DOES press a real lead
  // it would otherwise always decline to -- still gated on actually
  // clearing the category bar (via whatever raiseMinCategory the profile
  // defines), so it's a genuine strong hand being pressed unpredictably,
  // not a baseless raise (that's what bluffFrequency is already for).
  function breaksPattern(profile) {
    return Math.random() < (profile.patternBreakRate || 0);
  }

  // The other two pattern-break directions finding #10 named but this
  // project only shipped one of at first ("raise a monster" via
  // breaksPattern above) -- closed out 2026-11-23 after a follow-up review
  // flagged them as still-open rather than genuinely done. Both reuse the
  // exact same patternBreakRate knob (currently only Subversive, 0.15),
  // since all three are the same underlying trait -- "plays unconventionally
  // regardless of what it implies" -- just facing in different directions:
  //
  // shouldSlowPlay: the inverse of breaksPattern's raise-a-monster case --
  // a hand that genuinely clears the raise bar (raiseWhenLeading would
  // normally press it) occasionally just calls/checks instead, the classic
  // slow-play. Callers check this ALONGSIDE the normal raiseWhenLeading
  // condition and suppress the raise when it fires, rather than pressing
  // every qualifying lead like clockwork.
  //
  // shouldHeroCall: a hand that fails worthContinuing/worthPursuing (would
  // otherwise fold) occasionally calls anyway -- a hero call against a read
  // the archetype itself doesn't actually believe. Deliberately separate
  // from shouldBluff (which RAISES on a weak hand) -- this only ever calls,
  // never raises, matching "despite a clear fold" rather than "claims a
  // lead it doesn't have."
  function shouldSlowPlay(profile) {
    return breaksPattern(profile);
  }

  function shouldHeroCall(profile) {
    return breaksPattern(profile);
  }

  // profile.bluffSizing (2026-11-23, design review finding #7) -- every
  // bluff used to raise the exact same tier-1 "plain-looking" amount
  // regardless of archetype, which was itself a tell once a whole night's
  // worth of hands had gone by (a sizing PATTERN is a tell, Caro's tell
  // theory turned around): "small" (the default, unchanged) always sizes
  // tier 1; "big" (Live Wire -- overbets everything, bluff or not) always
  // sizes tier 3; "mirror" (Wall -- "tell suppression" realized as actual
  // behavior now that bet-sizing tiers exist) draws a genuinely random
  // tier from {1,2,3}, the same spread a real value raise could land on,
  // so a bluff's size alone can never give it away.
  function bluffRaiseTier(profile) {
    const sizing = profile.bluffSizing || "small";
    if (sizing === "big") return 3;
    if (sizing === "mirror") return 1 + Math.floor(Math.random() * 3);
    return 1;
  }

  // presentationStyle (2026-11-24, closing the archetype design review's
  // last open item for Anaconda's reveal order): reuses profile.bluffSizing
  // -- already modeling "how this archetype presents strength" for bet
  // sizing -- as the same trait for which of a hand's 5 kept cards get
  // revealed first in Anaconda's "roll your own" rounds. "conceal" (every
  // profile with the default "small" sizing) is the existing behavior:
  // reveal weak/ungrouped cards first, hold groups and any Joker back.
  // "flaunt" (Live Wire's "big") reverses that -- show strength early to
  // see who flinches, matching live-wire.md's own stated instinct. "mask"
  // (the Wall's "mirror") shuffles the reveal order randomly instead of
  // reversing it, since a reversed order is itself a readable pattern --
  // wall.md explicitly calls for suppressing tells "not by reversing the
  // signals," so a genuinely random order is the one that can't be read
  // either way.
  function presentationStyle(profile) {
    const sizing = (profile && profile.bluffSizing) || "small";
    if (sizing === "big") return "flaunt";
    if (sizing === "mirror") return "mask";
    return "conceal";
  }

  // profile.tempo (2026-11-23, design review finding #8): a per-archetype
  // multiplier on the delay before an AI acts -- previously every AI
  // paused for the exact same flat delay regardless of archetype, even
  // though this doc describes the Calculator's visible pause to work out
  // odds and the Live Wire's snap decisions. Every session-*.js's own
  // sleep(ms) already routes through TableFX.paceDelay so the 1x/2x/
  // Turbo speed setting still applies on top of this -- tempo scales the
  // BASE delay passed in, it doesn't replace that scaling. Looked up by
  // profileName (not a resolved profile object) so call sites that
  // haven't resolved the real decision-affecting profile yet (most of
  // them resolve it via profileForState AFTER their own sleep call) don't
  // need to be reordered just to read this one field.
  // Real bug, caught by a follow-up review (2026-11-23): this originally
  // called plain profileFor(profileName), which meant Storm's own tilt
  // overlay (#3's profileForState -- "Storm faster while tilted") could
  // never actually reach a real delay: the overlay's tempo field was
  // computed correctly, but nothing here ever read it, only the flat
  // baseline. Takes the same `recentResults` shape profileForState
  // already expects (a specific player's own last ~5 hands, or
  // null/undefined) so a tilted Storm genuinely acts faster, not just on
  // paper.
  function tempoFor(profileName, recentResults) {
    const profile = profileForState(profileName, recentResults);
    return (profile && profile.tempo) || 1;
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

  function liveOpponentIds(players, selfId) {
    return players.filter((p) => !p.folded && p.id !== selfId).map((p) => p.id);
  }

  // Genuine cross-hand opponent modeling (2026-08-29) -- the first real
  // exception anywhere in this project to "every AI decision is a pure
  // function of current game state." opponentStats is
  // table-night.js's playerBettingStats: {[playerId]: {decisions, folds,
  // calls, raises}}, accumulated across every hand of every game played
  // this WHOLE NIGHT, not reset per hand or per game -- passed through as
  // state.opponentStats by every session-*.js that reports betting
  // actions. Deliberately just a live reference, read fresh every call;
  // this module never mutates or snapshots it.
  //
  // MIN_SAMPLE_SIZE guards against overreacting to an opponent's first
  // couple of decisions early in the night, before their tendency means
  // anything. Only counts opponents who've cleared it; with nobody
  // qualifying yet (the common case early in a night), this returns 0 --
  // exactly like the "no adjustment" case, not a crash or a wrong guess.
  const MIN_SAMPLE_SIZE = 5;

  // profile.opponentAdaptSensitivity (0 = doesn't adapt at all, e.g. Live
  // Wire, whose whole character is raising regardless of who's across the
  // table; up to ~0.5 for genuinely read-driven archetypes like The
  // Calculator) scales how much a live opponent's own fold rate this
  // night shifts this player's willingness to keep pursuing a hand.
  // avgLooseness is centered on 0.5 (a coin-flip fold rate is "neutral");
  // a table playing looser than that (opponents folding less than half
  // the time) nudges this player a little looser too -- there's more
  // "live" money in the pot and less reason to read a random call as
  // strength. A table playing tighter nudges the other way -- someone
  // who's actually still in, against players who mostly fold, means more.
  // Returned in the same additive, fractional units as
  // potOddsChanceBonus/reRaiseChanceAdjustment so every caller just sums
  // all three into one chanceBonus term.
  function opponentLoosenessAdjustment(opponentStats, liveOpponentIdsList, profile) {
    const sensitivity = profile.opponentAdaptSensitivity || 0;
    if (!sensitivity || !opponentStats || !liveOpponentIdsList || !liveOpponentIdsList.length) return 0;
    const loosenessReads = liveOpponentIdsList
      .map((id) => opponentStats[id])
      .filter((s) => s && s.decisions >= MIN_SAMPLE_SIZE)
      .map((s) => 1 - s.folds / s.decisions);
    if (!loosenessReads.length) return 0;
    const avgLooseness = loosenessReads.reduce((a, b) => a + b, 0) / loosenessReads.length;
    return (avgLooseness - 0.5) * sensitivity;
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

  // Loss aversion "grows with stake size" (2026-11-23, design review
  // finding #4) -- a flat CALL_WORTHY_CATEGORY bar read the exact same way
  // facing a $1 bet into a $20 pot as it did facing a $20 bet into a $1
  // pot, so the tightest archetype in the roster called an unlimited
  // hold'em bet with any pair, board-shared pairs included. Raises the
  // call-worthy bar by `floor(lossAversion * toCall / potBeforeCall)`
  // tiers -- a bet that's cheap relative to the pot barely moves the bar;
  // a genuinely pot-sized or larger bet moves it several tiers for a
  // profile with real lossAversion, and not at all for one with none
  // (Live Wire, Aggressive). `potBeforeCall` is `state.pot` at the moment
  // of the decision, the same "pot before this call" convention
  // potOddsChanceBonus already uses.
  // Real bug, caught by a follow-up review (2026-11-23), confirmed by
  // direct simulation: a flat lossAversion shift, applied with no regard
  // for how much of the hand is still left to develop, made the tightest
  // archetypes fold EVERY unpaired preflop hand in hold'em facing just the
  // big blind -- preflop's own blind-to-pot ratio is structurally lopsided
  // (toCall/pot is roughly 0.67 every single hand, purely from the ante
  // mechanic, regardless of any real aggression), which was enough on its
  // own to push the bar up a tier and fold a hand that would otherwise
  // have cleared it easily with 5 cards still to come (Fortress folded
  // 50/50 simulated trials). `cardsLeft` is the same "how many
  // cards/streets/reveals remain" value every caller already has in scope
  // for its own worthContinuing check -- loss aversion should bind
  // hardest once a bet is a late, closer-to-fully-informed signal, not an
  // early one with a lot of the hand still unknown. Optional: a caller
  // with no meaningful version of that signal (Anaconda, whose own hand
  // is always already fully fixed by the time this runs -- see
  // ai-anaconda-profiles.js's own comment) gets the original,
  // undiscounted behavior.
  function callWorthyCategoryFor(baseCategory, profile, toCallChips, potBeforeCall, cardsLeft) {
    if (!profile.lossAversion || toCallChips <= 0 || potBeforeCall <= 0) return baseCategory;
    const earlyDiscount = cardsLeft != null && cardsLeft >= 3 ? 0.5 : 1;
    const shift = Math.floor((profile.lossAversion * toCallChips * earlyDiscount) / potBeforeCall);
    return Math.min(HandEvaluator.CATEGORY.STRAIGHT_FLUSH, baseCategory + shift);
  }

  // A shallow, one-hand-deep reaction: is this player facing a raise AFTER
  // already putting some chips into THIS SAME betting round? Genuinely
  // different from just "toCallChips > 0" (which is also true on a
  // player's very first action of a round, with nobody having pushed back
  // on them specifically yet) -- this only fires once someone has raised
  // OVER a bet this player already committed to, the actual "I got
  // re-raised" moment. Reads straight off the current hand's own
  // betting-round state (round.committed), so it stays a pure function of
  // current game state -- no cross-hand memory needed, unlike genuine
  // opponent modeling (deliberately NOT attempted here; see CLAUDE.md).
  function facingReRaise(round, playerId) {
    const committed = round.committed[playerId] || 0;
    const toCall = round.currentBetChips - committed;
    return committed > 0 && toCall > 0;
  }

  // profile.reRaiseChanceAdjustment: additive, same fractional units as
  // chancePerCard/potOddsChanceBonus. Negative for timid archetypes (a
  // renewed raise reads as real strength worth respecting, tightening the
  // effective fold bar), zero/slightly positive for archetypes that dig in
  // rather than back down. Returns 0 outright when facingReRaise is false,
  // so callers can add this unconditionally alongside potOddsChanceBonus
  // without a separate branch.
  function reRaiseChanceAdjustment(round, playerId, profile) {
    if (!facingReRaise(round, playerId)) return 0;
    return profile.reRaiseChanceAdjustment || 0;
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
    // Real gap, reported directly (2026-11-23): this used to judge every
    // remaining flip as equally likely to help, blind to the family's own
    // buyable wilds (3s/9s) and bonus-card buys (4s) -- see
    // baseball-family-wildcards.js's wildcardChanceBonus for the full
    // reasoning, grounded in the user's own point that keeping a moderate
    // hand in the game a bit longer is the actual DESIGN PURPOSE of
    // having wilds and flip-ups at all, not just an edge case to tune
    // around.
    const chanceBonus = typeof BaseballWildcards !== "undefined" ? BaseballWildcards.wildcardChanceBonus(state) : 0;
    return worthPursuing(showing, board, remaining, profile, chanceBonus);
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
    if (!profile.raiseWhenLeading && !breaksPattern(profile)) return false;
    const showing = MidnightBaseball.evaluateShowingHand(state, player.id);
    const remaining = MidnightBaseball.remainingFaceDownCount(state, player.id);
    const clearsBar = showing.category >= raiseBarForLeader(remaining, profile, barAdjustment);
    // Slow-play: a lead that genuinely clears the bar occasionally just
    // gets called/checked instead of pressed (design review finding #10).
    if (clearsBar && profile.raiseWhenLeading && shouldSlowPlay(profile)) return false;
    return clearsBar;
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
      if (maxRaise > 0) return { action: "raise", raiseDollars: scaledRaiseDollars(bluffRaiseTier(profile), state.raiseIncrementDollars, maxRaise) };
    }

    if (!isLeader && toCallChips > 0) {
      const showing = MidnightBaseball.evaluateShowingHand(state, player.id);
      const remaining = MidnightBaseball.remainingFaceDownCount(state, player.id);
      // Real bug, reported directly (2026-11-23): a player facing a bet
      // during a betting round -- which can happen before they've ever
      // flipped a single one of their own cards -- judged `showing`
      // (artificially weak or literally empty for anyone who hasn't had
      // their own reveal turn yet) against the board with no credit for
      // the family's own buyable wilds/bonus draws still to come, even
      // though decideContinue (this same "worth chasing" question, just
      // asked from the player's OWN reveal-turn instead of a betting
      // round) already got this fix. Ingrid folded with all 5 cards still
      // face-down, having never taken a single card -- the same
      // wildcardChanceBonus term decideContinue uses belongs here too,
      // since it's the identical signal either way: the family's wilds
      // and flip-up bonuses exist specifically to keep a moderate hand in
      // the game a bit longer, not just for the self-reveal case.
      const wildcardBonus = typeof BaseballWildcards !== "undefined" ? BaseballWildcards.wildcardChanceBonus(state) : 0;
      const chanceBonus =
        potOddsChanceBonus(toCallChips, state.pot) +
        reRaiseChanceAdjustment(br, player.id, profile) +
        opponentLoosenessAdjustment(state.opponentStats, liveOpponentIds(state.players, player.id), profile) +
        wildcardBonus;
      if (!worthPursuing(showing, best.hand, remaining, profile, chanceBonus)) {
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
    profileForState,
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
    bluffRaiseTier,
    presentationStyle,
    tempoFor,
    breaksPattern,
    shouldSlowPlay,
    shouldHeroCall,
    opponentCountBarAdjustment,
    liveOpponentCount,
    liveOpponentIds,
    callWorthyCategoryFor,
    potOddsChanceBonus,
    facingReRaise,
    reRaiseChanceAdjustment,
    opponentLoosenessAdjustment,
  };
})();

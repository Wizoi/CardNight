"use strict";

// Config for Wild in Your Hand (see rules-wild-in-your-hand.js for the engine itself).
// Not a shared-engine family like game-configs-guts.js's four games -- this
// is the one config object for WildInYourHandRules's own bespoke engine.
const WILD_IN_YOUR_HAND_CONFIG = {
  id: "wildInYourHand",
  name: "Wild in Your Hand",
  jokerCount: 2, // always 2 Jokers for this game specifically -- not the opt-in dealer's-choice toggle the other Joker-eligible games use
  // categoryShift -- RE-SWEPT 2026-11-23 after a follow-up review caught a
  // real convergence regression the original 2026-09-13 tuning (described
  // below, now stale) never anticipated: the same day's design review
  // finding #5 (gutsPotRiskSensitivity + a per-profile bluff-to-stay
  // chance) was wired into this game's decideDeclare identically to every
  // other Guts game, but never re-verified against THIS game's own shift
  // value afterward. Reproduced directly: with the original shift=2, a
  // mixed-roster cycle's antePoolChips compounds roughly x4 every round it
  // stays unresolved (every losing stayer matches the full just-contested
  // pool) and essentially never reaches a solo winner any more -- in a
  // fast re-sweep (8-25 trials per candidate, each capped at 25 rounds with
  // an early bail once the pool passed a clearly-runaway $3,000, to avoid
  // the same exponential pool growth making a genuinely stalled trial cost
  // more and more real compute every round it doesn't resolve): shift=2
  // resolved as few as 0/8 trials at some player counts; shift=4 came
  // close but still failed 19/25 and 24/25 at a couple of counts (not
  // reliable); shift=5 was the first value to resolve 100/100 trials
  // across every player count (5-8), averaging a believable 1.0-2.4 rounds
  // (max up to 9) -- not the "too quick" degenerate end the original
  // sweep's shift=4/5 readings were, since the bluff-to-stay addition
  // itself now contributes some of the escalation texture a flat bar used
  // to provide alone.
  //
  // Original 2026-09-13 reasoning, kept for context (methodology still
  // applies, numbers are now stale): swept 10 mixed-player-count trials
  // per candidate shift (0-5), each up to 40 rounds, BEFORE finding #5's
  // additions existed: shift=0 never resolved (0/10); shift=1 resolved
  // about half the time (5/10, avg 16.2 rounds); shift=2 was then the
  // first value to reliably resolve every trial (10/10, avg 4.0 rounds).
  // This game's 3 flat-bet-or-fold rows already thin the field before the
  // declare even happens, so a lower shift than the ante-only Guts games
  // (no such pre-filter) is still expected in principle -- shift=5 simply
  // turned out to be where that's actually true again post-finding-#5.
  categoryShift: 5,
};

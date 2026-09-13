"use strict";

// Config for Honest Guts (see rules-honest-guts.js for the engine itself).
// Not a shared-engine family like game-configs-guts.js's four games -- this
// is the one config object for HonestGutsRules's own bespoke engine.
const HONEST_GUTS_CONFIG = {
  id: "honestGuts",
  name: "Honest Guts",
  jokerCount: 2, // always 2 Jokers for this game specifically -- not the opt-in dealer's-choice toggle the other Joker-eligible games use
  // categoryShift, empirically swept the same way as every other Guts
  // config's own shift (see ai-honest-guts-profiles.js/game-configs-guts.js
  // for the methodology): a 7-card hand with up to 3 accumulated wild ranks
  // (plus a possible communal Joker) by the time of the final declare
  // clears a low category bar often enough that a flat bar would make the
  // escalating cycle struggle to ever reach a solo winner without one. Swept
  // 10 mixed-player-count trials per candidate shift (0-5), each up to 40
  // rounds: shift=0 never resolved at all (0/10); shift=1 only resolved
  // about half the time (5/10, avg 16.2 rounds when it did); shift=2 was the
  // first value to reliably resolve every trial (10/10, avg 4.0 rounds -- a
  // believable escalation, not degenerate); shift=4/5 also always resolved
  // but averaged just 1.1-1.6 rounds, too quick to read as a real "pot
  // escalates" experience (the same "too quick" call this project's other
  // Guts shift sweeps already made). Also worth noting: this game's 3
  // flat-bet-or-fold rounds already thin the field before the declare even
  // happens, so a lower shift than the ante-only Guts games (which have no
  // such pre-filter) is expected, not a red flag.
  categoryShift: 2,
};

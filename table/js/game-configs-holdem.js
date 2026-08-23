"use strict";

// Config objects turning the shared HoldemRules engine into specific games
// (games.md's Omaha / Seattle / Boise / Jersey Hold'em entry). Betting
// uses this family's own house rule (games.md: "$0.50 small blind, $1 big
// blind, no cap on bet size") rather than the shared ante/raise/max-bet
// `settings` object every other family reads -- a genuinely different
// betting shape, so it's config here instead.
const HOLDEM_BETTING_DEFAULTS = {
  smallBlindDollars: 0.5,
  bigBlindDollars: 1,
  raiseIncrementDollars: 1, // a flat simplification of "minimum raise = size of the previous bet/raise" -- see rules-holdem.js
  maxBetDollars: Infinity, // "no cap on bet size" -- rules-holdem.js's HOLDEM_MAX_RAISES_PER_STREET is what actually bounds a betting round now
};

const OMAHA_CONFIG = Object.assign(
  {
    id: "omaha",
    name: "Omaha",
    holeCards: 4,
    handSplits: [{ holeCount: 2, boardCount: 3 }], // "matches the documented standard exactly"
    hiLo: true,
  },
  HOLDEM_BETTING_DEFAULTS
);

const SEATTLE_CONFIG = Object.assign(
  {
    id: "seattle",
    name: "Seattle",
    holeCards: 4,
    handSplits: [{ holeCount: 3, boardCount: 2 }],
    hiLo: true,
  },
  HOLDEM_BETTING_DEFAULTS
);

const BOISE_CONFIG = Object.assign(
  {
    id: "boise",
    name: "Boise",
    holeCards: 4,
    // Flexible construction: whichever split (2 hole/3 board, or 3 hole/2
    // board) makes the better hand -- HoldemRules tries every combo across
    // BOTH splits and keeps the best, which is exactly what "player's
    // choice at showdown" amounts to for a hand that's always played to
    // its own best advantage anyway.
    handSplits: [
      { holeCount: 2, boardCount: 3 },
      { holeCount: 3, boardCount: 2 },
    ],
    hiLo: true,
  },
  HOLDEM_BETTING_DEFAULTS
);

const JERSEY_HOLDEM_CONFIG = Object.assign(
  {
    id: "jerseyHoldem",
    name: "Jersey Hold'em",
    holeCards: 5, // the one difference from Boise -- otherwise identical flexible construction
    handSplits: [
      { holeCount: 2, boardCount: 3 },
      { holeCount: 3, boardCount: 2 },
    ],
    hiLo: true,
  },
  HOLDEM_BETTING_DEFAULTS
);

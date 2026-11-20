"use strict";

// Config for Mexican Sweat, run through its own MexicanSweatRules engine
// (not the shared stud engine — see rules-mexican-sweat.js for why). A
// flip-up KILL card (not a wildcard -- see rules-mexican-sweat.js's
// 2026-11-20 note) is dealer's-choice-per-hand; this picks it on as the
// concrete default, fixed for the whole hand once revealed.
const MEXICAN_SWEAT_CONFIG = {
  id: "mexicanSweat",
  name: "Mexican Sweat",
  killCard: true,
};

"use strict";

// Config for Mexican Sweat, run through its own MexicanSweatRules engine
// (not the shared stud engine — see rules-mexican-sweat.js for why).
// games.md leaves the wildcard choice as dealer's-choice-per-hand; this
// picks the flip-up-wildcard option as the concrete default, fixed for the
// whole hand once revealed.
const MEXICAN_SWEAT_CONFIG = {
  id: "mexicanSweat",
  name: "Mexican Sweat",
  flipWildcard: true,
};

"use strict";

// Covers the 2026-11-23 archetype design review's finding #7: every
// archetype's bluff raise sized the exact same flat tier-1 ("plain-
// looking") amount, so a sizing pattern was itself a tell once enough
// hands had gone by (every value raise scales 1x/1x/2x/4x by confidence,
// but a bluff never did). Adds a per-profile `bluffSizing` field --
// "small" (default, unchanged tier 1), "big" (Live Wire: always
// overbets, bluff or not), "mirror" (Wall: draws a genuinely random tier
// from the same {1,2,3} spread a real value raise could land on, so its
// bluff's size alone can never give it away).

const { load } = require("./harness");
const { makeChecker } = require("./check");

function run() {
  const { check, summary } = makeChecker();
  const { AIProfiles } = load(["deck.js", "hand-evaluator.js", "ai-profiles.js"], ["AIProfiles"]);

  // --- Default ("small") sizing: always tier 1 ---
  const defaultProfile = { name: "test" };
  for (let i = 0; i < 20; i++) {
    check("a profile with no bluffSizing always sizes tier 1 ('small', the default)", AIProfiles.bluffRaiseTier(defaultProfile) === 1);
  }

  // --- "big" sizing: always tier 3 ---
  const bigProfile = { name: "test", bluffSizing: "big" };
  for (let i = 0; i < 20; i++) {
    check("a 'big' profile always sizes tier 3 (overbets, bluff or not)", AIProfiles.bluffRaiseTier(bigProfile) === 3);
  }

  // --- "mirror" sizing: a genuinely random tier from {1, 2, 3} ---
  const mirrorProfile = { name: "test", bluffSizing: "mirror" };
  const seenTiers = new Set();
  const TRIALS = 500;
  for (let i = 0; i < TRIALS; i++) {
    const tier = AIProfiles.bluffRaiseTier(mirrorProfile);
    check(`'mirror' sizing always returns a valid tier (got ${tier})`, tier === 1 || tier === 2 || tier === 3);
    seenTiers.add(tier);
  }
  check("over many trials, 'mirror' sizing produces all 3 possible tiers (not secretly fixed)", seenTiers.size === 3);

  // --- Real profile data: Wall mirrors, Live Wire overbets, everyone else defaults ---
  check("Wall's bluffSizing is 'mirror'", AIProfiles.profileFor("wall").bluffSizing === "mirror");
  check("Live Wire's bluffSizing is 'big'", AIProfiles.profileFor("live-wire").bluffSizing === "big");
  const smallByDefault = ["cautious", "balanced", "aggressive", "the-calculator", "fortress", "storm", "diplomat", "statistician", "streak-chaser", "subversive", "steady-hand"];
  for (const name of smallByDefault) {
    const profile = AIProfiles.profileFor(name);
    check(`${name}: no explicit bluffSizing (defaults to 'small')`, profile.bluffSizing === undefined);
    check(`${name}: bluffRaiseTier resolves to the 'small' default (tier 1)`, AIProfiles.bluffRaiseTier(profile) === 1);
  }

  // --- The review's own suggested test: over many trials, the Wall's
  // bluff sizes match the real spread value raises use (confidenceTier's
  // own {1,2,3} range -- 0 is excluded there too, since a raise is never
  // sized for a hand that doesn't clear the bar at all). ---
  const wall = AIProfiles.profileFor("wall");
  const wallTiers = new Set();
  for (let i = 0; i < TRIALS; i++) wallTiers.add(AIProfiles.bluffRaiseTier(wall));
  check("the Wall's own bluff sizing produces the full {1,2,3} spread, matching a real value raise's own tier range", wallTiers.size === 3);

  return summary("ai-bluff-sizing");
}

if (require.main === module) process.exit(run());
module.exports = { run };

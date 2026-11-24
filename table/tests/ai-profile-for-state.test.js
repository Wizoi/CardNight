"use strict";

// Covers the 2026-11-23 archetype design review's finding #3:
// AIProfiles.profileForState overlays Storm's "tilts after a bad beat" and
// Streak Chaser's "rides hot/cold streaks" labels with real per-hand
// behavior, read off table-night.js's recentResultsByPlayerId (plain data,
// no DOM/localStorage -- see layer-boundary.test.js). Previously both
// archetypes carried flavor-text labels ("Sharp (untilted)"/"Streaky
// (avg.)") with zero behavioral difference from their base profile.

const { load } = require("./harness");
const { makeChecker } = require("./check");

function result(outcome, netChips) {
  return { result: outcome, netChips };
}

function run() {
  const { check, summary } = makeChecker();
  const { AIProfiles, HandEvaluator } = load(["hand-evaluator.js", "ai-profiles.js"], ["AIProfiles", "HandEvaluator"]);

  const stormBase = AIProfiles.profileFor("storm");
  const streakBase = AIProfiles.profileFor("streak-chaser");

  // --- No recentResults (null/empty) returns the plain base profile for every archetype ---
  for (const name of Object.keys(AIProfiles.PROFILES)) {
    const withNull = AIProfiles.profileForState(name, null);
    const withEmpty = AIProfiles.profileForState(name, []);
    check(`${name}: null recentResults returns the exact base profile`, withNull === AIProfiles.profileFor(name));
    check(`${name}: empty recentResults returns the exact base profile`, withEmpty === AIProfiles.profileFor(name));
  }

  // --- Storm: tilts after a significant showdown loss within the last 3 hands ---
  const stormTilted = AIProfiles.profileForState("storm", [
    result("won", 4),
    result("lostAtShowdown", -4), // exactly at the -$1.00 significant-loss threshold
    result("folded", -1),
  ]);
  check("storm tilts after a showdown loss of exactly -4 chips within the last 3 hands", stormTilted !== stormBase);
  check("tilted storm: chancePerCard raised", stormTilted.chancePerCard === stormBase.chancePerCard + 0.5);
  check(
    "tilted storm: raiseMinCategory lowered by 1, floored at HIGH_CARD",
    stormTilted.raiseMinCategory === Math.max(HandEvaluator.CATEGORY.HIGH_CARD, stormBase.raiseMinCategory - 1)
  );
  check("tilted storm: bluffFrequency doubled", stormTilted.bluffFrequency === stormBase.bluffFrequency * 2);
  check(
    "tilted storm: reRaiseChanceAdjustment bumped up",
    stormTilted.reRaiseChanceAdjustment === stormBase.reRaiseChanceAdjustment + 0.3
  );
  check("tilted storm: opponentAdaptSensitivity zeroed (not reading the table while tilted)", stormTilted.opponentAdaptSensitivity === 0);

  // A fold-only loss is not a bad beat -- folding costs little and was a
  // choice, not a loss at showdown -- so it must not tilt Storm even if
  // the chip loss itself is large.
  const stormFoldOnly = AIProfiles.profileForState("storm", [result("folded", -10)]);
  check("storm does NOT tilt from a fold-only loss, regardless of chip size", stormFoldOnly === stormBase);

  // A showdown loss that doesn't clear the "significant" bar doesn't tilt either.
  const stormSmallLoss = AIProfiles.profileForState("storm", [result("lostAtShowdown", -3)]);
  check("storm does NOT tilt from a showdown loss smaller than the significant-loss threshold", stormSmallLoss === stormBase);

  // The trigger only looks at the last 3 hands -- an old bad beat outside
  // that window must not keep tilting Storm forever.
  const stormExpired = AIProfiles.profileForState("storm", [
    result("lostAtShowdown", -8), // the bad beat, now 4 hands ago
    result("won", 1),
    result("won", 1),
    result("won", 1),
  ]);
  check("storm's tilt expires once the bad beat falls outside the last 3 hands", stormExpired === stormBase);

  // --- Streak Chaser: hot after 2+ wins in the last 5 hands ---
  const streakHot = AIProfiles.profileForState("streak-chaser", [
    result("folded", -1),
    result("won", 2),
    result("lostAtShowdown", -2),
    result("won", 3),
  ]);
  check("streak chaser rides a hot streak after 2+ wins in the last 5 hands", streakHot !== streakBase);
  check("hot streak chaser: raiseWhenLeading forced on", streakHot.raiseWhenLeading === true);
  check("hot streak chaser: bluffFrequency bumped", streakHot.bluffFrequency === streakBase.bluffFrequency + 0.1);
  check("hot streak chaser: chancePerCard bumped", streakHot.chancePerCard === streakBase.chancePerCard + 0.3);

  // --- Streak Chaser: due for a correction after 3+ non-wins in the window ---
  const streakDue = AIProfiles.profileForState("streak-chaser", [
    result("lostAtShowdown", -2),
    result("folded", -1),
    result("won", 1),
    result("lostAtShowdown", -3),
  ]);
  check("streak chaser feels due after 3+ non-wins in the last 5 hands", streakDue !== streakBase);
  check("due streak chaser: chancePerCard bumped (chasing the correction)", streakDue.chancePerCard === streakBase.chancePerCard + 0.3);
  check(
    "due streak chaser: reRaiseChanceAdjustment bumped",
    streakDue.reRaiseChanceAdjustment === streakBase.reRaiseChanceAdjustment + 0.1
  );
  check("due streak chaser does NOT also get the hot overlay's raiseWhenLeading force", streakDue.raiseWhenLeading === streakBase.raiseWhenLeading);

  // Neither 2 wins nor 3 non-wins reached yet -- plain base profile.
  const streakNeutral = AIProfiles.profileForState("streak-chaser", [result("won", 1), result("lostAtShowdown", -1)]);
  check("streak chaser with neither threshold crossed returns the plain base profile", streakNeutral === streakBase);

  // Only the last 5 hands count -- a hot run that's since aged out must not linger.
  const streakStaleHot = AIProfiles.profileForState("streak-chaser", [
    result("won", 1),
    result("won", 1),
    result("lostAtShowdown", -1),
    result("lostAtShowdown", -1),
    result("lostAtShowdown", -1),
    result("lostAtShowdown", -1),
  ]);
  // Last 5 of this 6-hand array: won,lost,lost,lost,lost -- 1 win (not hot), 4 non-wins (due).
  check("a hot streak that's aged out of the 5-hand window no longer reads as hot", streakStaleHot.raiseWhenLeading === streakBase.raiseWhenLeading);
  check("the same window instead now reads as due (4 non-wins)", streakStaleHot.chancePerCard === streakBase.chancePerCard + 0.3);

  // --- Every other archetype is unaffected by recentResults entirely ---
  for (const name of Object.keys(AIProfiles.PROFILES)) {
    if (name === "storm" || name === "streak-chaser") continue;
    const base = AIProfiles.profileFor(name);
    const withHistory = AIProfiles.profileForState(name, [result("lostAtShowdown", -10), result("lostAtShowdown", -10)]);
    check(`${name}: unaffected by recentResults (only storm/streak-chaser read it)`, withHistory === base);
  }

  // --- Base PROFILES objects are never mutated by building an overlay ---
  const stormBaseAfter = AIProfiles.profileFor("storm");
  check("building a tilted overlay doesn't mutate the base storm profile", stormBaseAfter.chancePerCard === stormBase.chancePerCard);
  check("the tilted overlay is a distinct object from the base", stormTilted !== AIProfiles.profileFor("storm"));

  return summary("ai-profile-for-state");
}

if (require.main === module) process.exit(run());
module.exports = { run };

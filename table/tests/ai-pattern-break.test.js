"use strict";

// Covers the 2026-11-23 archetype design review's finding #10: the
// Subversive's "unpredictability" was itself a fixed, perfectly
// predictable rule -- raiseWhenLeading: false meant it NEVER raised for
// value in any family, holding a straight flush, it just called. Adds
// AIProfiles.breaksPattern(profile) (profile.patternBreakRate -- 0 for
// every archetype except Subversive, 0.15), wired into every
// raiseWhenLeading gate across the project alongside the normal check,
// so Subversive occasionally DOES press a real lead (gated on actually
// clearing whatever category bar the family uses) instead of always
// declining to.

const { load } = require("./harness");
const { makeChecker } = require("./check");

function run() {
  const { check, summary } = makeChecker();
  const { AIProfiles, HandEvaluator } = load(["deck.js", "hand-evaluator.js", "ai-profiles.js"], ["AIProfiles", "HandEvaluator"]);

  // --- breaksPattern unit behavior ---
  check("breaksPattern never fires for a profile with no patternBreakRate", !AIProfiles.breaksPattern({}));
  for (let i = 0; i < 50; i++) {
    check("breaksPattern never fires with patternBreakRate: 0", AIProfiles.breaksPattern({ patternBreakRate: 0 }) === false);
  }
  let fires = 0;
  const TRIALS = 2000;
  for (let i = 0; i < TRIALS; i++) {
    if (AIProfiles.breaksPattern({ patternBreakRate: 1 })) fires++;
  }
  check("breaksPattern always fires with patternBreakRate: 1", fires === TRIALS);

  // --- Real profile data ---
  const subversive = AIProfiles.profileFor("subversive");
  check("Subversive has a real, nonzero patternBreakRate", typeof subversive.patternBreakRate === "number" && subversive.patternBreakRate > 0);
  check("Subversive still has raiseWhenLeading: false (the pattern it's breaking)", subversive.raiseWhenLeading === false);
  check("Subversive's raiseMinCategory is a genuine monster bar (TRIPS), not a token value", subversive.raiseMinCategory === HandEvaluator.CATEGORY.TRIPS);

  for (const name of Object.keys(AIProfiles.PROFILES)) {
    if (name === "subversive") continue;
    const profile = AIProfiles.profileFor(name);
    check(`${name}: no patternBreakRate (defaults to never breaking its own pattern)`, !profile.patternBreakRate);
  }

  // --- Observed behavior: with patternBreakRate forced to 1, a profile
  // with raiseWhenLeading: false now presses a genuine monster hand via
  // the shared raise-gate shape every family uses (profile.raiseWhenLeading
  // || AIProfiles.breaksPattern(profile)) && handClearsBar. ---
  const neverBreaks = { ...subversive, patternBreakRate: 0 };
  const alwaysBreaks = { ...subversive, patternBreakRate: 1 };
  const gateFires = (profile, handCategory) => (profile.raiseWhenLeading || AIProfiles.breaksPattern(profile)) && handCategory >= profile.raiseMinCategory;
  check(
    "a monster hand (STRAIGHT_FLUSH) never presses with patternBreakRate 0 (raiseWhenLeading still false)",
    gateFires(neverBreaks, HandEvaluator.CATEGORY.STRAIGHT_FLUSH) === false
  );
  check(
    "the identical monster hand DOES press once patternBreakRate guarantees the break (the actual behavior change)",
    gateFires(alwaysBreaks, HandEvaluator.CATEGORY.STRAIGHT_FLUSH) === true
  );
  check(
    "a hand that doesn't even clear the TRIPS bar still never presses, even with the pattern-break guaranteed (not a baseless raise)",
    gateFires(alwaysBreaks, HandEvaluator.CATEGORY.PAIR) === false
  );

  return summary("ai-pattern-break");
}

if (require.main === module) process.exit(run());
module.exports = { run };

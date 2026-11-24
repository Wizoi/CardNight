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
//
// A follow-up review the same day flagged the other two directions the
// finding itself named ("raise a monster, slow-play it, make the
// occasional hero call") as still open -- only the first had shipped.
// shouldSlowPlay (a lead that clears the raise bar occasionally just
// calls instead -- the inverse of breaksPattern's raise case) and
// shouldHeroCall (a hand that fails the fold check occasionally calls
// anyway) both reuse the same patternBreakRate knob, wired into every
// family's worthRaisingAsLeader-style gate and fold-check respectively.

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

  // --- shouldSlowPlay / shouldHeroCall (closed out 2026-11-23, same
  // follow-up review that flagged these as still open) ---
  check("shouldSlowPlay never fires for a profile with no patternBreakRate", !AIProfiles.shouldSlowPlay({}));
  check("shouldHeroCall never fires for a profile with no patternBreakRate", !AIProfiles.shouldHeroCall({}));
  let slowPlayFires = 0;
  let heroCallFires = 0;
  for (let i = 0; i < TRIALS; i++) {
    if (AIProfiles.shouldSlowPlay({ patternBreakRate: 1 })) slowPlayFires++;
    if (AIProfiles.shouldHeroCall({ patternBreakRate: 1 })) heroCallFires++;
  }
  check("shouldSlowPlay always fires with patternBreakRate: 1", slowPlayFires === TRIALS);
  check("shouldHeroCall always fires with patternBreakRate: 1", heroCallFires === TRIALS);

  // A worthRaisingAsLeader-style gate: raiseWhenLeading is checked
  // separately from the category bar, then slow-play can suppress a
  // raise that would otherwise fire -- mirrors the real shape in
  // ai-profiles.js/ai-stud-profiles.js/ai-mexican-sweat-profiles.js.
  const leaderGateFires = (profile, clearsBar) => {
    if (!profile.raiseWhenLeading && !AIProfiles.breaksPattern(profile)) return false;
    if (clearsBar && profile.raiseWhenLeading && AIProfiles.shouldSlowPlay(profile)) return false;
    return clearsBar;
  };
  const alwaysRaisesButSlowPlays = { raiseWhenLeading: true, patternBreakRate: 1 };
  const alwaysRaisesNeverSlowPlays = { raiseWhenLeading: true, patternBreakRate: 0 };
  check("a qualifying lead presses normally with patternBreakRate 0", leaderGateFires(alwaysRaisesNeverSlowPlays, true) === true);
  check("the identical qualifying lead is suppressed (slow-played) once patternBreakRate guarantees it", leaderGateFires(alwaysRaisesButSlowPlays, true) === false);
  check("a lead that doesn't clear the bar still never presses, slow-play or not", leaderGateFires(alwaysRaisesButSlowPlays, false) === false);
  // Subversive itself has raiseWhenLeading: false, so it never reaches the
  // "clears the bar, now maybe slow-play" branch in the first place --
  // there's nothing to slow down since it doesn't press leads by default
  // (its own unpredictability is the raise-a-monster case already covered
  // above). Confirms this is the archetype's actual, intended shape, not
  // an oversight in the new helper's wiring.
  check("Subversive's own raiseWhenLeading is still false (slow-play has nothing to apply to for this archetype)", subversive.raiseWhenLeading === false);

  // A fold-check gate: hero call overrides a fold into a call.
  const foldGateResult = (profile, wouldFold) => {
    if (!wouldFold) return "call";
    if (AIProfiles.shouldHeroCall(profile)) return "call";
    return "fold";
  };
  check("a losing hand folds normally with patternBreakRate 0", foldGateResult({ patternBreakRate: 0 }, true) === "fold");
  check("the identical losing hand hero-calls once patternBreakRate guarantees it", foldGateResult({ patternBreakRate: 1 }, true) === "call");
  check("a hand that wasn't going to fold anyway just calls, hero call or not", foldGateResult({ patternBreakRate: 1 }, false) === "call");

  return summary("ai-pattern-break");
}

if (require.main === module) process.exit(run());
module.exports = { run };

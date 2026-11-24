"use strict";

// Covers the 2026-11-23 archetype design review's finding #8: every
// archetype talked at the same flat rate and acted at the same flat
// speed, even though this doc describes the Diplomat's running patter,
// the Wall's near-silence, the Calculator's visible pause to work out
// odds, and the Live Wire's snap decisions. Adds per-profile
// `talkativeness` (read by TableQuips.pickQuip, taking priority over the
// caller-supplied fallback chance whenever real archetype data exists)
// and `tempo` (a multiplier on the delay before an AI acts, read via
// AIProfiles.tempoFor and applied at every session-*.js decision-delay
// call site before routing through TableFX.paceDelay as always).

const { load } = require("./harness");
const { makeChecker } = require("./check");

function run() {
  const { check, summary } = makeChecker();
  const { AIProfiles } = load(["deck.js", "hand-evaluator.js", "ai-profiles.js"], ["AIProfiles"]);

  // --- Real profile data ---
  for (const name of Object.keys(AIProfiles.PROFILES)) {
    const profile = AIProfiles.profileFor(name);
    check(`${name}: has a real talkativeness value`, typeof profile.talkativeness === "number" && profile.talkativeness >= 0 && profile.talkativeness <= 1);
    check(`${name}: has a real tempo value`, typeof profile.tempo === "number" && profile.tempo > 0);
  }
  check("Wall is the quietest archetype in the roster", AIProfiles.profileFor("wall").talkativeness <= AIProfiles.profileFor("fortress").talkativeness);
  check("Wall's tempo is a fixed, unremarkable 1 -- itself its own tell suppression", AIProfiles.profileFor("wall").tempo === 1);
  check("the Calculator pauses longer than baseline (tempo > 1)", AIProfiles.profileFor("the-calculator").tempo > 1);
  check("Live Wire acts faster than baseline (tempo < 1)", AIProfiles.profileFor("live-wire").tempo < 1);
  check("Diplomat and Live Wire are both notably talkative", AIProfiles.profileFor("diplomat").talkativeness >= 0.5 && AIProfiles.profileFor("live-wire").talkativeness >= 0.5);

  // --- tempoFor(profileName) ---
  check("tempoFor resolves a known profile's own tempo", AIProfiles.tempoFor("the-calculator") === AIProfiles.profileFor("the-calculator").tempo);
  check("tempoFor falls back to 1 for an unknown/undefined profileName (never breaks an unscaled delay)", AIProfiles.tempoFor(undefined) === AIProfiles.profileFor("balanced").tempo);

  // --- Storm's tilt overlay (finding #3) bumps talkativeness and speeds up tempo ---
  const stormBase = AIProfiles.profileFor("storm");
  const stormTilted = AIProfiles.profileForState("storm", [{ result: "lostAtShowdown", netChips: -10 }]);
  check("a tilted Storm talks more than its baseline", stormTilted.talkativeness > stormBase.talkativeness);
  check("a tilted Storm acts faster than its baseline (lower tempo)", stormTilted.tempo < stormBase.tempo);

  // --- TableQuips.pickQuip: talkativeness takes priority over the caller's fallback chance ---
  const { TableQuips, TablePeople, TABLE_PEOPLE } = load(
    ["table-people-data.js", "table-people.js", "table-quips.js", "deck.js", "hand-evaluator.js", "ai-profiles.js"],
    ["TableQuips", "TablePeople", "TABLE_PEOPLE"]
  );

  // Wall's talkativeness (0.12) should win out over a caller passing a
  // much higher fallback chance -- previously every archetype used
  // exactly the caller-supplied chance (the session's own flat
  // QUIP_CHANCE), so this is the behavior change finding #8 made real.
  const wallPerson = TABLE_PEOPLE.find((p) => AIProfiles.profileFor("wall") && p.id && p.id.startsWith("wall--"));
  const wallPlayer = { isHuman: false, id: "w1", tablePersonId: wallPerson.id, profileName: "wall" };
  let wallFires = 0;
  const TRIALS = 2000;
  for (let i = 0; i < TRIALS; i++) {
    if (TableQuips.pickQuip(wallPlayer, "general", 0.9) !== null) wallFires++;
  }
  const wallRate = wallFires / TRIALS;
  check(
    `Wall's own low talkativeness (0.12) wins out over a much higher caller-supplied chance (observed rate ${wallRate.toFixed(2)})`,
    wallRate > 0.06 && wallRate < 0.2
  );

  // A player with no resolvable archetype (no profileName) still falls
  // back to the caller's own chance, same as before this change.
  const noProfilePlayer = { isHuman: false, id: "x1", tablePersonId: wallPerson.id, profileName: undefined };
  let fallbackFires = 0;
  for (let i = 0; i < TRIALS; i++) {
    if (TableQuips.pickQuip(noProfilePlayer, "general", 1) !== null) fallbackFires++;
  }
  check("a player with no profileName still falls back to the caller-supplied chance (here, 1 -- always fires)", fallbackFires === TRIALS);

  return summary("ai-tempo-and-talkativeness");
}

if (require.main === module) process.exit(run());
module.exports = { run };

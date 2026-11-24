"use strict";

// table-night.js's chooseNextGame resets every per-hand transient status
// flag (folded/busted/standing/bestShowingHand/hand) on the whole shared
// roster the moment a new game is picked -- closing a recurring class of
// "stale badge/hand from the previous game" bugs reported directly
// against this app (see CLAUDE.md's several "stale ... carrying over"
// entries). The player objects are shared by reference across every
// game's orchestrator, so this is the one place that can fix it for
// every family at once instead of auditing each table-ui-<family>.js's
// own render guards one at a time.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createSandbox, loadFiles, exportsFrom, JS_DIR } = require("./harness");
const { makeChecker } = require("./check");

// game-registry.js references every game's own config/session factory at
// module scope, so a standalone test needs either all 14 real session
// modules loaded or stubs standing in for the ones not under test here.
// Stubbing keeps this test fast and focused on table-night.js's own
// reset logic rather than re-testing every family's full turn loop.
const STUBBED_SESSIONS = [
  "SessionMidnightBaseball", "SessionMexicanSweat", "SessionCommunityStud",
  "SessionGuts", "SessionWildInYourHand", "SessionStud", "SessionPressYourLuck",
  "Session333", "SessionBlindMansBluff", "SessionGameOfLife",
  "SessionDrawPoker", "SessionAnaconda",
];

function buildSandbox() {
  const extra = {};
  for (const name of STUBBED_SESSIONS) {
    extra[name] = { create: () => ({ getViewState: () => ({ state: null, pending: null }), snapshot: () => ({}) }) };
  }
  const sandbox = createSandbox(extra);
  loadFiles(sandbox, [
    "deck.js", "hand-evaluator.js", "chip-economy.js", "target-sum-evaluator.js", "betting-engine.js",
    "baseball-family-wildcards.js", "rules-stud.js", "game-configs-stud.js",
    "rules-mexican-sweat.js", "game-configs-mexican-sweat.js",
    "rules-community-stud.js", "game-configs-community-stud.js",
    "rules-guts.js", "game-configs-guts.js",
    "rules-wild-in-your-hand.js", "game-configs-wild-in-your-hand.js",
    "rules-holdem.js", "game-configs-holdem.js",
    "rules-press-your-luck.js", "game-configs-press-your-luck.js",
    "rules-acey-ducey.js", "ai-acey-ducey-profiles.js",
    "game-registry.js", "history-store.js", "table-people-data.js", "table-people.js",
  ]);
  // session-holdem.js/session-acey-ducey.js are the two real game loops
  // this test actually drives (a hold'em hand leaking into a game with
  // no hand concept at all is the exact reported scenario).
  loadFiles(sandbox, ["session-holdem.js", "session-acey-ducey.js"]);
  loadFiles(sandbox, ["table-night.js"]);
  return exportsFrom(sandbox, ["TableNight"]).TableNight;
}

function run() {
  const { check, summary } = makeChecker();
  const TableNight = buildSandbox();

  TableNight.init({ humanName: "Kevin", seatCount: 3, dealMode: "humanChoice" }, () => {});
  TableNight.chooseNextGame("jerseyHoldem", {});
  let players = TableNight.getViewState().players;
  const human = players.find((p) => p.isHuman);
  human.hand = [{ rank: "A", suit: "S" }, { rank: "K", suit: "S" }];
  human.folded = true;
  human.busted = true;
  human.standing = true;
  human.bestShowingHand = { category: 3 };

  TableNight.chooseNextGame("aceyDucey", {});
  players = TableNight.getViewState().players;
  const human2 = players.find((p) => p.isHuman);
  check("human.hand is cleared, not left over from the previous game", human2.hand == null);
  check("human.folded is reset", human2.folded === false);
  check("human.busted is reset", human2.busted === false);
  check("human.standing is reset", human2.standing === false);
  check("human.bestShowingHand is reset", human2.bestShowingHand == null);

  // Real design fix, reported directly (2026-11-23): AI picks felt
  // lopsided over a real night (Omaha repeatedly, Midnight Baseball and
  // Seattle never) -- confirmed by reading the old code that this was
  // genuinely uniform random, not a bug, just what uniform random looks
  // like at realistic sample sizes across 27 games. autoPickForAI now
  // weights inversely by how many times a game's already been picked
  // THIS night (gamePickCounts, incremented by chooseNextGame) -- a game
  // picked a lot should become dramatically less likely, without ever
  // being mathematically impossible to pick again.
  {
    // Each trial re-inits fresh and re-inflates omaha's count back to 8
    // before the ONE sample that actually counts -- autoPickForAI()
    // itself calls chooseNextGame, which increments gamePickCounts for
    // whatever it just picked, so looping many samples in a row without
    // resetting would let every OTHER game accumulate picks too as the
    // loop runs, diluting the comparison baseline trial over trial. This
    // isolates "is an already-8x-picked game less likely than uniform
    // RIGHT NOW" instead of measuring a baseline that's drifting under it.
    const counts = {};
    const TRIALS = 150;
    for (let i = 0; i < TRIALS; i++) {
      TableNight.init({ humanName: "Kevin", seatCount: 5, dealMode: "dealersChoice" }, () => {});
      for (let j = 0; j < 8; j++) TableNight.chooseNextGame("omaha", {});
      const result = TableNight.autoPickForAI();
      counts[result.choice.id] = (counts[result.choice.id] || 0) + 1;
    }
    const omahaShare = (counts.omaha || 0) / TRIALS;
    const gameCount = TableNight.getViewState().gameList.length;
    const uniformShare = 1 / gameCount;
    check(
      `a game already picked 8 times is picked far less than its uniform share (omaha: ${(omahaShare * 100).toFixed(1)}% over ${TRIALS} trials, uniform would be ${(uniformShare * 100).toFixed(1)}%)`,
      omahaShare < uniformShare * 0.5
    );
  }

  return summary("table-night");
}

if (require.main === module) process.exit(run());
module.exports = { run };

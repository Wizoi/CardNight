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

  return summary("table-night");
}

if (require.main === module) process.exit(run());
module.exports = { run };

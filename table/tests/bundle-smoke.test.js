"use strict";

// Build step smoke test (Android roadmap step 2): runs tools/build-table.js
// and loads the resulting table/dist/bundle.js -- not the source files --
// through the same vm-sandbox harness every other test uses. Every other
// test file in this directory loads table/js/*.js directly, which proves
// the SOURCE is correct; it says nothing about the BUILT bundle a real
// release would ship. This is the one test that closes that gap, so
// "tests pass" and "what ships" can't quietly diverge if the build script
// ever starts doing more than plain concatenation.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");
const { createSandbox } = require("./harness");
const { makeChecker } = require("./check");

const REPO_ROOT = path.join(__dirname, "..", "..");
const BUNDLE_PATH = path.join(REPO_ROOT, "table", "dist", "bundle.js");
const BUILD_SCRIPT = path.join(REPO_ROOT, "tools", "build-table.js");

// table-ui.js's own top-level IIFE wires real DOM listeners the instant it
// loads (not deferred to DOMContentLoaded) -- true in a real browser, but
// it means loading the WHOLE bundle in a vm sandbox needs something to
// stand in for `document`/`navigator`, unlike every other test file here,
// which only loads the DOM-free rules/session/ai layer. A silent no-op
// Proxy is enough: this test isn't exercising UI wiring, only confirming
// the bundle's engine globals (GameRegistry, GutsRules, etc.) load intact
// and a real rules scenario still resolves correctly against the bundled
// code.
function makeNoopProxy() {
  const target = function () {};
  return new Proxy(target, {
    get() {
      return makeNoopProxy();
    },
    apply() {
      return makeNoopProxy();
    },
  });
}

function run() {
  const { check, summary } = makeChecker();

  execFileSync(process.execPath, [BUILD_SCRIPT], { cwd: REPO_ROOT, stdio: "pipe" });
  check("build script produced table/dist/bundle.js", fs.existsSync(BUNDLE_PATH));

  const bundleSrc = fs.readFileSync(BUNDLE_PATH, "utf8");
  const sandbox = createSandbox({ document: makeNoopProxy(), navigator: makeNoopProxy() });
  // The bundle is one big file loaded wholesale -- that's the whole point
  // (verify it runs as a single <script>, exactly as dist/index.html will
  // load it), not a list of individual files like every other test.
  vm.runInContext(bundleSrc, sandbox, { filename: "bundle.js" });
  vm.runInContext("var __exports = { GameRegistry, GutsRules, HandEvaluator, TABLE_PEOPLE, GAMES };", sandbox);
  const { GameRegistry, GutsRules, HandEvaluator, TABLE_PEOPLE, GAMES } = sandbox.__exports;

  check("GameRegistry is defined in the bundle", typeof GameRegistry === "object" && GameRegistry !== null);
  check("GameRegistry lists every game (>= 27)", GameRegistry.list().length >= 27);
  check("GutsRules is defined in the bundle", typeof GutsRules === "object" && GutsRules !== null);
  check("HandEvaluator is defined in the bundle", typeof HandEvaluator === "object" && HandEvaluator !== null);
  check("TABLE_PEOPLE (30 regulars) is defined in the bundle", Array.isArray(TABLE_PEOPLE) && TABLE_PEOPLE.length === 30);
  // 24, not 27 -- app/games-data.js combines Omaha/Seattle/Boise/Jersey
  // Hold'em into one listing entry, matching games.md's single combined
  // heading for that family.
  check("GAMES (from ../app/games-data.js, folded into the bundle) is defined", Array.isArray(GAMES) && GAMES.length >= 24);

  // A real, end-to-end rules check against the BUNDLED code -- the same
  // scenario rules-guts.test.js already verifies against the source files,
  // repeated here so a future build-script change that broke concatenation
  // order (a real risk: these files rely on <script>-tag load order for
  // their shared top-level scope) would fail here even if every per-file
  // source test still passed.
  const players = [
    { id: "p0", name: "Kevin", isHuman: true, wallet: { chips: 10000 } },
    { id: "p1", name: "Marisol", isHuman: false, wallet: { chips: 10000 } },
  ];
  const settings = { anteDollars: 0.5 };
  const cfg = { id: "deepOrDoubleScrew", dealSize: () => 7, lowestCardWild: true, flipWildcardCount: 0, loserPolicy: "allNonWinners", categoryShift: 4 };
  const state = GutsRules.createRoundState(players, settings, cfg, 0);
  players[0].hand = [
    { rank: "A", suit: "S" }, { rank: "A", suit: "H" }, { rank: "A", suit: "D" },
    { rank: "4", suit: "C" }, { rank: "6", suit: "C" }, { rank: "8", suit: "C" }, { rank: "9", suit: "C" },
  ];
  players[1].hand = [
    { rank: "2", suit: "S" }, { rank: "3", suit: "H" }, { rank: "5", suit: "D" },
    { rank: "7", suit: "S" }, { rank: "9", suit: "H" }, { rank: "J", suit: "D" }, { rank: "Q", suit: "C" },
  ];
  state.stayDecisions["p0"] = true;
  state.stayDecisions["p1"] = true;
  GutsRules.resolveShowdown(state);
  check("a real Guts showdown resolves correctly against the BUNDLED code", state.winnerId === "p0");

  return summary("bundle-smoke");
}

if (require.main === module) process.exit(run());
module.exports = { run };

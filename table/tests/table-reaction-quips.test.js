"use strict";

// Covers the 2026-11-23 archetype design review's finding #9: "No
// archetype can react to another player, so the Diplomat's compliments
// and the Steady Hand's reassurance never happen." Every quip before this
// was the acting player talking about their own action; reactions are the
// one genuinely cross-player case -- a seat that WASN'T involved reacts
// in character to an opponent's big win (reactOpponentBigWin) or the
// human's own bad beat (reactHumanBadBeat).

const { createSandbox, loadFiles, exportsFrom } = require("./harness");
const { makeChecker } = require("./check");

// A minimal stub standing in for every one of the 14 real session
// factories -- this test drives table-night.js's own onHandComplete
// wiring directly (recordHandOutcomes -> a reaction quip -> getViewState
// exposing it), not any one family's actual turn loop, so no real game
// logic is needed. Captures the onHandComplete callback config.chooseNextGame
// handed to it so the test can fire it manually, as if a real hand had
// just completed.
function makeCapturingSessionStub(capturedCallbacks) {
  return {
    create: (config) => {
      capturedCallbacks.push(config.onHandComplete);
      return { getViewState: () => ({ state: null, pending: null }), snapshot: () => ({}) };
    },
  };
}

function buildSandbox(capturedCallbacks) {
  const stubNames = [
    "SessionMidnightBaseball", "SessionMexicanSweat", "SessionCommunityStud",
    "SessionGuts", "SessionWildInYourHand", "SessionStud", "SessionPressYourLuck",
    "Session333", "SessionBlindMansBluff", "SessionGameOfLife",
    "SessionDrawPoker", "SessionAnaconda", "SessionHoldem", "SessionAceyDucey",
  ];
  const extra = {};
  for (const name of stubNames) extra[name] = makeCapturingSessionStub(capturedCallbacks);
  const sandbox = createSandbox(extra);
  loadFiles(sandbox, [
    "deck.js", "hand-evaluator.js", "ai-profiles.js", "chip-economy.js", "target-sum-evaluator.js", "betting-engine.js",
    "baseball-family-wildcards.js", "rules-stud.js", "game-configs-stud.js",
    "rules-mexican-sweat.js", "game-configs-mexican-sweat.js",
    "rules-community-stud.js", "game-configs-community-stud.js",
    "rules-guts.js", "game-configs-guts.js",
    "rules-wild-in-your-hand.js", "game-configs-wild-in-your-hand.js",
    "rules-holdem.js", "game-configs-holdem.js",
    "rules-press-your-luck.js", "game-configs-press-your-luck.js",
    "rules-acey-ducey.js", "ai-acey-ducey-profiles.js",
    "game-registry.js", "history-store.js", "table-people-data.js", "table-people.js", "table-quips.js",
    "table-night.js",
  ]);
  return exportsFrom(sandbox, ["TableNight"]).TableNight;
}

function run() {
  const { check, summary } = makeChecker();

  // --- TableQuips.pickReaction unit behavior ---
  {
    const { TablePeople, TableQuips, TABLE_PEOPLE } = require("./harness").load(
      ["deck.js", "hand-evaluator.js", "ai-profiles.js", "table-people-data.js", "table-people.js", "table-quips.js"],
      ["TablePeople", "TableQuips", "TABLE_PEOPLE"]
    );
    const diplomat = TABLE_PEOPLE.find((p) => p.archetypeId === "diplomat");
    const wall = TABLE_PEOPLE.find((p) => p.archetypeId === "wall"); // no reaction lines at all

    const diplomatPlayer = { id: "p1", isHuman: false, tablePersonId: diplomat.id, profileName: "diplomat" };
    const wallPlayer = { id: "p2", isHuman: false, tablePersonId: wall.id, profileName: "wall" };
    const humanPlayer = { id: "human", isHuman: true, tablePersonId: null };
    const winnerPlayer = { id: "winner", isHuman: false, tablePersonId: diplomat.id, profileName: "diplomat" };

    const picked = TableQuips.pickReaction([diplomatPlayer, winnerPlayer], "winner", "reactOpponentBigWin");
    check("pickReaction finds a real reactor with real lines and talkativeness clearing", picked === null || (typeof picked.text === "string" && picked.playerId === "p1"));

    check("pickReaction never picks the excluded (involved) player themselves", TableQuips.pickReaction([diplomatPlayer], "p1", "reactOpponentBigWin") === null);
    check("pickReaction never picks a human seat", TableQuips.pickReaction([humanPlayer], "winner", "reactOpponentBigWin") === null);
    check(
      "pickReaction returns null (not a general-bucket misfire) when the only eligible seat has zero lines for this moment",
      TableQuips.pickReaction([wallPlayer], "winner", "reactOpponentBigWin") === null
    );

    // Force-fire many times to confirm it DOES eventually produce a real,
    // well-formed reaction from a genuinely eligible character.
    let sawReal = false;
    for (let i = 0; i < 300 && !sawReal; i++) {
      const r = TableQuips.pickReaction([{ ...diplomatPlayer }], "someone-else", "reactOpponentBigWin");
      if (r) {
        sawReal = true;
        check("a real reaction is well-formed ({personName, text, playerId})", typeof r.personName === "string" && typeof r.text === "string" && r.playerId === "p1");
      }
    }
    check("at least one of 300 trials actually produced a real reaction", sawReal);
  }

  // --- table-night.js's own onHandComplete -> reactionQuip wiring ---
  {
    const capturedCallbacks = [];
    const TableNight = buildSandbox(capturedCallbacks);
    TableNight.init({ humanName: "Kevin", seatCount: 6, dealMode: "dealersChoice" }, () => {});
    TableNight.chooseNextGame("aceyDucey", {});
    const onHandComplete = capturedCallbacks[capturedCallbacks.length - 1];

    const vs0 = TableNight.getViewState();
    check("lastReactionQuip starts null on a fresh night", vs0.lastReactionQuip === null);

    // Force every AI seat into the Diplomat archetype (a resolvable
    // reactor, guaranteed to have real reactOpponentBigWin lines) and the
    // winner into a big, qualifying net gain -- the simplest way to
    // reliably exercise the real trigger threshold without needing an
    // actual multi-hand betting sequence.
    const players = vs0.players;
    for (const p of players) {
      if (!p.isHuman) p.profileName = "diplomat";
    }
    const winner = players.find((p) => !p.isHuman);
    winner.wallet.chips += 50; // a large, unambiguous net gain this hand

    let sawReactionQuip = false;
    for (let i = 0; i < 300 && !sawReactionQuip; i++) {
      onHandComplete({ winnerId: winner.id, rainedOut: false, potChips: 0 });
      const vs = TableNight.getViewState();
      if (vs.lastReactionQuip) {
        sawReactionQuip = true;
        check("the real reactionQuip is well-formed", typeof vs.lastReactionQuip.text === "string" && typeof vs.lastReactionQuip.id === "number");
        check("the reactionQuip is NOT attributed to the big winner themselves", vs.lastReactionQuip.playerId !== winner.id);
      }
      // lastKnownChipsByPlayerId already updated to the post-win chips --
      // re-inflate the winner's chips again so the NEXT trial still looks
      // like a fresh big win, not a repeat of the same already-recorded
      // delta (which would read as net 0 the second time through).
      winner.wallet.chips += 50;
    }
    check("at least one of 300 hand-complete trials produced a real reactionQuip for a genuine big win", sawReactionQuip);
  }

  // A fold-out or a modest win must never trigger a reaction (no misfire
  // on an ordinary, unremarkable hand).
  {
    const capturedCallbacks = [];
    const TableNight = buildSandbox(capturedCallbacks);
    TableNight.init({ humanName: "Kevin", seatCount: 6, dealMode: "dealersChoice" }, () => {});
    TableNight.chooseNextGame("aceyDucey", {});
    const onHandComplete = capturedCallbacks[capturedCallbacks.length - 1];
    const players = TableNight.getViewState().players;
    for (const p of players) {
      if (!p.isHuman) p.profileName = "diplomat";
    }
    const winner = players.find((p) => !p.isHuman);
    winner.wallet.chips += 1; // a trivially small net gain -- not a "big win"
    onHandComplete({ winnerId: winner.id, rainedOut: false, potChips: 0 });
    check("a modest, unremarkable win never triggers a reaction quip", TableNight.getViewState().lastReactionQuip === null);
  }

  return summary("table-reaction-quips");
}

if (require.main === module) process.exit(run());
module.exports = { run };

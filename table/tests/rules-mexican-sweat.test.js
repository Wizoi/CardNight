"use strict";

// Mexican Sweat's kill-card mechanic (flipping the kill rank eliminates
// you outright, it's not a wildcard -- see CLAUDE.md's rebuild notes)
// and the showdown result stating the actual winning hand.

const { load } = require("./harness");
const { makeChecker } = require("./check");

function run() {
  const { check, summary } = makeChecker();
  const { MexicanSweatRules, HandEvaluator, MEXICAN_SWEAT_CONFIG } = load(
    ["deck.js", "hand-evaluator.js", "chip-economy.js", "betting-engine.js", "rules-mexican-sweat.js", "game-configs-mexican-sweat.js"],
    ["MexicanSweatRules", "HandEvaluator", "MEXICAN_SWEAT_CONFIG"]
  );
  const settings = { anteDollars: 0.5, raiseIncrementDollars: 0.25, maxBetDollars: 2 };

  // Kill card: flipping the designated rank eliminates the player, it
  // never makes their other cards wild.
  {
    const players = [
      { id: "p0", name: "Kevin", isHuman: true, wallet: { chips: 10000 } },
      { id: "p1", name: "Marisol", isHuman: false, wallet: { chips: 10000 } },
    ];
    const cfg = Object.assign({}, MEXICAN_SWEAT_CONFIG, { killCard: true });
    const state = MexicanSweatRules.createHandState(players, 0, settings, 0, cfg);
    check("a kill rank is designated for the hand", !!state.killRank);
    players[0].hand = players[0].hand.map((c, i) => (i === 0 ? { rank: state.killRank, suit: "S", faceUp: false } : c));
    const result = MexicanSweatRules.revealNextCard(state);
    if (result.playerId === "p0") {
      check("flipping the kill card eliminates the player", result.killed === true);
      check("the eliminated player is folded", players[0].folded === true);
    }
  }

  // Showdown states the winning hand, not just the winner.
  {
    const players = [
      { id: "p0", name: "Kevin", isHuman: true, wallet: { chips: 10000 } },
      { id: "p1", name: "Marisol", isHuman: false, wallet: { chips: 10000 } },
    ];
    const cfg = Object.assign({}, MEXICAN_SWEAT_CONFIG, { killCard: false });
    const state = MexicanSweatRules.createHandState(players, 0, settings, 0, cfg);
    players[0].hand = [
      { rank: "2", suit: "S" }, { rank: "2", suit: "H" }, { rank: "2", suit: "D" }, { rank: "2", suit: "C" },
      { rank: "9", suit: "C" }, { rank: "8", suit: "H" }, { rank: "4", suit: "D" },
    ].map((c) => Object.assign({ faceUp: true }, c));
    players[1].hand = [
      { rank: "3", suit: "S" }, { rank: "5", suit: "H" }, { rank: "7", suit: "D" },
      { rank: "9", suit: "S" }, { rank: "10", suit: "H" }, { rank: "J", suit: "C" }, { rank: "K", suit: "D" },
    ].map((c) => Object.assign({ faceUp: true }, c));
    MexicanSweatRules.resolveShowdown(state);
    check("Kevin wins", state.winnerId === "p0");
    check("bestHandDescribed states Four of a Kind", state.bestHandDescribed && state.bestHandDescribed.toLowerCase().includes("four of a kind"));
    check("the win log line includes the described hand", state.log[state.log.length - 1].includes(state.bestHandDescribed));
  }

  // Fold-out win: nothing was ever compared, so nothing to describe.
  {
    const players = [
      { id: "p0", name: "Kevin", isHuman: true, wallet: { chips: 10000 } },
      { id: "p1", name: "Marisol", isHuman: false, wallet: { chips: 10000 } },
    ];
    const cfg = Object.assign({}, MEXICAN_SWEAT_CONFIG, { killCard: false });
    const state = MexicanSweatRules.createHandState(players, 0, settings, 0, cfg);
    players[1].folded = true;
    MexicanSweatRules.checkForInstantWin(state);
    check("fold-out win completes the hand", state.status === "complete");
    check("fold-out win leaves bestHandDescribed null (nothing was genuinely compared)", state.bestHandDescribed == null);
  }

  return summary("rules-mexican-sweat");
}

if (require.main === module) process.exit(run());
module.exports = { run };

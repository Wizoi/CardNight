"use strict";

// Covers betting-engine.js's round.lastSubmit (added 2026-11-24 to support
// the "reactBigRaise" quip design): submitBet now stamps what ACTUALLY
// happened on every single call -- fold, call, or raise alike -- so a
// caller (table-night.js's cross-player reaction detection) can tell a
// genuine raise apart from a requested raise that got capped down to a
// plain call, without each of the 11 raise-capable families inventing
// its own signal.

const { load } = require("./harness");
const { makeChecker } = require("./check");

function run() {
  const { check, summary } = makeChecker();
  const { BettingEngine, ChipEconomy } = load(
    ["chip-economy.js", "betting-engine.js"],
    ["BettingEngine", "ChipEconomy"]
  );

  function makePlayer(id, chips) {
    return { id, isHuman: true, wallet: { chips: ChipEconomy.dollarsToChips(chips) } };
  }

  // --- A real raise stamps the real raiseChips/incrementChips ---
  {
    const p1 = makePlayer("p1", 10);
    const p2 = makePlayer("p2", 10);
    const round = BettingEngine.startRound(["p1", "p2"]);
    BettingEngine.submitBet(round, p1, "raise", 2, { maxBetDollars: 50, raiseIncrementDollars: 1 });
    check("a raise stamps action: raise", round.lastSubmit.action === "raise");
    check("a raise stamps the real playerId", round.lastSubmit.playerId === "p1");
    check("a raise stamps raiseChips matching the actual raise", round.lastSubmit.raiseChips === ChipEconomy.dollarsToChips(2));
    check("a raise stamps the configured incrementChips", round.lastSubmit.incrementChips === ChipEconomy.dollarsToChips(1));
    check("a raise with chips left stamps wentAllIn: false", round.lastSubmit.wentAllIn === false);
  }

  // --- A fold stamps action: fold, with raiseChips 0 ---
  {
    const p1 = makePlayer("p1", 10);
    const round = BettingEngine.startRound(["p1", "p2"]);
    BettingEngine.submitBet(round, p1, "fold", 0, {});
    check("a fold stamps action: fold", round.lastSubmit.action === "fold");
    check("a fold stamps raiseChips: 0", round.lastSubmit.raiseChips === 0);
  }

  // --- A plain call stamps action: call ---
  {
    const p1 = makePlayer("p1", 10);
    const round = BettingEngine.startRound(["p1", "p2"]);
    round.currentBetChips = ChipEconomy.dollarsToChips(1);
    BettingEngine.submitBet(round, p1, "call", 0, {});
    check("a call stamps action: call", round.lastSubmit.action === "call");
    check("a call stamps raiseChips: 0 (it's not a raise)", round.lastSubmit.raiseChips === 0);
  }

  // --- A requested raise that gets capped down to a call downgrades the
  // stamped action to "call", not "raise" -- this is exactly the case
  // table-night.js's big-raise detection relies on NOT misfiring on.
  {
    const p1 = makePlayer("p1", 10);
    const round = BettingEngine.startRound(["p1", "p2"]);
    round.currentBetChips = ChipEconomy.dollarsToChips(1);
    // maxBetDollars already at the current bet -- there's no room to raise,
    // so this should downgrade to a plain call.
    BettingEngine.submitBet(round, p1, "raise", 5, { maxBetDollars: 1, raiseIncrementDollars: 1 });
    check("a raise request with no room downgrades to action: call", round.lastSubmit.action === "call");
  }

  // --- A raise that leaves the player's wallet at exactly 0 stamps wentAllIn ---
  {
    const p1 = makePlayer("p1", 3);
    const round = BettingEngine.startRound(["p1", "p2"]);
    BettingEngine.submitBet(round, p1, "raise", 3, { maxBetDollars: 50, raiseIncrementDollars: 1 });
    check("a raise that empties the wallet stamps wentAllIn: true", round.lastSubmit.wentAllIn === true);
  }

  // --- lastSubmit is overwritten on every submit, never stale ---
  {
    const p1 = makePlayer("p1", 10);
    const p2 = makePlayer("p2", 10);
    const round = BettingEngine.startRound(["p1", "p2"]);
    BettingEngine.submitBet(round, p1, "raise", 2, { maxBetDollars: 50, raiseIncrementDollars: 1 });
    check("after p1's raise, lastSubmit is p1's", round.lastSubmit.playerId === "p1");
    BettingEngine.submitBet(round, p2, "fold", 0, {});
    check("after p2's fold, lastSubmit overwrites to p2's fold (not stale on p1's raise)", round.lastSubmit.playerId === "p2" && round.lastSubmit.action === "fold");
  }

  return summary("betting-engine");
}

if (require.main === module) process.exit(run());
module.exports = { run };

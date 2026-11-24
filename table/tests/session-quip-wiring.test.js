"use strict";

// Covers the deferred part of the 2026-11-23 archetype design review's
// finding #2: "Acey Ducey and Blind Man's Bluff still have no quip
// wiring" (3-33 got built the same day the review landed; these two were
// explicitly deferred as lower-value to rush at the time). Both now reuse
// the exact same TableQuips.pickQuip selection logic every other family
// does. This drives the real rules engines directly (not the async
// session wrapper, which can't fit this suite's synchronous run()
// contract -- same reasoning session-mexican-sweat.test.js already
// established) to confirm the outcome-to-moment mapping the session
// files now use is reachable and correct.

const { load } = require("./harness");
const { makeChecker } = require("./check");

function run() {
  const { check, summary } = makeChecker();

  // --- Acey Ducey: win/lose/post/pass each map to a real, fireable quip ---
  {
    const { AceyDuceyRules, TableQuips, TablePeople, TABLE_PEOPLE } = load(
      ["deck.js", "hand-evaluator.js", "chip-economy.js", "betting-engine.js", "rules-acey-ducey.js", "table-people-data.js", "table-people.js", "table-quips.js"],
      ["AceyDuceyRules", "TableQuips", "TablePeople", "TABLE_PEOPLE"]
    );
    const diplomat = TABLE_PEOPLE.find((p) => p.archetypeId === "diplomat");
    const players = [
      { id: "p0", name: "Kevin", isHuman: false, tablePersonId: diplomat.id, profileName: "diplomat", wallet: { chips: 100000, rebuys: { push() {} } } },
      { id: "p1", name: "Marisol", isHuman: false, tablePersonId: diplomat.id, profileName: "diplomat", wallet: { chips: 100000, rebuys: { push() {} } } },
    ];
    const settings = { anteDollars: 0.5 };

    // Same session-acey-ducey.js mapping being verified here:
    //   win -> "win"; lose/post -> "lostHand"; pass -> "fold"
    function momentFor(outcome) {
      if (outcome === "win") return "win";
      if (outcome === "lose" || outcome === "post") return "lostHand";
      return "fold";
    }

    // Force a "win": shown cards 2 and 10 (a wide gap), rig the deck's
    // next draw to a 6 (falls strictly between).
    {
      const state = AceyDuceyRules.createHandState(players, 0, settings, 0);
      AceyDuceyRules.dealShownCards(state);
      state.shownCards = [{ rank: "2", suit: "S" }, { rank: "10", suit: "H" }];
      state.deck.unshift({ rank: "6", suit: "C" });
      AceyDuceyRules.resolveBet(state, "p0", 1);
      check("a winning bet resolves to outcome 'win'", state.lastResult.outcome === "win");
      const picked = TableQuips.pickQuip(players[0], momentFor(state.lastResult.outcome), 1);
      check("outcome 'win' maps to a real, fireable 'win' quip", picked !== null);
    }

    // Force a "lose": same shown cards, rig the next draw OUTSIDE the range.
    {
      const state = AceyDuceyRules.createHandState(players, 0, settings, 0);
      AceyDuceyRules.dealShownCards(state);
      state.shownCards = [{ rank: "2", suit: "S" }, { rank: "10", suit: "H" }];
      state.deck.unshift({ rank: "K", suit: "C" });
      AceyDuceyRules.resolveBet(state, "p0", 1);
      check("a losing bet resolves to outcome 'lose'", state.lastResult.outcome === "lose");
      const picked = TableQuips.pickQuip(players[0], momentFor(state.lastResult.outcome), 1);
      check("outcome 'lose' maps to a real, fireable 'lostHand' quip", picked !== null);
    }

    // Force a "post": rig the next draw to exactly match one of the shown ranks.
    {
      const state = AceyDuceyRules.createHandState(players, 0, settings, 0);
      AceyDuceyRules.dealShownCards(state);
      state.shownCards = [{ rank: "2", suit: "S" }, { rank: "10", suit: "H" }];
      state.deck.unshift({ rank: "2", suit: "D" });
      AceyDuceyRules.resolveBet(state, "p0", 1);
      check("hitting the post resolves to outcome 'post'", state.lastResult.outcome === "post");
      const picked = TableQuips.pickQuip(players[0], momentFor(state.lastResult.outcome), 1);
      check("outcome 'post' maps to a real, fireable 'lostHand' quip", picked !== null);
    }

    // A pass (betDollars 0) maps to "fold".
    {
      const state = AceyDuceyRules.createHandState(players, 0, settings, 0);
      AceyDuceyRules.dealShownCards(state);
      AceyDuceyRules.resolveBet(state, "p0", 0);
      check("passing resolves to outcome 'pass'", state.lastResult.outcome === "pass");
      const picked = TableQuips.pickQuip(players[0], momentFor(state.lastResult.outcome), 1);
      check("outcome 'pass' maps to a real, fireable 'fold' quip", picked !== null);
    }
  }

  // --- Blind Man's Bluff: a real fold, raise, and showdown win all fire ---
  {
    const { BlindMansBluffRules, TableQuips, TABLE_PEOPLE } = load(
      ["deck.js", "hand-evaluator.js", "chip-economy.js", "betting-engine.js", "rules-blind-mans-bluff.js", "table-people-data.js", "table-people.js", "table-quips.js"],
      ["BlindMansBluffRules", "TableQuips", "TABLE_PEOPLE"]
    );
    const liveWire = TABLE_PEOPLE.find((p) => p.archetypeId === "live-wire");
    const players = [
      { id: "p0", name: "Kevin", isHuman: false, tablePersonId: liveWire.id, profileName: "live-wire", wallet: { chips: 100000, rebuys: { push() {} } } },
      { id: "p1", name: "Marisol", isHuman: false, tablePersonId: liveWire.id, profileName: "live-wire", wallet: { chips: 100000, rebuys: { push() {} } } },
    ];
    const settings = { anteDollars: 0.5, raiseIncrementDollars: 0.25, maxBetDollars: 2 };
    const state = BlindMansBluffRules.createHandState(players, 0, settings, 0);

    const bettorId = BlindMansBluffRules.getCurrentBettor(state);
    BlindMansBluffRules.submitBet(state, bettorId, "raise", 0.25);
    const raisePicked = TableQuips.pickQuip(BlindMansBluffRules.getPlayer(state, bettorId), "raise", 1);
    check("a real raise fires a 'raise' quip", raisePicked !== null);

    const foldBettorId = BlindMansBluffRules.getCurrentBettor(state);
    BlindMansBluffRules.submitBet(state, foldBettorId, "fold", 0);
    const foldPicked = TableQuips.pickQuip(BlindMansBluffRules.getPlayer(state, foldBettorId), "fold", 1);
    check("a real fold fires a 'fold' quip", foldPicked !== null);
    check("the fold-out leaves exactly one winner", !!state.winnerId);

    const winPicked = TableQuips.pickQuip(BlindMansBluffRules.getPlayer(state, state.winnerId), "win", 1);
    check("the showdown/fold-out winner fires a 'win' quip", winPicked !== null);
  }

  return summary("session-quip-wiring");
}

if (require.main === module) process.exit(run());
module.exports = { run };

"use strict";

// Three real bugs caught by live design review, not guessed at (see
// CLAUDE.md's "Ledger" review entry): (1) a second sitting on the same
// calendar day used to silently overwrite the first's already-recorded
// history row, since both upserted under the same bare date key; (2)
// resuming a saved night after midnight used to re-derive "today" fresh on
// restore, splitting one sitting's history across two rows and double-
// counting it in regularsSummary; (3) walking away from a saved night
// without an explicit cash-out left that row showing "(in progress)"
// forever. All three are fixed by giving every sitting its own nightId,
// generated once and carried unchanged through snapshot()/restore(), and
// by settling an abandoned snapshot's row before it's cleared.

const { createSandbox, loadFiles, exportsFrom } = require("./harness");
const { makeChecker } = require("./check");

// A real in-memory localStorage, not the harness's default no-op stub --
// this test is specifically about data actually round-tripping through it.
function makeRealLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

const STUBBED_SESSIONS = [
  "SessionMidnightBaseball", "SessionMexicanSweat", "SessionCommunityStud",
  "SessionGuts", "SessionWildInYourHand", "SessionStud", "SessionPressYourLuck",
  "Session333", "SessionBlindMansBluff", "SessionGameOfLife",
  "SessionDrawPoker", "SessionAnaconda",
];

function buildSandbox(localStorage) {
  const extra = { localStorage };
  for (const name of STUBBED_SESSIONS) {
    extra[name] = { create: () => ({ getViewState: () => ({ state: null, pending: null }), snapshot: () => ({}) }) };
  }
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
  ]);
  loadFiles(sandbox, ["session-holdem.js", "session-acey-ducey.js"]);
  loadFiles(sandbox, ["table-night.js"]);
  return exportsFrom(sandbox, ["TableNight", "HistoryStore"]);
}

function run() {
  const { check, summary } = makeChecker();

  // --- Bug 1: two sittings on the same calendar day must not collide ---
  {
    const localStorage = makeRealLocalStorage();
    const { TableNight, HistoryStore } = buildSandbox(localStorage);
    let vs = null;
    const update = (v) => (vs = v);

    TableNight.init({ humanName: "Kevin", buyInDollars: 20, rebuyCapDollars: 60, seatCount: 2, dealMode: "humanChoice" }, update);
    TableNight.cashOut();
    const afterFirst = HistoryStore.load();
    check("first sitting recorded its own row", afterFirst.days.length === 1);

    TableNight.init({ humanName: "Kevin", buyInDollars: 20, rebuyCapDollars: 60, seatCount: 2, dealMode: "humanChoice" }, update);
    TableNight.cashOut();
    const afterSecond = HistoryStore.load();
    check(
      "a second sitting the same day gets its OWN row, not overwriting the first",
      afterSecond.days.length === 2
    );
    const nightIds = afterSecond.days.map((d) => d.nightId);
    check("the two rows have distinct nightIds", nightIds[0] !== nightIds[1]);
  }

  // --- Bug 2: resuming after the calendar date changes must not fork the row ---
  {
    const localStorage = makeRealLocalStorage();
    const { TableNight, HistoryStore } = buildSandbox(localStorage);
    let vs = null;
    const update = (v) => (vs = v);

    TableNight.init({ humanName: "Kevin", buyInDollars: 20, rebuyCapDollars: 60, seatCount: 2, dealMode: "humanChoice" }, update);
    TableNight.rebuy(10); // forces a recordDayProgress + saveSnapshot mid-night
    const snapshot = TableNight.loadSnapshot();
    check("the snapshot carries a nightId forward", !!snapshot.nightId);
    check("the snapshot carries the night's own date forward", !!snapshot.today);

    // Simulate resuming on a LATER calendar date by tampering with the
    // saved snapshot's own "today" the way a real midnight rollover would
    // -- restore() must use the night's own stored date, not recompute a
    // fresh one, or this would fork into two rows.
    const tamperedSnapshot = JSON.parse(JSON.stringify(snapshot));
    tamperedSnapshot.today = "2099-01-01"; // deliberately NOT what HistoryStore.todayDateString() returns "today"
    TableNight.restore(tamperedSnapshot, update);
    TableNight.cashOut();

    const finalHistory = HistoryStore.load();
    check("resuming across a date change still leaves exactly one row for the sitting", finalHistory.days.length === 1);
    check("that one row kept the night's ORIGINAL date, not a freshly recomputed one", finalHistory.days[0].date === "2099-01-01");
  }

  // --- Bug 3: an abandoned (never cashed out) night must get settled, not stuck "in progress" forever ---
  {
    const localStorage = makeRealLocalStorage();
    const { TableNight, HistoryStore } = buildSandbox(localStorage);
    let vs = null;
    const update = (v) => (vs = v);

    TableNight.init({ humanName: "Kevin", buyInDollars: 20, rebuyCapDollars: 60, seatCount: 2, dealMode: "humanChoice" }, update);
    TableNight.rebuy(10); // ensures a history row + a saved snapshot both exist, never cashed out
    const beforeAbandon = HistoryStore.load();
    check("the abandoned night has a row with no cash-out yet", beforeAbandon.days[0].cashedOutDollars == null);

    TableNight.finalizeAbandonedSnapshot();
    const afterAbandon = HistoryStore.load();
    check("finalizing settles the row (cashedOutDollars is no longer null)", afterAbandon.days[0].cashedOutDollars != null);
    check("the settled row is flagged as abandoned, not a normal clean cash-out", afterAbandon.days[0].abandoned === true);
    check("finalizing still left exactly one row for that night", afterAbandon.days.length === 1);

    // A SECOND sitting starting fresh (e.g. hitting "Sit Down" straight
    // past the resume banner) must also trigger this -- init() itself
    // calls finalizeAbandonedSnapshot() before resetting state.
    TableNight.clearSnapshot();
  }

  // --- A fresh sitting that's abandoned with NO rebuy/record yet is a safe no-op ---
  {
    const localStorage = makeRealLocalStorage();
    const { TableNight, HistoryStore } = buildSandbox(localStorage);
    let vs = null;
    const update = (v) => (vs = v);

    TableNight.init({ humanName: "Kevin", buyInDollars: 20, rebuyCapDollars: 60, seatCount: 2, dealMode: "humanChoice" }, update);
    // init() itself already calls recordDayProgress once, so a row exists;
    // immediately starting a SECOND night (no cash-out in between) must
    // settle the first via init()'s own finalizeAbandonedSnapshot() call,
    // not just the explicit discard-button path.
    TableNight.init({ humanName: "Kevin", buyInDollars: 20, rebuyCapDollars: 60, seatCount: 2, dealMode: "humanChoice" }, update);
    const history = HistoryStore.load();
    check("starting a new night over an unfinished one settles the old row too", history.days.length === 2);
    check("the first (abandoned) row is settled", history.days[0].cashedOutDollars != null || history.days[1].cashedOutDollars != null);
  }

  // --- lifetimeSummary: the strip shown above the Chip Ledger table ---
  {
    const localStorage = makeRealLocalStorage();
    const { TableNight, HistoryStore } = buildSandbox(localStorage);
    let vs = null;
    const update = (v) => (vs = v);

    check("an empty history summarizes to zero nights", HistoryStore.lifetimeSummary(HistoryStore.load()).nightsPlayed === 0);

    // Night 1: cash out up.
    TableNight.init({ humanName: "Kevin", buyInDollars: 20, rebuyCapDollars: 60, seatCount: 2, dealMode: "humanChoice" }, update);
    let h = HistoryStore.load();
    h.days[0].cashedOutDollars = 35;
    h.days[0].net = 15;
    HistoryStore.save(h);

    // Night 2: cash out down.
    TableNight.init({ humanName: "Kevin", buyInDollars: 20, rebuyCapDollars: 60, seatCount: 2, dealMode: "humanChoice" }, update);
    h = HistoryStore.load();
    h.days[0].cashedOutDollars = 5;
    h.days[0].net = -15;
    HistoryStore.save(h);

    // Night 3: still in progress, never settled.
    TableNight.init({ humanName: "Kevin", buyInDollars: 20, rebuyCapDollars: 60, seatCount: 2, dealMode: "humanChoice" }, update);

    const summary3 = HistoryStore.lifetimeSummary(HistoryStore.load());
    check("counts every row toward nightsPlayed, settled or not", summary3.nightsPlayed === 3);
    check("only settled rows count toward settledNights", summary3.settledNights === 2);
    check("totalNet sums every row's net (the in-progress one contributes its running net)", summary3.totalNet === 15 + -15 + 0);
    check("winRatePct is 50% (1 of 2 settled nights was a winner)", summary3.winRatePct === 50);
    check("bestNight is the +$15 night", summary3.bestNight.net === 15);
    check("worstNight is the -$15 night", summary3.worstNight.net === -15);
  }

  return summary();
}

module.exports = { run };

if (require.main === module) {
  process.exit(run());
}

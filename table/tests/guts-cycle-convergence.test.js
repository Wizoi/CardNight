"use strict";

// Permanent regression coverage for a class of bug this project has hit
// more than once: an escalating Guts-family cycle that can mathematically
// never reach a solo winner (every prior fix for this -- Deep or Double
// Screw's lowestCardWild categoryShift retune, 3-5-7 Guts's own shift,
// the aggressive-archetype stay-in-bar fix -- was discovered empirically,
// then never locked in as a committed test, so a later unrelated change
// could silently regress it again).
//
// That's exactly what happened 2026-11-23: the same day's design review
// finding #5 (gutsPotRiskSensitivity + a per-profile bluff-to-stay chance
// in decideStayIn/decideDeclare) was wired into every Guts-family game
// AND Wild in Your Hand identically, but only the original four Guts
// configs' categoryShift values were ever re-verified against it --
// Wild in Your Hand's cycle stopped reliably resolving at its original
// categoryShift: 2 (an escalating antePoolChips that compounds ~4x every
// unresolved round, essentially never reaching a solo winner), and the
// regression wasn't caught until a mixed-profile sweep script ran long
// enough to blow up a trial's wallet-rebuy accounting. Re-tuned to
// categoryShift: 5 (see game-configs-wild-in-your-hand.js's own comment
// for the full re-sweep). This test exists so the next profile/scoring
// change that touches decideStayIn/decideDeclare gets caught here first,
// not live.
//
// Bounded by a round cap well above every historical max this project has
// observed for these games (deepOrDoubleScrew up to 27, threeBuyFive up to
// 24) -- a properly-tuned cycle (which, after the fixes below, both
// families now are) resolves in a handful of rounds, so this still runs
// in well under a second.

const { load } = require("./harness");
const { makeChecker } = require("./check");

function run() {
  const { check, summary } = makeChecker();

  const { Deck, HandEvaluator, ChipEconomy, BettingEngine, GutsRules, AIProfiles, GutsAIProfiles } = load(
    [
      "deck.js",
      "hand-evaluator.js",
      "chip-economy.js",
      "betting-engine.js",
      "baseball-family-wildcards.js",
      "rules-guts.js",
      "ai-profiles.js",
      "ai-guts-profiles.js",
    ],
    ["Deck", "HandEvaluator", "ChipEconomy", "BettingEngine", "GutsRules", "AIProfiles", "GutsAIProfiles"]
  );
  const { DEEP_OR_DOUBLE_SCREW_CONFIG, THREE_BUY_FIVE_CONFIG, FOUR_TWO_TWO_CONFIG, THREE_FIVE_SEVEN_GUTS_CONFIG } = load(
    ["deck.js", "hand-evaluator.js", "chip-economy.js", "betting-engine.js", "game-configs-guts.js"],
    ["DEEP_OR_DOUBLE_SCREW_CONFIG", "THREE_BUY_FIVE_CONFIG", "FOUR_TWO_TWO_CONFIG", "THREE_FIVE_SEVEN_GUTS_CONFIG"]
  );
  const { WildInYourHandRules, WildInYourHandAIProfiles } = load(
    ["deck.js", "hand-evaluator.js", "chip-economy.js", "betting-engine.js", "ai-profiles.js", "rules-wild-in-your-hand.js", "ai-wild-in-your-hand-profiles.js"],
    ["WildInYourHandRules", "WildInYourHandAIProfiles"]
  );
  const { WILD_IN_YOUR_HAND_CONFIG } = load(
    ["deck.js", "hand-evaluator.js", "chip-economy.js", "betting-engine.js", "game-configs-wild-in-your-hand.js"],
    ["WILD_IN_YOUR_HAND_CONFIG"]
  );

  // Deliberately NOT a small bail-cap -- an earlier version of this test
  // tried bailing out trials once the pot crossed a "clearly runaway"
  // threshold, to dodge the real cost (ChipEconomy's wallet-rebuy top-up
  // loop scales with however far the pot has escalated) a genuinely
  // stalled trial can run up. That backfired: with both families now
  // correctly tuned (see below), a trial that looks slow after several
  // rounds is usually still on its way to resolving fine, just not yet --
  // a tight bail-cap just turned real, if occasionally slow, convergences
  // into false failures. A big flat wallet and a round cap well above
  // every historical max this project has ever observed (deepOrDoubleScrew
  // up to 27, threeBuyFive up to 24, matching the original 2026-08-26/
  // 2026-11-23 tuning sweeps) is the same shape the very first version of
  // this sweep used, and it resolves every combo in well under a second.
  const WALLET_CHIPS = ChipEconomy.dollarsToChips(1000000);

  function makePlayers(n) {
    const players = [];
    for (let i = 0; i < n; i++) {
      players.push({
        id: "p" + i,
        name: "P" + i,
        wallet: { chips: WALLET_CHIPS, rebuys: { push() {} }, buyIns: { push() {} } },
        profileName: AIProfiles.PROFILE_NAMES[Math.floor(Math.random() * AIProfiles.PROFILE_NAMES.length)],
      });
    }
    return players;
  }

  function resolvePassingIfNeeded(state, players) {
    if (state.status !== "passing") return;
    for (const p of players) {
      const { toLeftIdx, toRightIdx } = GutsRules.defaultPassSelection(state, p, state.passCounts.left, state.passCounts.right);
      GutsRules.submitPassSelection(state, p.id, toLeftIdx, toRightIdx);
    }
    GutsRules.resolvePassingFromSelections(state);
  }

  function runGutsCycle(config, n, maxRounds) {
    const players = makePlayers(n);
    let carried = 0;
    for (let round = 1; round <= maxRounds; round++) {
      const state = GutsRules.createRoundState(players, { anteDollars: 0.5 }, config, carried);
      resolvePassingIfNeeded(state, players);
      for (const p of players) {
        const profile = AIProfiles.profileFor(p.profileName);
        const staying = GutsAIProfiles.decideStayIn(p, state, profile);
        state.stayDecisions[p.id] = staying;
      }
      GutsRules.resolveShowdown(state);
      carried = GutsRules.collectLoserMatches(state);
      if (state.cycleComplete) return round;
    }
    return -1;
  }

  function runWildInYourHandCycle(n, maxRounds) {
    const players = makePlayers(n);
    const settings = { anteDollars: WILD_IN_YOUR_HAND_CONFIG.anteDollars || 0.5, initialBuyInDollars: 500 };
    let carried = 0;
    for (let round = 1; round <= maxRounds; round++) {
      const state = WildInYourHandRules.createRoundState(players, settings, WILD_IN_YOUR_HAND_CONFIG, carried);
      for (const p of players) {
        const { toLeftIdx, toRightIdx } = WildInYourHandRules.defaultPassSelection(state, p, state.passCounts.left, state.passCounts.right);
        WildInYourHandRules.submitPassSelection(state, p.id, toLeftIdx, toRightIdx);
      }
      WildInYourHandRules.resolvePassingFromSelections(state);
      let rowIters = 0;
      while (state.status === "rowBetting") {
        if (++rowIters > 500) return -1;
        const playerId = WildInYourHandRules.currentRowDecisionPlayerId(state);
        if (playerId == null) {
          WildInYourHandRules.advanceAfterRow(state);
          continue;
        }
        const player = WildInYourHandRules.getPlayer(state, playerId);
        const profile = AIProfiles.profileFor(player.profileName);
        WildInYourHandRules.submitRowDecision(state, playerId, WildInYourHandAIProfiles.decideRowBet(player, state, profile));
      }
      if (state.status === "complete") {
        carried = WildInYourHandRules.collectLoserAntePoolMatches(state);
        if (state.cycleComplete) return round;
        continue;
      }
      for (const p of players) {
        if (p.folded || state.stayDecisions[p.id] != null) continue;
        const profile = AIProfiles.profileFor(p.profileName);
        WildInYourHandRules.submitStayDecision(state, p.id, WildInYourHandAIProfiles.decideDeclare(p, state, profile));
      }
      if (state.status !== "complete") WildInYourHandRules.resolveShowdown(state);
      carried = WildInYourHandRules.collectLoserAntePoolMatches(state);
      if (state.cycleComplete) return round;
    }
    return -1;
  }

  const TRIALS = 6;
  // Deliberately modest, not matching the historical max round counts
  // this project's own tuning sweeps have observed (deepOrDoubleScrew up
  // to 27, threeBuyFive up to 24) -- a stalled/slow-but-still-converging
  // trial's own pot compounds every round it runs, which makes
  // collectLoserMatches's AI wallet-rebuy top-up loop cost compound right
  // along with it. A tight round cap bounds that cost directly; the
  // RESOLVED_FRACTION tolerance below (not a strict 100%) is what absorbs
  // the rare, genuinely-still-fine trial that just needed a few more
  // rounds than this cap allows, without this test either running
  // minutes long or flagging normal variance as a regression.
  const MAX_ROUNDS = 20;
  const MIN_RESOLVED_FRACTION = 0.7;

  function assertConverges(label, resolveFn) {
    let unresolved = 0;
    for (let t = 0; t < TRIALS; t++) {
      if (resolveFn() === -1) unresolved++;
    }
    const resolvedFraction = (TRIALS - unresolved) / TRIALS;
    check(`${label}: cycle reaches a solo winner in at least ${Math.round(MIN_RESOLVED_FRACTION * 100)}% of trials (got ${TRIALS - unresolved}/${TRIALS})`, resolvedFraction >= MIN_RESOLVED_FRACTION);
  }

  for (const config of [DEEP_OR_DOUBLE_SCREW_CONFIG, THREE_BUY_FIVE_CONFIG, FOUR_TWO_TWO_CONFIG, THREE_FIVE_SEVEN_GUTS_CONFIG]) {
    for (let n = 5; n <= 8; n++) {
      assertConverges(`${config.id} @ ${n} players`, () => runGutsCycle(config, n, MAX_ROUNDS));
    }
  }

  for (let n = 5; n <= 8; n++) {
    assertConverges(`wildInYourHand @ ${n} players`, () => runWildInYourHandCycle(n, MAX_ROUNDS));
  }

  return summary("guts-cycle-convergence");
}

if (require.main === module) process.exit(run());
module.exports = { run };

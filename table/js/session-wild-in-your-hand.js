"use strict";

// Orchestrates Wild in Your Hand: passing -> 3 pyramid-row reveal+bet rounds ->
// simultaneous declare -> showdown/escalate. Same gated-wrapper/`*Inner`
// phase-chaining pattern session-guts.js established (and the same real bug
// that pattern exists to avoid -- see its own comments): each phase has a
// thin gated entry point (checks/sets the shared `running` flag) plus an
// ungated `*Inner` body, and a phase transitioning straight into the next
// one calls that next phase's `*Inner` directly, never its gated wrapper.
const SessionWildInYourHand = (function () {
  function create(config) {
    const DECIDE_DELAY_MS = 450;

    const players = config.players;
    const settings = config.settings;
    const gameConfig = config.gameConfig;
    const onUpdate = config.onUpdate || (() => {});
    const onHandComplete = config.onHandComplete || (() => {});

    const dealerIndex = config.dealerIndex || 0;
    let handNumber = config.handNumber || 0;
    let carriedPotChips = config.carriedPotChips || 0;
    let state = null;
    let pending = null; // {kind: 'passSelection'} | {kind: 'rowDecision'} | {kind: 'stayDecision'}
    let passSelectionSoFar = null;
    let running = false;
    let lastQuip = null;
    let quipSeq = 0;
    const QUIP_CHANCE = 0.35;

    if (config.resumeFrom) {
      state = config.resumeFrom.state;
      pending = config.resumeFrom.pending;
      handNumber = config.resumeFrom.extra.handNumber;
      carriedPotChips = config.resumeFrom.extra.carriedPotChips;
      passSelectionSoFar = config.resumeFrom.extra.passSelectionSoFar || null;
      lastQuip = config.resumeFrom.extra.lastQuip;
      quipSeq = config.resumeFrom.extra.quipSeq;
      // Real bug, found live (2026-09-14): state.gameConfig survives the
      // JSON round-trip through localStorage as plain data, but any
      // FUNCTION-valued fields on it (this family has none today, but see
      // the sibling families that do) are silently dropped by
      // JSON.stringify -- re-attaching the real, never-serialized config
      // object here is cheap insurance against that regardless.
      if (state) state.gameConfig = gameConfig;
      if (state && state.status !== "complete" && !pending) {
        if (state.status === "passing") processPassingLoop();
        else if (state.status === "rowBetting") processRowBettingLoop();
        else processDeclareLoop();
      }
    }

    function snapshot() {
      return { state, pending, extra: { handNumber, carriedPotChips, passSelectionSoFar, lastQuip, quipSeq } };
    }

    function maybeQuip(player, moment) {
      if (player.isHuman || !player.tablePersonId) return;
      if (Math.random() > QUIP_CHANCE) return;
      const person = TablePeople.getById(player.tablePersonId);
      if (!person || !person.phrasesByMoment) return;
      const pool = person.phrasesByMoment[moment];
      const fallback = person.phrasesByMoment.general;
      const source = pool && pool.length ? pool : fallback;
      if (!source || !source.length) return;
      quipSeq += 1;
      const text = source[Math.floor(Math.random() * source.length)];
      lastQuip = { id: quipSeq, playerId: player.id, text };
      if (state) state.log.push(`${person.name}: "${text}"`);
    }

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function getHuman() {
      return players.find((p) => p.isHuman);
    }

    function notify() {
      onUpdate(getViewState());
    }

    function topUpAIWalletsIfNeeded() {
      const minChips = ChipEconomy.dollarsToChips(5);
      for (const p of players) {
        if (!p.isHuman && p.wallet.chips < minChips) {
          ChipEconomy.rebuy(p.wallet, settings.initialBuyInDollars, Date.now());
        }
      }
    }

    function canDealNextHand() {
      const anteDollars = gameConfig.anteDollars || settings.anteDollars;
      return getHuman().wallet.chips >= ChipEconomy.dollarsToChips(anteDollars);
    }

    function startFirstHand() {
      beginHand();
    }

    function dealNextHand() {
      beginHand();
    }

    function beginHand() {
      topUpAIWalletsIfNeeded();
      handNumber += 1;
      state = WildInYourHandRules.createRoundState(players, settings, gameConfig, carriedPotChips);
      carriedPotChips = 0;
      pending = null;
      passSelectionSoFar = null;
      notify();
      processPassingLoopInner();
    }

    // --- Passing ---

    async function processPassingLoop() {
      if (running) return;
      running = true;
      try {
        await processPassingLoopInner();
      } finally {
        running = false;
      }
    }

    async function processPassingLoopInner() {
      for (const p of players) {
        if (state.passSelections[p.id] != null) continue;
        if (p.isHuman) {
          pending = { kind: "passSelection" };
          if (!passSelectionSoFar) passSelectionSoFar = { assignments: {} };
          notify();
          return;
        }
        await sleep(DECIDE_DELAY_MS);
        const { toLeftIdx, toRightIdx } = WildInYourHandRules.defaultPassSelection(state, p, state.passCounts.left, state.passCounts.right);
        WildInYourHandRules.submitPassSelection(state, p.id, toLeftIdx, toRightIdx);
        notify();
      }
      pending = null;
      passSelectionSoFar = null;
      WildInYourHandRules.resolvePassingFromSelections(state);
      notify();
      await processRowBettingLoopInner();
    }

    function humanTogglePassCard(cardIndex) {
      if (!pending || pending.kind !== "passSelection") return;
      if (!passSelectionSoFar) passSelectionSoFar = { assignments: {} };
      const counts = state.passCounts;
      const assignments = passSelectionSoFar.assignments;
      const leftCount = Object.values(assignments).filter((v) => v === "left").length;
      const rightCount = Object.values(assignments).filter((v) => v === "right").length;
      const current = assignments[cardIndex];
      if (current == null) {
        if (leftCount < counts.left) assignments[cardIndex] = "left";
        else if (rightCount < counts.right) assignments[cardIndex] = "right";
      } else if (current === "left") {
        if (rightCount < counts.right) assignments[cardIndex] = "right";
        else delete assignments[cardIndex];
      } else {
        delete assignments[cardIndex];
      }
      notify();
    }

    function humanConfirmPassSelection() {
      if (!pending || pending.kind !== "passSelection" || !passSelectionSoFar) return;
      const counts = state.passCounts;
      const entries = Object.entries(passSelectionSoFar.assignments);
      const toLeftIdx = entries.filter(([, v]) => v === "left").map(([i]) => Number(i));
      const toRightIdx = entries.filter(([, v]) => v === "right").map(([i]) => Number(i));
      if (toLeftIdx.length !== counts.left || toRightIdx.length !== counts.right) return;
      WildInYourHandRules.submitPassSelection(state, getHuman().id, toLeftIdx, toRightIdx);
      pending = null;
      passSelectionSoFar = null;
      notify();
      processPassingLoop();
    }

    // --- Row betting (3 pyramid rows, flat call-or-fold each) ---

    async function processRowBettingLoop() {
      if (running) return;
      running = true;
      try {
        await processRowBettingLoopInner();
      } finally {
        running = false;
      }
    }

    async function processRowBettingLoopInner() {
      while (state.status === "rowBetting") {
        const playerId = WildInYourHandRules.currentRowDecisionPlayerId(state);
        if (playerId == null) {
          // Nobody active is left undecided for this row (allRowDecided is
          // true by construction whenever currentRowDecisionPlayerId can't
          // find anyone, given status is still "rowBetting" here).
          WildInYourHandRules.advanceAfterRow(state);
          notify();
          continue;
        }
        const player = WildInYourHandRules.getPlayer(state, playerId);
        if (player.isHuman) {
          pending = { kind: "rowDecision" };
          notify();
          return;
        }
        await sleep(DECIDE_DELAY_MS);
        const profile = AIProfiles.profileFor(player.profileName);
        const payingIn = WildInYourHandAIProfiles.decideRowBet(player, state, profile);
        if (!payingIn) maybeQuip(player, "fold");
        WildInYourHandRules.submitRowDecision(state, playerId, payingIn);
        notify();
      }
      if (state.status === "complete") {
        finishHand();
        return;
      }
      pending = null;
      await processDeclareLoopInner();
    }

    function humanRowDecision(payingIn) {
      if (!pending || pending.kind !== "rowDecision") return;
      WildInYourHandRules.submitRowDecision(state, getHuman().id, payingIn);
      pending = null;
      notify();
      processRowBettingLoop();
    }

    // --- Declare ---

    async function processDeclareLoop() {
      if (running) return;
      running = true;
      try {
        await processDeclareLoopInner();
      } finally {
        running = false;
      }
    }

    async function processDeclareLoopInner() {
      for (const p of players) {
        if (p.folded || state.stayDecisions[p.id] != null) continue;
        if (state.status === "complete") break;
        if (p.isHuman) {
          pending = { kind: "stayDecision" };
          notify();
          return;
        }
        await sleep(DECIDE_DELAY_MS);
        const profile = AIProfiles.profileFor(p.profileName);
        const stayingIn = WildInYourHandAIProfiles.decideDeclare(p, state, profile);
        WildInYourHandRules.submitStayDecision(state, p.id, stayingIn);
        notify();
      }
      pending = null;
      if (state.status !== "complete") WildInYourHandRules.resolveShowdown(state);
      finishHand();
    }

    function humanDeclare(stayingIn) {
      if (!pending || pending.kind !== "stayDecision") return;
      WildInYourHandRules.submitStayDecision(state, getHuman().id, stayingIn);
      pending = null;
      notify();
      processDeclareLoop();
    }

    function finishHand() {
      carriedPotChips = WildInYourHandRules.collectLoserAntePoolMatches(state);
      if (state.winnerId) maybeQuip(WildInYourHandRules.getPlayer(state, state.winnerId), "win");
      onHandComplete({ winnerId: state.winnerId, rainedOut: false, potChips: state.cycleComplete ? 0 : carriedPotChips });
      notify();
    }

    function getViewState() {
      return { gameId: gameConfig.id, players, dealerIndex, handNumber, state, pending, passSelectionSoFar, lastQuip };
    }

    return {
      startFirstHand,
      dealNextHand,
      canDealNextHand,
      humanTogglePassCard,
      humanConfirmPassSelection,
      humanRowDecision,
      humanDeclare,
      getViewState,
      snapshot,
    };
  }

  return { create };
})();

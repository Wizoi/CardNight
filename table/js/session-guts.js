"use strict";

// Orchestrates the open-loop Guts engine (Deep or Double Screw, 3 Buy 5 /
// 5 Buy 5, Four-Two-Two). No betting rounds at all -- ante only -- so the
// only human decision points are the stay/fold declaration every round,
// plus an optional card-exchange decision for the one game that has it.
// "Deal next hand" continues the SAME escalating pot cycle whenever the
// previous round didn't end in a solo win (games.md: the cycle only truly
// ends when exactly one player stays in and wins uncontested); a solo win
// resets the pot to zero for a fresh cycle on the next deal.
const SessionGuts = (function () {
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
    let pending = null; // {kind: 'passSelection'} | {kind: 'stayDecision'} | {kind: 'exchangeDecision', playerId}
    let exchangeQueue = [];
    let passSelectionSoFar = null; // { assignments: { [handIndex]: 'left'|'right' } } -- human's in-progress pick, while pending.kind === 'passSelection'
    let running = false;
    let lastQuip = null;
    let quipSeq = 0;
    const QUIP_CHANCE = 0.35;

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
      state = GutsRules.createRoundState(players, settings, gameConfig, carriedPotChips);
      carriedPotChips = 0;
      pending = null;
      exchangeQueue = [];
      passSelectionSoFar = null;
      notify();
      if (state.status === "passing") processPassingLoop();
      else processDeclareLoop();
    }

    // Deep or Double Screw's neighbor-passing: each player privately picks
    // which cards to send left/right before anyone's stay/fold decision.
    // AI seats decide instantly via the same lowest-non-wild-first heuristic
    // the old automatic version used; the human picks interactively via
    // humanTogglePassCard/humanConfirmPassSelection. Only once EVERYONE has
    // submitted does resolvePassingFromSelections actually redistribute the
    // cards -- so nobody's choice is informed by having already seen a
    // neighbor's post-pass hand.
    // `running` is ONE guard shared across all three chained phases
    // (passing -> declare -> exchange), deliberately: the whole sequence
    // from "kick off the next phase" to "everyone's resolved this batch,
    // pausing only where a human needs to act" is one continuous logical
    // unit of work. Each phase therefore has a thin GATED wrapper (checks/
    // sets `running`, the real entry point for beginHand and the human-
    // facing handlers below) plus an ungated `*Inner` body that does the
    // actual work -- a phase transitioning straight into the next one
    // (resolvePassingFromSelections -> declare, or declare -> exchange)
    // calls the next phase's `*Inner` directly, NOT its gated wrapper.
    //
    // This split exists because of a real, previously-shipped bug: calling
    // the gated wrapper from inside another phase's still-running `try`
    // block always no-oped (the shared flag was already `true`), silently
    // stalling the hand the moment a phase resolved without ever needing
    // to pause for a human mid-loop -- which, with exactly one human seat,
    // is the ONLY way `resolvePassingFromSelections`/afterDeclarePhase's
    // own chained call could ever actually run. Caught live testing 3 Buy
    // 5's exchange phase: every hand that reached 2+ stayers got stuck at
    // "declaring" forever with nothing pending, chips already ante'd.
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
        const { toLeftIdx, toRightIdx } = GutsRules.defaultPassSelection(state, p, state.passCounts.left, state.passCounts.right);
        GutsRules.submitPassSelection(state, p.id, toLeftIdx, toRightIdx);
        notify();
      }
      pending = null;
      passSelectionSoFar = null;
      GutsRules.resolvePassingFromSelections(state);
      notify();
      await processDeclareLoopInner();
    }

    // Clicking an unassigned card assigns it to whichever pile still has
    // room (left first, then right); clicking an already-assigned card
    // cycles it onward (left -> right -> unassigned) so a misclick is easy
    // to correct without a separate "undo" control.
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
      GutsRules.submitPassSelection(state, getHuman().id, toLeftIdx, toRightIdx);
      pending = null;
      passSelectionSoFar = null;
      notify();
      processPassingLoop();
    }

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
        if (state.stayDecisions[p.id] != null) continue;
        if (p.isHuman) {
          pending = { kind: "stayDecision" };
          notify();
          return;
        }
        await sleep(DECIDE_DELAY_MS);
        const profile = AIProfiles.profileFor(p.profileName);
        const stayingIn = GutsAIProfiles.decideStayIn(p, state, profile);
        GutsRules.submitStayDecision(state, p.id, stayingIn);
        notify();
      }
      pending = null;
      await afterDeclarePhase();
    }

    function humanDeclare(stayingIn) {
      if (!pending || pending.kind !== "stayDecision") return;
      GutsRules.submitStayDecision(state, getHuman().id, stayingIn);
      pending = null;
      notify();
      processDeclareLoop();
    }

    async function afterDeclarePhase() {
      const stayers = GutsRules.inPlayers(state);
      if (stayers.length >= 2 && gameConfig.exchangePriceDollars) {
        exchangeQueue = stayers.map((p) => p.id);
        await processExchangeLoopInner();
        return;
      }
      if (stayers.length >= 1 && gameConfig.bonusCards) {
        GutsRules.dealBonusCards(state, gameConfig.bonusCards);
        notify();
      }
      finishRound();
    }

    async function processExchangeLoop() {
      if (running) return;
      running = true;
      try {
        await processExchangeLoopInner();
      } finally {
        running = false;
      }
    }

    async function processExchangeLoopInner() {
      while (exchangeQueue.length) {
        const playerId = exchangeQueue[0];
        const player = GutsRules.getPlayer(state, playerId);
        if (player.isHuman) {
          pending = { kind: "exchangeDecision", playerId };
          notify();
          return;
        }
        exchangeQueue.shift();
        await sleep(DECIDE_DELAY_MS);
        const profile = AIProfiles.profileFor(player.profileName);
        const cardIndex = GutsAIProfiles.decideBuyExchange(player, state, profile);
        if (cardIndex >= 0) GutsRules.buyExchange(state, playerId, cardIndex);
        notify();
      }
      pending = null;
      finishRound();
    }

    function humanExchangeDecision(cardIndex) {
      if (!pending || pending.kind !== "exchangeDecision") return;
      if (cardIndex != null && cardIndex >= 0) GutsRules.buyExchange(state, pending.playerId, cardIndex);
      exchangeQueue.shift();
      pending = null;
      notify();
      processExchangeLoop();
    }

    function finishRound() {
      GutsRules.resolveShowdown(state);
      carriedPotChips = GutsRules.collectLoserMatches(state);
      if (state.winnerId) maybeQuip(GutsRules.getPlayer(state, state.winnerId), "win");
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
      humanDeclare,
      humanExchangeDecision,
      getViewState,
    };
  }

  return { create };
})();

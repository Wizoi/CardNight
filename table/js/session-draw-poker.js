"use strict";

// Orchestrates Pair of Jacks, Trips to Win: opening-qualified betting round
// -> draw -> final betting round -> showdown, redealing automatically
// (carrying the pot forward) whenever nobody could open. The human's
// decisions are the usual fold/call/raise, plus which cards to discard on
// the draw.
const SessionDrawPoker = (function () {
  function create(config) {
    const BET_DELAY_MS = 450;
    const DRAW_DELAY_MS = 450;

    const players = config.players;
    const settings = config.settings;
    const onUpdate = config.onUpdate || (() => {});
    const onHandComplete = config.onHandComplete || (() => {});
    const onBettingAction = config.onBettingAction || (() => {});
    const opponentStats = config.opponentStats || null;

    const dealerIndex = config.dealerIndex || 0;
    let handNumber = config.handNumber || 0;
    let carriedPotChips = config.carriedPotChips || 0;
    const jokerCount = (config.variantChoices && config.variantChoices.jokerCount) || 0;
    let state = null;
    let pending = null; // {kind: 'draw', playerId}
    let running = false;
    let lastQuip = null;
    let quipSeq = 0;
    const QUIP_CHANCE = 0.35;

    // Full mid-hand resume (2026-08-29) -- see the identical note in
    // session-stud.js. The no-opener auto-redeal is driven entirely by
    // state.noOpener (already-serialized data), so it needs no special
    // handling here beyond the usual state/pending restore.
    if (config.resumeFrom) {
      state = config.resumeFrom.state;
      pending = config.resumeFrom.pending;
      handNumber = config.resumeFrom.extra.handNumber;
      carriedPotChips = config.resumeFrom.extra.carriedPotChips;
      lastQuip = config.resumeFrom.extra.lastQuip;
      quipSeq = config.resumeFrom.extra.quipSeq;
      if (state) {
        state.opponentStats = opponentStats;
        if (state.status !== "complete" && !pending) processLoop();
      }
    }

    function snapshot() {
      return { state, pending, extra: { handNumber, carriedPotChips, lastQuip, quipSeq } };
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
      return getHuman().wallet.chips >= ChipEconomy.dollarsToChips(settings.anteDollars);
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
      state = RulesDrawPoker.createHandState(players, dealerIndex, settings, carriedPotChips, jokerCount);
      state.opponentStats = opponentStats;
      carriedPotChips = 0;
      pending = null;
      notify();
      processLoop();
    }

    async function processLoop() {
      if (running) return;
      running = true;
      try {
        while (state && state.status !== "complete") {
          if (state.status === "opening" || state.status === "finalBetting") {
            if (RulesDrawPoker.isBettingRoundOver(state)) {
              if (state.status === "opening") RulesDrawPoker.advanceAfterOpeningRound(state);
              else RulesDrawPoker.advanceAfterFinalBetting(state);
              notify();
              continue;
            }
            const bettorId = RulesDrawPoker.getCurrentBettor(state);
            const bettor = RulesDrawPoker.getPlayer(state, bettorId);
            if (bettor.isHuman) {
              notify();
              return;
            }
            await sleep(BET_DELAY_MS);
            const profile = AIProfiles.profileFor(bettor.profileName);
            const decision = DrawPokerAIProfiles.decideBet(bettor, state, profile);
            RulesDrawPoker.submitBet(state, bettorId, decision.action, decision.raiseDollars || 0);
            onBettingAction(bettorId, decision.action);
            notify();
            continue;
          }

          if (state.status === "drawing") {
            const playerId = RulesDrawPoker.currentDrawPlayerId(state);
            if (playerId == null) continue;
            const player = RulesDrawPoker.getPlayer(state, playerId);
            if (player.isHuman) {
              pending = { kind: "draw", playerId };
              notify();
              return;
            }
            await sleep(DRAW_DELAY_MS);
            const discardIdx = DrawPokerAIProfiles.decideDraw(player);
            RulesDrawPoker.resolveDraw(state, playerId, discardIdx);
            notify();
            continue;
          }
        }
      } finally {
        running = false;
      }
      if (state && state.status === "complete") {
        if (state.noOpener) {
          carriedPotChips = state.pot;
          notify();
          beginHand(); // redeal automatically, same pot carried forward
          return;
        }
        for (const id of state.winnerIds || []) maybeQuip(RulesDrawPoker.getPlayer(state, id), "win");
        carriedPotChips = state.pot; // nonzero only if nobody reached Trips-or-better
        onHandComplete({ winnerId: state.winnerId, rainedOut: false, potChips: state.pot });
        notify();
      }
    }

    function humanBet(action, raiseDollars) {
      const human = getHuman();
      if (!state.bettingRound || RulesDrawPoker.getCurrentBettor(state) !== human.id) return;
      RulesDrawPoker.submitBet(state, human.id, action, raiseDollars || 0);
      onBettingAction(human.id, action);
      notify();
      processLoop();
    }

    function humanDraw(discardIndices) {
      if (!pending || pending.kind !== "draw") return;
      const { playerId } = pending;
      pending = null;
      RulesDrawPoker.resolveDraw(state, playerId, discardIndices);
      notify();
      processLoop();
    }

    function getViewState() {
      return { gameId: "pairOfJacksTripsToWin", players, dealerIndex, handNumber, state, pending, lastQuip };
    }

    return {
      startFirstHand,
      dealNextHand,
      canDealNextHand,
      humanBet,
      humanDraw,
      getViewState,
      snapshot,
    };
  }

  return { create };
})();

"use strict";

// Orchestrates the shared PressYourLuckRules engine (5.5-21, 7-27). No
// betting rounds at all (see rules-press-your-luck.js) -- the human's only
// decisions are hit-or-stand each turn, plus an optional buy-back prompt
// (7-27's up-cards only) right after being dealt one.
const SessionPressYourLuck = (function () {
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
    let pending = null; // {kind: 'initialBuyback'|'hitOrStand'|'buyBack', playerId}
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
      state = PressYourLuckRules.createHandState(players, dealerIndex, settings, gameConfig, carriedPotChips);
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
          if (state.status === "dealingInitialBuyback") {
            const playerId = PressYourLuckRules.currentInitialBuybackPlayerId(state);
            const player = PressYourLuckRules.getPlayer(state, playerId);
            if (player.isHuman) {
              pending = { kind: "initialBuyback", playerId };
              notify();
              return;
            }
            await sleep(DECIDE_DELAY_MS);
            const profile = AIProfiles.profileFor(player.profileName);
            const willBuy = PressYourLuckAIProfiles.decideBuyBack(player, state, profile);
            PressYourLuckRules.resolveInitialBuyback(state, playerId, willBuy);
            notify();
            continue;
          }

          const playerId = PressYourLuckRules.currentDecisionPlayerId(state);
          if (playerId == null) break; // currentDecisionPlayerId only returns null once state.status is already "complete"
          const player = PressYourLuckRules.getPlayer(state, playerId);
          if (player.isHuman) {
            pending = { kind: "hitOrStand", playerId };
            notify();
            return;
          }
          await sleep(DECIDE_DELAY_MS);
          const profile = AIProfiles.profileFor(player.profileName);
          const action = PressYourLuckAIProfiles.decideHitOrStand(player, state, profile);
          const { needsBuyBack } = PressYourLuckRules.resolveHitOrStand(state, playerId, action);
          notify();
          if (needsBuyBack) {
            await sleep(DECIDE_DELAY_MS);
            const willBuy = PressYourLuckAIProfiles.decideBuyBack(player, state, profile);
            PressYourLuckRules.resolveBuyBack(state, playerId, willBuy);
            notify();
          }
        }
        if (state && state.status === "complete" && !state.results) {
          carriedPotChips = PressYourLuckRules.resolveShowdown(state);
          finalizeComplete();
        }
      } finally {
        running = false;
      }
    }

    function finalizeComplete() {
      const winnerIds = state.results.kitchenSink ? state.results.winnerIds : [...state.results.lowWinners, ...state.results.highWinners];
      const uniqueWinnerIds = [...new Set(winnerIds)];
      for (const id of uniqueWinnerIds) maybeQuip(PressYourLuckRules.getPlayer(state, id), "win");
      onHandComplete({ winnerId: uniqueWinnerIds[0] || null, rainedOut: false, potChips: 0 });
      notify();
    }

    function humanInitialBuyback(willBuy) {
      if (!pending || pending.kind !== "initialBuyback") return;
      PressYourLuckRules.resolveInitialBuyback(state, pending.playerId, willBuy);
      pending = null;
      notify();
      processLoop();
    }

    function humanHitOrStand(action) {
      if (!pending || pending.kind !== "hitOrStand") return;
      const { playerId } = pending;
      const { needsBuyBack } = PressYourLuckRules.resolveHitOrStand(state, playerId, action);
      pending = needsBuyBack ? { kind: "buyBack", playerId } : null;
      notify();
      if (!needsBuyBack) processLoop();
    }

    function humanBuyBack(willBuy) {
      if (!pending || pending.kind !== "buyBack") return;
      PressYourLuckRules.resolveBuyBack(state, pending.playerId, willBuy);
      pending = null;
      notify();
      processLoop();
    }

    function getViewState() {
      return { gameId: gameConfig.id, players, dealerIndex, handNumber, state, pending, lastQuip };
    }

    return {
      startFirstHand,
      dealNextHand,
      canDealNextHand,
      humanInitialBuyback,
      humanHitOrStand,
      humanBuyBack,
      getViewState,
    };
  }

  return { create };
})();

"use strict";

// Orchestrates Acey Ducey. One active player at a time; every OTHER seat
// just watches. The human's only decisions are their own bet amount (or
// pass) whenever it's their turn.
const SessionAceyDucey = (function () {
  function create(config) {
    const DEAL_DELAY_MS = 500;
    const BET_DELAY_MS = 500;

    const players = config.players;
    const settings = config.settings;
    const onUpdate = config.onUpdate || (() => {});
    const onHandComplete = config.onHandComplete || (() => {});

    const dealerIndex = config.dealerIndex || 0;
    let handNumber = config.handNumber || 0;
    let carriedPotChips = config.carriedPotChips || 0;
    let state = null;
    let pending = null; // {kind: 'bet', playerId}
    let running = false;

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
      state = AceyDuceyRules.createHandState(players, dealerIndex, settings, carriedPotChips);
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
          if (state.status === "awaitingDeal") {
            await sleep(DEAL_DELAY_MS);
            AceyDuceyRules.dealShownCards(state);
            notify();
            continue;
          }
          // awaitingBet
          const playerId = AceyDuceyRules.currentActivePlayerId(state);
          const player = AceyDuceyRules.getPlayer(state, playerId);
          if (player.isHuman) {
            pending = { kind: "bet", playerId };
            notify();
            return;
          }
          await sleep(BET_DELAY_MS);
          const profile = AIProfiles.profileFor(player.profileName);
          const betDollars = AceyDuceyAIProfiles.decideBet(player, state, profile);
          AceyDuceyRules.resolveBet(state, playerId, betDollars);
          notify();
        }
      } finally {
        running = false;
      }
      if (state && state.status === "complete") {
        carriedPotChips = state.pot;
        onHandComplete({ winnerId: null, rainedOut: false, potChips: 0 });
        notify();
      }
    }

    function humanBet(betDollars) {
      if (!pending || pending.kind !== "bet") return;
      const { playerId } = pending;
      pending = null;
      AceyDuceyRules.resolveBet(state, playerId, betDollars);
      notify();
      processLoop();
    }

    function getViewState() {
      return { gameId: "aceyDucey", players, dealerIndex, handNumber, state, pending, lastQuip: null };
    }

    return {
      startFirstHand,
      dealNextHand,
      canDealNextHand,
      humanBet,
      getViewState,
    };
  }

  return { create };
})();

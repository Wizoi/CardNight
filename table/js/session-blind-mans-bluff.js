"use strict";

// Orchestrates Blind Man's Bluff. A single betting round repeats (fresh
// each time it closes with a raise in it) on the SAME one card per player
// until a round closes with no raises at all, then showdown. The human's
// only actions are the usual fold/call/raise.
const SessionBlindMansBluff = (function () {
  function create(config) {
    const BET_DELAY_MS = 450;

    const players = config.players;
    const settings = config.settings;
    const onUpdate = config.onUpdate || (() => {});
    const onHandComplete = config.onHandComplete || (() => {});
    const onBettingAction = config.onBettingAction || (() => {});
    const opponentStats = config.opponentStats || null;

    const dealerIndex = config.dealerIndex || 0;
    let handNumber = config.handNumber || 0;
    let carriedPotChips = config.carriedPotChips || 0;
    let state = null;
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
      state = BlindMansBluffRules.createHandState(players, dealerIndex, settings, carriedPotChips);
      state.opponentStats = opponentStats;
      carriedPotChips = 0;
      notify();
      processLoop();
    }

    async function processLoop() {
      if (running) return;
      running = true;
      try {
        while (state && state.status !== "complete") {
          if (BlindMansBluffRules.isBettingRoundOver(state)) {
            BlindMansBluffRules.advanceAfterBettingRound(state);
            notify();
            continue;
          }
          const bettorId = BlindMansBluffRules.getCurrentBettor(state);
          const bettor = BlindMansBluffRules.getPlayer(state, bettorId);
          if (bettor.isHuman) {
            notify();
            return;
          }
          await sleep(BET_DELAY_MS);
          const profile = AIProfiles.profileFor(bettor.profileName);
          const decision = BlindMansBluffAIProfiles.decideBet(bettor, state, profile);
          BlindMansBluffRules.submitBet(state, bettorId, decision.action, decision.raiseDollars || 0);
          onBettingAction(bettorId, decision.action);
          notify();
        }
      } finally {
        running = false;
      }
      if (state && state.status === "complete") {
        carriedPotChips = 0;
        onHandComplete({ winnerId: state.winnerId, rainedOut: false, potChips: 0 });
        notify();
      }
    }

    function humanBet(action, raiseDollars) {
      const human = getHuman();
      if (!state.bettingRound || BlindMansBluffRules.getCurrentBettor(state) !== human.id) return;
      BlindMansBluffRules.submitBet(state, human.id, action, raiseDollars || 0);
      onBettingAction(human.id, action);
      notify();
      processLoop();
    }

    function getViewState() {
      return { gameId: "blindMansBluff", players, dealerIndex, handNumber, state, pending: null, lastQuip: null };
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

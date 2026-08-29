"use strict";

// Orchestrates 3-33. The only live decision is the usual fold/call/raise
// -- one betting round after the deal, another after each of the 5
// reveals. The reveal itself stays fully mechanical and human-paced (a
// "Reveal next card" click), same rhythm as before.
const Session333 = (function () {
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

    // Full mid-hand resume (2026-08-29) -- see the identical note in
    // session-stud.js. No `pending` and no quips here; calling
    // processLoop() unconditionally is safe even mid-reveal (its own while
    // condition is `state.status === "betting"`, a no-op otherwise).
    if (config.resumeFrom) {
      state = config.resumeFrom.state;
      handNumber = config.resumeFrom.extra.handNumber;
      carriedPotChips = config.resumeFrom.extra.carriedPotChips;
      if (state) {
        state.opponentStats = opponentStats;
        if (state.status !== "complete") processLoop();
      }
    }

    function snapshot() {
      return { state, pending: null, extra: { handNumber, carriedPotChips } };
    }

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
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

    function getHuman() {
      return players.find((p) => p.isHuman);
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
      state = Rules333.createHandState(players, dealerIndex, settings, carriedPotChips);
      state.opponentStats = opponentStats;
      carriedPotChips = 0;
      notify();
      if (state.status === "complete") {
        finalizeComplete();
        return;
      }
      processLoop();
    }

    async function processLoop() {
      if (running) return;
      running = true;
      try {
        while (state && state.status === "betting") {
          if (Rules333.isBettingRoundOver(state)) {
            Rules333.advanceAfterBetting(state);
            notify();
            continue;
          }
          const bettorId = Rules333.getCurrentBettor(state);
          const bettor = Rules333.getPlayer(state, bettorId);
          if (bettor.isHuman) {
            notify();
            return;
          }
          await sleep(BET_DELAY_MS);
          const profile = AIProfiles.profileFor(bettor.profileName);
          const decision = Rules333AIProfiles.decideBet(bettor, state, profile);
          Rules333.submitBet(state, bettorId, decision.action, decision.raiseDollars || 0);
          onBettingAction(bettorId, decision.action);
          notify();
        }
      } finally {
        running = false;
      }
      if (state && state.status === "complete") finalizeComplete();
      // else: status is "revealing" -- pause here, waiting for the human's
      // explicit "reveal next card" click.
    }

    function humanBet(action, raiseDollars) {
      const human = getHuman();
      if (!state.bettingRound || Rules333.getCurrentBettor(state) !== human.id) return;
      Rules333.submitBet(state, human.id, action, raiseDollars || 0);
      onBettingAction(human.id, action);
      notify();
      processLoop();
    }

    function humanRevealNext() {
      if (!state || Rules333.isRevealDone(state)) return;
      Rules333.revealNextCommunityCard(state);
      notify();
      if (state.status === "complete") {
        finalizeComplete();
        return;
      }
      processLoop();
    }

    function finalizeComplete() {
      onHandComplete({ winnerId: state.winnerId, rainedOut: false, potChips: 0 });
    }

    function getViewState() {
      return { gameId: "threeThirtyThree", players, dealerIndex, handNumber, state, pending: null, lastQuip: null };
    }

    return {
      startFirstHand,
      dealNextHand,
      canDealNextHand,
      humanBet,
      humanRevealNext,
      getViewState,
      snapshot,
    };
  }

  return { create };
})();

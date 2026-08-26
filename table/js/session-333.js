"use strict";

// Orchestrates 3-33. No player decisions exist at all -- every reveal's
// discard resolution is fully mechanical -- so this session only manages
// pacing: the human clicks to reveal each of the 5 community cards (or the
// hand ends early via Ultima/an outright empty-hand win), same click-to-
// advance rhythm every other game in this app uses for its own reveals.
const Session333 = (function () {
  function create(config) {
    const REVEAL_DELAY_MS = 500;

    const players = config.players;
    const settings = config.settings;
    const onUpdate = config.onUpdate || (() => {});
    const onHandComplete = config.onHandComplete || (() => {});

    const dealerIndex = config.dealerIndex || 0;
    let handNumber = config.handNumber || 0;
    let carriedPotChips = config.carriedPotChips || 0;
    let state = null;

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
      carriedPotChips = 0;
      notify();
      if (state.status === "complete") finalizeComplete();
    }

    function humanRevealNext() {
      if (!state || Rules333.isRevealDone(state)) return;
      Rules333.revealNextCommunityCard(state);
      notify();
      if (state.status === "complete") finalizeComplete();
    }

    function finalizeComplete() {
      onHandComplete({ winnerId: null, rainedOut: false, potChips: 0 });
    }

    function getViewState() {
      return { gameId: "threeThirtyThree", players, dealerIndex, handNumber, state, pending: null, lastQuip: null };
    }

    return {
      startFirstHand,
      dealNextHand,
      canDealNextHand,
      humanRevealNext,
      getViewState,
    };
  }

  return { create };
})();

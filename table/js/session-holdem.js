"use strict";

// Orchestrates one game's hand loop for the shared Hold'em engine (Omaha,
// Seattle, Boise, Jersey Hold'em). No buy/wipe/reveal decisions at all —
// blinds are posted automatically and the board deals itself street by
// street — so the human's only actions are betting.
const SessionHoldem = (function () {
  function create(config) {
    const DEAL_DELAY_MS = 450;
    const BET_DELAY_MS = 450;

    const players = config.players;
    const settings = config.settings;
    const gameConfig = config.gameConfig;
    const onUpdate = config.onUpdate || (() => {});
    const onHandComplete = config.onHandComplete || (() => {});
    const onBettingAction = config.onBettingAction || (() => {});
    const opponentStats = config.opponentStats || null;

    let dealerIndex = config.dealerIndex || 0;
    let handNumber = config.handNumber || 0;
    let state = null;
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
      return getHuman().wallet.chips >= ChipEconomy.dollarsToChips(gameConfig.bigBlindDollars);
    }

    function startFirstHand() {
      beginHand();
    }

    function dealNextHand() {
      dealerIndex = (dealerIndex + 1) % players.length;
      beginHand();
    }

    function beginHand() {
      topUpAIWalletsIfNeeded();
      handNumber += 1;
      state = HoldemRules.createHandState(players, dealerIndex, settings, handNumber, gameConfig);
      state.opponentStats = opponentStats;
      notify();
      processTurnLoop();
    }

    async function processTurnLoop() {
      if (running) return;
      running = true;
      try {
        while (state && state.status !== "complete") {
          if (state.bettingRound) {
            const bettorId = HoldemRules.getCurrentBettor(state);
            if (bettorId == null) {
              if (state.status === "complete") break;
              await sleep(DEAL_DELAY_MS);
              HoldemRules.advanceStreet(state);
              notify();
              continue;
            }
            const bettor = HoldemRules.getPlayer(state, bettorId);
            if (bettor.isHuman) {
              notify();
              break;
            }
            await sleep(BET_DELAY_MS);
            const profile = AIProfiles.profileFor(bettor.profileName);
            const decision = HoldemAIProfiles.decideBet(bettor, state, profile);
            HoldemRules.submitBet(state, bettorId, decision.action, decision.raiseDollars || 0);
            onBettingAction(bettorId, decision.action);
            if (decision.action === "raise") maybeQuip(bettor, "raise");
            notify();
            continue;
          }
          // No active betting round and not complete shouldn't normally
          // happen (advanceStreet always starts one or resolves the
          // showdown) -- guard defensively rather than spin.
          break;
        }
      } finally {
        running = false;
      }
      if (state && state.status === "complete") {
        for (const id of state.highWinnerIds) maybeQuip(HoldemRules.getPlayer(state, id), "win");
        onHandComplete({ winnerId: state.highWinnerIds[0] || null, rainedOut: false, potChips: 0 });
        notify();
      }
    }

    function humanBet(action, raiseDollars) {
      const human = getHuman();
      if (!state.bettingRound || HoldemRules.getCurrentBettor(state) !== human.id) return;
      HoldemRules.submitBet(state, human.id, action, raiseDollars || 0);
      onBettingAction(human.id, action);
      notify();
      processTurnLoop();
    }

    function getViewState() {
      return { gameId: gameConfig.id, players, dealerIndex, handNumber, state, pending: null, lastQuip };
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

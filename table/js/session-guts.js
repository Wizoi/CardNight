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
    let pending = null; // {kind: 'stayDecision'} | {kind: 'exchangeDecision', playerId}
    let exchangeQueue = [];
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
      notify();
      processDeclareLoop();
    }

    async function processDeclareLoop() {
      if (running) return;
      running = true;
      try {
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
      } finally {
        running = false;
      }
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
        await processExchangeLoop();
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
      } finally {
        running = false;
      }
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
      return { gameId: gameConfig.id, players, dealerIndex, handNumber, state, pending, lastQuip };
    }

    return {
      startFirstHand,
      dealNextHand,
      canDealNextHand,
      humanDeclare,
      humanExchangeDecision,
      getViewState,
    };
  }

  return { create };
})();

"use strict";

// Orchestrates Game of Life: a repeating flip-choice -> bet -> flip-choice
// loop until all 10 table cards (good + bad rows) are flipped, then
// showdown. The human's only decisions are which row to flip from on
// their turn, and the usual fold/call/raise.
const SessionGameOfLife = (function () {
  function create(config) {
    const FLIP_DELAY_MS = 450;
    const BET_DELAY_MS = 450;

    const players = config.players;
    const settings = config.settings;
    const onUpdate = config.onUpdate || (() => {});
    const onHandComplete = config.onHandComplete || (() => {});

    const dealerIndex = config.dealerIndex || 0;
    let handNumber = config.handNumber || 0;
    let carriedPotChips = config.carriedPotChips || 0;
    let state = null;
    let pending = null; // {kind: 'flipChoice', playerId}
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
      state = RulesGameOfLife.createHandState(players, dealerIndex, settings, carriedPotChips);
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
          if (state.status === "flipping") {
            const playerId = RulesGameOfLife.currentFlipPlayerId(state);
            if (playerId == null) break;
            const player = RulesGameOfLife.getPlayer(state, playerId);
            if (player.isHuman) {
              pending = { kind: "flipChoice", playerId };
              notify();
              return;
            }
            await sleep(FLIP_DELAY_MS);
            const rowChoice = GameOfLifeAIProfiles.decideFlipChoice(player, state);
            RulesGameOfLife.resolveFlip(state, playerId, rowChoice);
            notify();
            continue;
          }

          // bettingAfterFlip
          if (RulesGameOfLife.isBettingRoundOver(state)) {
            RulesGameOfLife.advanceAfterBetting(state);
            notify();
            continue;
          }
          const bettorId = RulesGameOfLife.getCurrentBettor(state);
          const bettor = RulesGameOfLife.getPlayer(state, bettorId);
          if (bettor.isHuman) {
            notify();
            return;
          }
          await sleep(BET_DELAY_MS);
          const profile = AIProfiles.profileFor(bettor.profileName);
          const decision = GameOfLifeAIProfiles.decideBet(bettor, state, profile);
          RulesGameOfLife.submitBet(state, bettorId, decision.action, decision.raiseDollars || 0);
          notify();
        }
      } finally {
        running = false;
      }
      if (state && state.status === "complete") {
        for (const id of state.winnerIds || []) maybeQuip(RulesGameOfLife.getPlayer(state, id), "win");
        onHandComplete({ winnerId: state.winnerId, rainedOut: false, potChips: 0 });
        notify();
      }
    }

    function humanFlipChoice(rowChoice) {
      if (!pending || pending.kind !== "flipChoice") return;
      const { playerId } = pending;
      pending = null;
      RulesGameOfLife.resolveFlip(state, playerId, rowChoice);
      notify();
      processLoop();
    }

    function humanBet(action, raiseDollars) {
      const human = getHuman();
      if (!state.bettingRound || RulesGameOfLife.getCurrentBettor(state) !== human.id) return;
      RulesGameOfLife.submitBet(state, human.id, action, raiseDollars || 0);
      notify();
      processLoop();
    }

    function getViewState() {
      return { gameId: "gameOfLife", players, dealerIndex, handNumber, state, pending, lastQuip };
    }

    return {
      startFirstHand,
      dealNextHand,
      canDealNextHand,
      humanFlipChoice,
      humanBet,
      getViewState,
    };
  }

  return { create };
})();

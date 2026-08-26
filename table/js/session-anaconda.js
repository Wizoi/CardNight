"use strict";

// Orchestrates Anaconda: discard-3-and-pass -> bet -> discard-2 -> bet ->
// 5 simultaneous reveal-and-bet rounds -> showdown. The human's decisions
// are which cards to discard (twice) and the usual fold/call/raise.
const SessionAnaconda = (function () {
  function create(config) {
    const DECIDE_DELAY_MS = 450;
    const BET_DELAY_MS = 450;
    const REVEAL_DELAY_MS = 500;

    const players = config.players;
    const settings = config.settings;
    const onUpdate = config.onUpdate || (() => {});
    const onHandComplete = config.onHandComplete || (() => {});

    const dealerIndex = config.dealerIndex || 0;
    let handNumber = config.handNumber || 0;
    let carriedPotChips = config.carriedPotChips || 0;
    let state = null;
    let pending = null; // {kind: 'discard1'|'discard2', playerId}
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
      state = RulesAnaconda.createHandState(players, dealerIndex, settings, carriedPotChips);
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
          if (state.status === "discard1" || state.status === "discard2") {
            const kind = state.status;
            const submitted = kind === "discard1" ? state.passSelections : state.discardSelections;
            const nextPlayer = RulesAnaconda.activePlayers(state).find((p) => submitted[p.id] == null);
            if (!nextPlayer) {
              if (kind === "discard1") RulesAnaconda.resolvePassing(state);
              else RulesAnaconda.resolveDiscard2(state);
              notify();
              continue;
            }
            if (nextPlayer.isHuman) {
              pending = { kind, playerId: nextPlayer.id };
              notify();
              return;
            }
            await sleep(DECIDE_DELAY_MS);
            const discardIdx = kind === "discard1" ? AnacondaAIProfiles.decideDiscard1(nextPlayer) : AnacondaAIProfiles.decideDiscard2(nextPlayer);
            if (kind === "discard1") RulesAnaconda.submitDiscard1(state, nextPlayer.id, discardIdx);
            else RulesAnaconda.submitDiscard2(state, nextPlayer.id, discardIdx);
            notify();
            continue;
          }

          if (state.status === "revealing") {
            await sleep(REVEAL_DELAY_MS);
            RulesAnaconda.resolveRevealRound(state);
            notify();
            continue;
          }

          // betting1 / betting2 / revealingBet
          if (RulesAnaconda.isBettingRoundOver(state)) {
            RulesAnaconda.advanceAfterBetting(state);
            notify();
            continue;
          }
          const bettorId = RulesAnaconda.getCurrentBettor(state);
          const bettor = RulesAnaconda.getPlayer(state, bettorId);
          if (bettor.isHuman) {
            notify();
            return;
          }
          await sleep(BET_DELAY_MS);
          const profile = AIProfiles.profileFor(bettor.profileName);
          const decision = AnacondaAIProfiles.decideBet(bettor, state, profile);
          RulesAnaconda.submitBet(state, bettorId, decision.action, decision.raiseDollars || 0);
          notify();
        }
      } finally {
        running = false;
      }
      if (state && state.status === "complete") {
        for (const id of state.winnerIds || []) maybeQuip(RulesAnaconda.getPlayer(state, id), "win");
        onHandComplete({ winnerId: state.winnerId, rainedOut: false, potChips: 0 });
        notify();
      }
    }

    function humanDiscard(discardIndices) {
      if (!pending || (pending.kind !== "discard1" && pending.kind !== "discard2")) return;
      const { kind, playerId } = pending;
      pending = null;
      if (kind === "discard1") RulesAnaconda.submitDiscard1(state, playerId, discardIndices);
      else RulesAnaconda.submitDiscard2(state, playerId, discardIndices);
      notify();
      processLoop();
    }

    function humanBet(action, raiseDollars) {
      const human = getHuman();
      if (!state.bettingRound || RulesAnaconda.getCurrentBettor(state) !== human.id) return;
      RulesAnaconda.submitBet(state, human.id, action, raiseDollars || 0);
      notify();
      processLoop();
    }

    function getViewState() {
      return { gameId: "anaconda", players, dealerIndex, handNumber, state, pending, lastQuip };
    }

    return {
      startFirstHand,
      dealNextHand,
      canDealNextHand,
      humanDiscard,
      humanBet,
      getViewState,
    };
  }

  return { create };
})();

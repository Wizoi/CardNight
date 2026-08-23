"use strict";

// Orchestrates one game's hand loop for the shared stud engine (Daytime
// Baseball, Rainy Day Baseball, and future stud-family games). Dealing is
// dealer-driven and simultaneous per street rather than Midnight Baseball's
// player-paced reveal, so there's no humanFlipCard/humanConcede here — the
// human's only choice points are a buy-3/9/4 decision when dealt one, and
// betting.
//
// config: { players, settings, dealerIndex, handNumber, gameConfig,
//           gameMemory, onUpdate, onHandComplete }
//   - gameMemory: persists across hands of this one game sitting (e.g.
//     Rainy Day's rain-out escalation counter) — owned by table-night.js,
//     reset fresh whenever this game is newly picked.
//   - onHandComplete({winnerId, rainedOut, potChips}): rainedOut hands have
//     no winner and their pot is meant to carry into the next hand, so the
//     caller needs to know potChips to seed the next createHandState call.
const SessionStud = (function () {
  function create(config) {
    const FLIP_DELAY_MS = 450;
    const DECISION_DELAY_MS = 450;
    const BET_DELAY_MS = 450;

    const players = config.players;
    const settings = config.settings;
    const gameConfig = config.gameConfig;
    const gameMemory = config.gameMemory || {};
    const onUpdate = config.onUpdate || (() => {});
    const onHandComplete = config.onHandComplete || (() => {});

    let dealerIndex = config.dealerIndex || 0;
    let handNumber = config.handNumber || 0;
    let carriedPotChips = config.carriedPotChips || 0;
    let state = null;
    let pending = null; // {kind: 'buy3'|'buy9'|'buy4', playerId}
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
      dealerIndex = (dealerIndex + 1) % players.length;
      beginHand();
    }

    function beginHand() {
      topUpAIWalletsIfNeeded();
      handNumber += 1;
      state = StudRules.createHandState(players, dealerIndex, settings, handNumber, gameConfig, gameMemory, carriedPotChips);
      carriedPotChips = 0;
      pending = null;
      notify();
      processTurnLoop();
    }

    function resolveBuyDecision(kind, playerId, willBuy) {
      const player = StudRules.getPlayer(state, playerId);
      if (kind === "buy3") {
        const { declined } = StudRules.resolveBuy3(state, playerId, willBuy);
        if (!declined) maybeQuip(player, "buyWild");
        else StudRules.declineThreeAndFold(state, playerId);
      } else if (kind === "buy9") {
        StudRules.resolveBuy9(state, playerId, willBuy);
        if (willBuy) maybeQuip(player, "buyWild");
      } else if (kind === "buy4") {
        StudRules.resolveBuy4(state, playerId, willBuy);
        if (willBuy) maybeQuip(player, "buyBonus");
      } else if (kind === "wipe") {
        StudRules.resolveWipe(state, playerId, willBuy);
      }
    }

    async function processTurnLoop() {
      if (running) return;
      running = true;
      try {
        while (state && state.status !== "complete") {
          if (state.bettingRound) {
            const bettorId = StudRules.getCurrentBettor(state);
            if (bettorId == null) {
              if (state.status === "complete") break;
              StudRules.advanceStreet(state);
              notify();
              continue;
            }
            const bettor = StudRules.getPlayer(state, bettorId);
            if (bettor.isHuman) {
              notify();
              break;
            }
            await sleep(BET_DELAY_MS);
            const profile = AIProfiles.profileFor(bettor.profileName);
            const decision = StudAIProfiles.decideBet(bettor, state, profile);
            StudRules.submitBet(state, bettorId, decision.action, decision.raiseDollars || 0);
            if (decision.action === "raise") maybeQuip(bettor, "raise");
            notify();
            continue;
          }

          if (StudRules.isStreetDealingComplete(state)) {
            const street = StudRules.currentStreet(state);
            if (street.bettingAfter) StudRules.startBettingRound(state);
            else StudRules.advanceStreet(state);
            notify();
            continue;
          }

          await sleep(FLIP_DELAY_MS);
          const dealt = StudRules.dealNextCard(state);
          notify();
          if (dealt.rainedOut) {
            StudRules.completeHandRainedOut(state);
            break;
          }
          if (dealt.exhausted) {
            StudRules.resolveShowdown(state);
            break;
          }
          if (dealt.needsDecision) {
            const player = StudRules.getPlayer(state, dealt.playerId);
            if (player.isHuman) {
              pending = { kind: dealt.needsDecision, playerId: dealt.playerId };
              notify();
              break;
            }
            const profile = AIProfiles.profileFor(player.profileName);
            const willBuy =
              dealt.needsDecision === "wipe"
                ? StudAIProfiles.decideWipe(player, dealt.card, profile, StudRules.currentWipePriceDollars(state))
                : StudAIProfiles.decideBuyOnDeal(player, dealt.card, profile);
            await sleep(DECISION_DELAY_MS);
            resolveBuyDecision(dealt.needsDecision, dealt.playerId, willBuy);
            notify();
          }
        }
      } finally {
        running = false;
      }
      if (state && state.status === "complete") {
        if (state.winnerId) maybeQuip(StudRules.getPlayer(state, state.winnerId), "win");
        if (state.rainedOut) carriedPotChips = state.pot; // seeds the next beginHand() call
        onHandComplete({ winnerId: state.winnerId, rainedOut: state.rainedOut, potChips: state.rainedOut ? state.pot : 0 });
        notify();
      }
    }

    function humanResolveBuy(willBuy) {
      if (!pending) return;
      const { kind, playerId } = pending;
      pending = null;
      resolveBuyDecision(kind, playerId, willBuy);
      notify();
      processTurnLoop();
    }

    function humanBet(action, raiseDollars) {
      const human = getHuman();
      if (!state.bettingRound || StudRules.getCurrentBettor(state) !== human.id) return;
      StudRules.submitBet(state, human.id, action, raiseDollars || 0);
      notify();
      processTurnLoop();
    }

    function getViewState() {
      return { gameId: gameConfig.id, players, dealerIndex, handNumber, state, pending, lastQuip };
    }

    return {
      startFirstHand,
      dealNextHand,
      canDealNextHand,
      humanResolveBuy,
      humanBet,
      getViewState,
    };
  }

  return { create };
})();

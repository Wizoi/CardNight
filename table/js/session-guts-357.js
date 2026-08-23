"use strict";

// Orchestrates 3-5-7 Guts's fixed 3-round hand. Unlike the open-loop guts
// games, all 3 rounds play out automatically within ONE "deal next hand"
// click -- only human stay/fold decisions pause the loop -- since there's
// no early end to expose as a separate button press.
const SessionGuts357 = (function () {
  function create(config) {
    const DECIDE_DELAY_MS = 450;

    const players = config.players;
    const settings = config.settings;
    const onUpdate = config.onUpdate || (() => {});
    const onHandComplete = config.onHandComplete || (() => {});

    const dealerIndex = config.dealerIndex || 0;
    let handNumber = config.handNumber || 0;
    let carriedPotChips = config.carriedPotChips || 0;
    let state = null;
    let pending = null; // {kind: 'stayDecision'}
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
      state = Guts357Rules.createHandState(players, settings, carriedPotChips);
      carriedPotChips = 0;
      pending = null;
      Guts357Rules.dealRound(state);
      notify();
      processDeclareLoop();
    }

    async function processDeclareLoop() {
      if (running) return;
      running = true;
      try {
        while (state.status !== "complete") {
          const eligible = Guts357Rules.eligiblePlayers(state);
          let humanIsPending = false;
          for (const p of eligible) {
            if (state.stayDecisions[p.id] != null) continue;
            if (p.isHuman) {
              pending = { kind: "stayDecision" };
              notify();
              humanIsPending = true;
              break;
            }
            await sleep(DECIDE_DELAY_MS);
            const profile = AIProfiles.profileFor(p.profileName);
            const stayingIn = Guts357Rules.decideStayIn(state, p, profile);
            Guts357Rules.submitStayDecision(state, p.id, stayingIn);
            notify();
          }
          if (humanIsPending) return;

          Guts357Rules.advanceAfterDeclaring(state);
          notify();
          if (state.status === "complete") break;
          Guts357Rules.dealRound(state);
          notify();
        }
      } finally {
        running = false;
      }
      if (state && state.status === "complete") {
        carriedPotChips = state.pot;
        if (state.winnerId) maybeQuip(Guts357Rules.getPlayer(state, state.winnerId), "win");
        onHandComplete({ winnerId: state.winnerId, rainedOut: false, potChips: state.noContest ? carriedPotChips : 0 });
        notify();
      }
    }

    function humanDeclare(stayingIn) {
      if (!pending || pending.kind !== "stayDecision") return;
      Guts357Rules.submitStayDecision(state, getHuman().id, stayingIn);
      pending = null;
      notify();
      processDeclareLoop();
    }

    function getViewState() {
      return { gameId: "threeFiveSeven", players, dealerIndex, handNumber, state, pending, lastQuip };
    }

    return {
      startFirstHand,
      dealNextHand,
      canDealNextHand,
      humanDeclare,
      getViewState,
    };
  }

  return { create };
})();

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
    const recentResults = config.recentResults || null;

    const dealerIndex = config.dealerIndex || 0;
    let handNumber = config.handNumber || 0;
    let carriedPotChips = config.carriedPotChips || 0;
    let state = null;
    let running = false;
    let lastQuip = null;
    let quipSeq = 0;
    const QUIP_CHANCE = 0.35;

    // Full mid-hand resume (2026-08-29) -- see the identical note in
    // session-stud.js. No `pending` here; calling processLoop()
    // unconditionally is safe even mid-reveal (its own while condition is
    // `state.status === "betting"`, a no-op otherwise).
    if (config.resumeFrom) {
      state = config.resumeFrom.state;
      handNumber = config.resumeFrom.extra.handNumber;
      carriedPotChips = config.resumeFrom.extra.carriedPotChips;
      lastQuip = config.resumeFrom.extra.lastQuip;
      quipSeq = config.resumeFrom.extra.quipSeq;
      if (state) {
        state.opponentStats = opponentStats;
        state.recentResults = recentResults;
        if (state.status !== "complete") processLoop();
      }
    }

    function snapshot() {
      return { state, pending: null, extra: { handNumber, carriedPotChips, lastQuip, quipSeq } };
    }

    // 2026-11-23: this game previously had no quip wiring at all (the
    // design review's finding #2 -- "3-33... none at all"), even though it
    // has a full fold/call/raise betting round after every one of its 5
    // reveals. Same shared selection logic as every other family now.
    function maybeQuip(player, moment) {
      const picked = TableQuips.pickQuip(player, moment, QUIP_CHANCE, state.recentResults && state.recentResults[player.id]);
      if (!picked) return;
      quipSeq += 1;
      lastQuip = { id: quipSeq, playerId: player.id, text: picked.text };
      if (state) state.log.push(`${picked.personName}: "${picked.text}"`);
    }

    function sleep(ms) {
      // Routed through TableFX.paceDelay so the 1x/2x/Turbo AI-speed
      // setting scales real AI-turn pacing only -- never a blanket
      // window.setTimeout patch that could also speed up unrelated timers.
      const scaled = typeof TableFX !== "undefined" && typeof TableFX.paceDelay === "function" ? TableFX.paceDelay(ms) : ms;
      return new Promise((resolve) => setTimeout(resolve, scaled));
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
      state.recentResults = recentResults;
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
          await sleep(BET_DELAY_MS * AIProfiles.tempoFor(bettor.profileName, state.recentResults && state.recentResults[bettor.id]));
          const profile = AIProfiles.profileForState(bettor.profileName, state.recentResults && state.recentResults[bettor.id]);
          const decision = Rules333AIProfiles.decideBet(bettor, state, profile);
          Rules333.submitBet(state, bettorId, decision.action, decision.raiseDollars || 0);
          onBettingAction(bettorId, decision.action, state.bettingRound);
          if (decision.action === "raise") maybeQuip(bettor, "raise");
          else if (decision.action === "fold") maybeQuip(bettor, "fold");
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
      onBettingAction(human.id, action, state.bettingRound);
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
      if (state.winnerId) maybeQuip(Rules333.getPlayer(state, state.winnerId), "win");
      onHandComplete({ winnerId: state.winnerId, rainedOut: false, potChips: 0 });
    }

    function getViewState() {
      return { gameId: "threeThirtyThree", players, dealerIndex, handNumber, state, pending: null, lastQuip };
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

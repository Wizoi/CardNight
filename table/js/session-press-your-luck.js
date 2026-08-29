"use strict";

// Orchestrates the shared PressYourLuckRules engine (5.5-21, 7-27). Both
// games are bettingEnabled now (see rules-press-your-luck.js): a real
// betting round right after the deal, and another after every full
// hit-or-stand lap. The human's decisions are hit-or-stand each turn, an
// optional buy-back prompt (7-27's up-cards only) right after being dealt
// one, and fold/call/raise whenever a betting round is open.
const SessionPressYourLuck = (function () {
  function create(config) {
    const DECIDE_DELAY_MS = 450;

    const players = config.players;
    const settings = config.settings;
    const gameConfig = config.gameConfig;
    const onUpdate = config.onUpdate || (() => {});
    const onHandComplete = config.onHandComplete || (() => {});
    const onBettingAction = config.onBettingAction || (() => {});
    const opponentStats = config.opponentStats || null;

    const dealerIndex = config.dealerIndex || 0;
    let handNumber = config.handNumber || 0;
    let carriedPotChips = config.carriedPotChips || 0;
    let state = null;
    let pending = null; // {kind: 'initialBuyback'|'hitOrStand'|'buyBack', playerId}
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
      state = PressYourLuckRules.createHandState(players, dealerIndex, settings, gameConfig, carriedPotChips);
      state.opponentStats = opponentStats;
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
          if (state.status === "dealingInitialBuyback") {
            const playerId = PressYourLuckRules.currentInitialBuybackPlayerId(state);
            const player = PressYourLuckRules.getPlayer(state, playerId);
            if (player.isHuman) {
              pending = { kind: "initialBuyback", playerId };
              notify();
              return;
            }
            await sleep(DECIDE_DELAY_MS);
            const profile = AIProfiles.profileFor(player.profileName);
            const choice = PressYourLuckAIProfiles.decideBuyBack(player, state, profile);
            // resolveInitialBuyback only advances the cursor once this
            // player is genuinely done (declines, or hits maxBuys) --
            // `continue` re-enters this same branch and re-fetches
            // currentInitialBuybackPlayerId, which naturally chains
            // another decision for the SAME player when needed, with no
            // special-casing required here.
            PressYourLuckRules.resolveInitialBuyback(state, playerId, choice);
            notify();
            continue;
          }

          if (state.status === "betting") {
            if (PressYourLuckRules.isBettingRoundOver(state)) {
              PressYourLuckRules.advanceAfterBetting(state);
              notify();
              continue;
            }
            const bettorId = PressYourLuckRules.getCurrentBettor(state);
            const bettor = PressYourLuckRules.getPlayer(state, bettorId);
            if (bettor.isHuman) {
              pending = { kind: "bet", playerId: bettorId };
              notify();
              return;
            }
            await sleep(DECIDE_DELAY_MS);
            const profile = AIProfiles.profileFor(bettor.profileName);
            const decision = PressYourLuckAIProfiles.decideBet(bettor, state, profile);
            if (decision.action === "fold") maybeQuip(bettor, "fold");
            else if (decision.action === "raise") maybeQuip(bettor, "raise");
            PressYourLuckRules.submitBet(state, bettorId, decision.action, decision.raiseDollars);
            onBettingAction(bettorId, decision.action);
            notify();
            continue;
          }

          const playerId = PressYourLuckRules.currentDecisionPlayerId(state);
          if (playerId == null) continue;
          // currentDecisionPlayerId's internal skip-cascade (auto-advancing
          // past already-standing/folded players) can itself cross a lap
          // boundary and flip state.status to "betting" (via advanceCursor,
          // whenever gameConfig.bettingEnabled) -- not just to "complete".
          // A bare `break` here used to abandon the hand entirely the
          // instant that happened purely via skipping (as opposed to via an
          // actual resolveHitOrStand call, which already loops back through
          // the top of this while and picks the new status up correctly):
          // the betting round was left freshly started with nobody ever
          // asked to act, silently hanging the hand forever. `continue`
          // lets the loop's own top-of-iteration status check route into
          // the right branch instead ("betting", or the natural exit once
          // status is genuinely "complete").
          const player = PressYourLuckRules.getPlayer(state, playerId);
          if (player.isHuman) {
            pending = { kind: "hitOrStand", playerId };
            notify();
            return;
          }
          await sleep(DECIDE_DELAY_MS);
          const profile = AIProfiles.profileFor(player.profileName);
          const action = PressYourLuckAIProfiles.decideHitOrStand(player, state, profile);
          let { needsBuyBack } = PressYourLuckRules.resolveHitOrStand(state, playerId, action);
          notify();
          // A "buyBack" choice can chain into another needsBuyBack (the
          // fresh replacement card at the next escalating price) instead
          // of ending the turn -- loop until this player is genuinely
          // done, same as the human path's own re-armed pending object.
          while (needsBuyBack) {
            await sleep(DECIDE_DELAY_MS);
            const choice = PressYourLuckAIProfiles.decideBuyBack(player, state, profile);
            ({ needsBuyBack } = PressYourLuckRules.resolveBuyBack(state, playerId, choice));
            notify();
          }
        }
        if (state && state.status === "complete" && !state.results && !state.outrightWinnerIds) {
          carriedPotChips = PressYourLuckRules.resolveShowdown(state);
          finalizeComplete();
        } else if (state && state.status === "complete" && state.outrightWinnerIds && !state.results) {
          finalizeComplete();
        }
      } finally {
        running = false;
      }
    }

    function finalizeComplete() {
      // An outright fold-out win (state.outrightWinnerIds) never runs
      // resolveShowdown, so state.results stays null -- read the winner
      // straight off state.winnerId instead in that case.
      const winnerIds = state.outrightWinnerIds
        ? state.outrightWinnerIds
        : state.results.kitchenSink
          ? state.results.winnerIds
          : [...state.results.lowWinners, ...state.results.highWinners];
      const uniqueWinnerIds = [...new Set(winnerIds)];
      for (const id of uniqueWinnerIds) maybeQuip(PressYourLuckRules.getPlayer(state, id), "win");
      onHandComplete({ winnerId: uniqueWinnerIds[0] || null, rainedOut: false, potChips: 0 });
      notify();
    }

    function humanInitialBuyback(choice) {
      if (!pending || pending.kind !== "initialBuyback") return;
      const { needsBuyBack } = PressYourLuckRules.resolveInitialBuyback(state, pending.playerId, choice);
      pending = needsBuyBack ? { kind: "initialBuyback", playerId: pending.playerId } : null;
      notify();
      if (!needsBuyBack) processLoop();
    }

    function humanHitOrStand(action) {
      if (!pending || pending.kind !== "hitOrStand") return;
      const { playerId } = pending;
      const { needsBuyBack } = PressYourLuckRules.resolveHitOrStand(state, playerId, action);
      pending = needsBuyBack ? { kind: "buyBack", playerId } : null;
      notify();
      if (!needsBuyBack) processLoop();
    }

    function humanBuyBack(choice) {
      if (!pending || pending.kind !== "buyBack") return;
      const { needsBuyBack } = PressYourLuckRules.resolveBuyBack(state, pending.playerId, choice);
      pending = needsBuyBack ? { kind: "buyBack", playerId: pending.playerId } : null;
      notify();
      if (needsBuyBack) return;
      processLoop();
    }

    function humanBet(action, raiseDollars) {
      if (!pending || pending.kind !== "bet") return;
      const { playerId } = pending;
      PressYourLuckRules.submitBet(state, playerId, action, raiseDollars || 0);
      onBettingAction(playerId, action);
      pending = null;
      notify();
      processLoop();
    }

    function getViewState() {
      return { gameId: gameConfig.id, players, dealerIndex, handNumber, state, pending, lastQuip };
    }

    return {
      startFirstHand,
      dealNextHand,
      canDealNextHand,
      humanInitialBuyback,
      humanHitOrStand,
      humanBuyBack,
      humanBet,
      getViewState,
    };
  }

  return { create };
})();

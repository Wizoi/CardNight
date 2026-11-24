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
    const recentResults = config.recentResults || null;

    let dealerIndex = config.dealerIndex || 0;
    let handNumber = config.handNumber || 0;
    let state = null;
    let running = false;
    let lastQuip = null;
    let quipSeq = 0;
    const QUIP_CHANCE = 0.35;

    // Full mid-hand resume (2026-08-29) -- see the identical note in
    // session-stud.js. No `pending` here (no buy/wipe/reveal decisions in
    // this family), so resuming just restarts the loop unconditionally.
    if (config.resumeFrom) {
      state = config.resumeFrom.state;
      dealerIndex = config.resumeFrom.extra.dealerIndex;
      handNumber = config.resumeFrom.extra.handNumber;
      lastQuip = config.resumeFrom.extra.lastQuip;
      quipSeq = config.resumeFrom.extra.quipSeq;
      if (state) {
        state.opponentStats = opponentStats;
        state.recentResults = recentResults;
        // Real bug, found live (2026-09-14) in a sibling family: gameConfig
        // objects here can carry FUNCTION-valued fields, which JSON.stringify
        // silently drops across the localStorage round-trip this resume
        // snapshot goes through -- re-attach the real, never-serialized
        // gameConfig object instead of the deserialized one.
        state.gameConfig = gameConfig;
        if (state.status !== "complete") processTurnLoop();
      }
    }

    function snapshot() {
      return { state, pending: null, extra: { dealerIndex, handNumber, lastQuip, quipSeq } };
    }

    // Selection logic lives in table-quips.js (2026-11-23, shared across
    // every session file instead of copy-pasted -- see its own header
    // comment). This wrapper just owns this session's own resumable
    // quipSeq/lastQuip/state.log bookkeeping.
    function maybeQuip(player, moment) {
      const picked = TableQuips.pickQuip(player, moment, QUIP_CHANCE);
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
      state.recentResults = recentResults;
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
            await sleep(BET_DELAY_MS * AIProfiles.tempoFor(bettor.profileName));
            const profile = AIProfiles.profileForState(bettor.profileName, state.recentResults && state.recentResults[bettor.id]);
            const decision = HoldemAIProfiles.decideBet(bettor, state, profile);
            HoldemRules.submitBet(state, bettorId, decision.action, decision.raiseDollars || 0);
            onBettingAction(bettorId, decision.action);
            if (decision.action === "raise") maybeQuip(bettor, "raise");
            else if (decision.action === "fold") maybeQuip(bettor, "fold");
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
      snapshot,
    };
  }

  return { create };
})();

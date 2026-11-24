"use strict";

// Orchestrates Anaconda: discard-3-and-pass -> bet -> discard-2 -> arrange
// reveal order -> bet -> 5 simultaneous reveal-and-bet rounds -> showdown.
// The human's decisions are which cards to discard (twice), what order to
// reveal the final 5 in, and the usual fold/call/raise.
const SessionAnaconda = (function () {
  function create(config) {
    const DECIDE_DELAY_MS = 450;
    const BET_DELAY_MS = 450;
    const REVEAL_DELAY_MS = 500;

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
    const jokerCount = (config.variantChoices && config.variantChoices.jokerCount) || 0;
    const hiLo = !!(config.variantChoices && config.variantChoices.hiLo);
    let state = null;
    let pending = null; // {kind: 'discard1'|'discard2'|'arrange', playerId}
    let running = false;
    let lastQuip = null;
    let quipSeq = 0;
    const QUIP_CHANCE = 0.35;

    // Full mid-hand resume (2026-08-29) -- see the identical note in
    // session-stud.js.
    if (config.resumeFrom) {
      state = config.resumeFrom.state;
      pending = config.resumeFrom.pending;
      handNumber = config.resumeFrom.extra.handNumber;
      carriedPotChips = config.resumeFrom.extra.carriedPotChips;
      lastQuip = config.resumeFrom.extra.lastQuip;
      quipSeq = config.resumeFrom.extra.quipSeq;
      if (state) {
        state.opponentStats = opponentStats;
        state.recentResults = recentResults;
        if (state.status !== "complete" && !pending) processLoop();
      }
    }

    function snapshot() {
      return { state, pending, extra: { handNumber, carriedPotChips, lastQuip, quipSeq } };
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
      state = RulesAnaconda.createHandState(players, dealerIndex, settings, carriedPotChips, jokerCount, hiLo);
      state.opponentStats = opponentStats;
      state.recentResults = recentResults;
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

          if (state.status === "arranging") {
            const nextPlayer = RulesAnaconda.activePlayers(state).find((p) => state.arrangeSelections[p.id] == null);
            if (!nextPlayer) {
              RulesAnaconda.resolveArranging(state);
              notify();
              continue;
            }
            if (nextPlayer.isHuman) {
              pending = { kind: "arrange", playerId: nextPlayer.id };
              notify();
              return;
            }
            await sleep(DECIDE_DELAY_MS);
            const order = AnacondaAIProfiles.decideArrangeOrder(nextPlayer);
            RulesAnaconda.submitArrangeOrder(state, nextPlayer.id, order);
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
          const profile = AIProfiles.profileForState(bettor.profileName, state.recentResults && state.recentResults[bettor.id]);
          const decision = AnacondaAIProfiles.decideBet(bettor, state, profile);
          RulesAnaconda.submitBet(state, bettorId, decision.action, decision.raiseDollars || 0);
          onBettingAction(bettorId, decision.action);
          if (decision.action === "raise") maybeQuip(bettor, "raise");
          else if (decision.action === "fold") maybeQuip(bettor, "fold");
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

    function humanArrangeOrder(orderedIndices) {
      if (!pending || pending.kind !== "arrange") return;
      const { playerId } = pending;
      pending = null;
      RulesAnaconda.submitArrangeOrder(state, playerId, orderedIndices);
      notify();
      processLoop();
    }

    function humanBet(action, raiseDollars) {
      const human = getHuman();
      if (!state.bettingRound || RulesAnaconda.getCurrentBettor(state) !== human.id) return;
      RulesAnaconda.submitBet(state, human.id, action, raiseDollars || 0);
      onBettingAction(human.id, action);
      notify();
      processLoop();
    }

    function getViewState() {
      return { gameId: "anaconda", players, dealerIndex, handNumber, state, pending, lastQuip, variantChoices: config.variantChoices || {} };
    }

    return {
      startFirstHand,
      dealNextHand,
      canDealNextHand,
      humanDiscard,
      humanArrangeOrder,
      humanBet,
      getViewState,
      snapshot,
    };
  }

  return { create };
})();

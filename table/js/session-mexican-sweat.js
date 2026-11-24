"use strict";

// Orchestrates one game's hand loop for Mexican Sweat: every player's
// reveal each round is blind and automatic (nobody, human included, picks
// which of their own cards flips — they can't see their own hand any more
// than an opponent watching would), so unlike Midnight Baseball or the
// stud engine, there's no human reveal/buy decision at all. The human's
// only actions are betting.
const SessionMexicanSweat = (function () {
  function create(config) {
    const FLIP_DELAY_MS = 450;
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
    // session-stud.js. No `pending` here at all (Mexican Sweat's only
    // human decision is betting, read straight off state.bettingRound), so
    // resuming just restarts the loop unconditionally -- it's a safe no-op
    // if it's genuinely a human's turn to bet.
    if (config.resumeFrom) {
      state = config.resumeFrom.state;
      dealerIndex = config.resumeFrom.extra.dealerIndex;
      handNumber = config.resumeFrom.extra.handNumber;
      lastQuip = config.resumeFrom.extra.lastQuip;
      quipSeq = config.resumeFrom.extra.quipSeq;
      if (state) {
        state.opponentStats = opponentStats;
        state.recentResults = recentResults;
        // Real bug, found live (2026-09-14) in a sibling family: JSON.
        // stringify silently drops any FUNCTION-valued gameConfig field
        // across the localStorage round-trip this resume snapshot goes
        // through -- re-attach the real, never-serialized gameConfig object
        // instead of the deserialized one, cheap insurance even though this
        // particular config is plain data today.
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
      state = MexicanSweatRules.createHandState(players, dealerIndex, settings, handNumber, gameConfig);
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
            const bettorId = MexicanSweatRules.getCurrentBettor(state);
            if (bettorId == null) {
              if (state.status === "complete") break;
              MexicanSweatRules.advanceRound(state);
              notify();
              continue;
            }
            const bettor = MexicanSweatRules.getPlayer(state, bettorId);
            if (bettor.isHuman) {
              notify();
              break;
            }
            await sleep(BET_DELAY_MS * AIProfiles.tempoFor(bettor.profileName, state.recentResults && state.recentResults[bettor.id]));
            const profile = AIProfiles.profileForState(bettor.profileName, state.recentResults && state.recentResults[bettor.id]);
            const decision = MexicanSweatAIProfiles.decideBet(bettor, state, profile);
            MexicanSweatRules.submitBet(state, bettorId, decision.action, decision.raiseDollars || 0);
            onBettingAction(bettorId, decision.action);
            if (decision.action === "raise") maybeQuip(bettor, "raise");
            notify();
            continue;
          }

          if (MexicanSweatRules.isRoundRevealComplete(state)) {
            // No betting round after the final reveal -- see
            // isFinalRevealRound's own comment: by then every hand is
            // already fully face up for the whole table, so there's no
            // new information left to bet on.
            if (MexicanSweatRules.isFinalRevealRound(state)) {
              MexicanSweatRules.resolveShowdown(state);
            } else {
              MexicanSweatRules.startBettingRound(state);
            }
            notify();
            continue;
          }

          await sleep(FLIP_DELAY_MS);
          const revealResult = MexicanSweatRules.revealNextCard(state);
          if (revealResult && revealResult.killed) {
            maybeQuip(MexicanSweatRules.getPlayer(state, revealResult.playerId), "fold");
          }
          notify();
        }
      } finally {
        running = false;
      }
      if (state && state.status === "complete") {
        if (state.winnerId) maybeQuip(MexicanSweatRules.getPlayer(state, state.winnerId), "win");
        onHandComplete({ winnerId: state.winnerId, rainedOut: false, potChips: 0 });
        notify();
      }
    }

    function humanBet(action, raiseDollars) {
      const human = getHuman();
      if (!state.bettingRound || MexicanSweatRules.getCurrentBettor(state) !== human.id) return;
      MexicanSweatRules.submitBet(state, human.id, action, raiseDollars || 0);
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

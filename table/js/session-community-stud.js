"use strict";

// Orchestrates one game's hand loop for the shared community-stud engine
// (Cincinnati, Criss Cross). No per-player dealing loop or buy/wipe
// decisions at all -- the whole deal (hole cards + community cards) happens
// in one shot at hand start, so the only things this loop drives are
// betting rounds and community-card reveals.
const SessionCommunityStud = (function () {
  function create(config) {
    const REVEAL_DELAY_MS = 450;
    const BET_DELAY_MS = 450;

    const players = config.players;
    const settings = config.settings;
    const gameConfig = config.gameConfig;
    const onUpdate = config.onUpdate || (() => {});
    const onHandComplete = config.onHandComplete || (() => {});
    const onBettingAction = config.onBettingAction || (() => {});
    const opponentStats = config.opponentStats || null;

    let dealerIndex = config.dealerIndex || 0;
    let handNumber = config.handNumber || 0;
    let state = null;
    let running = false;
    let lastQuip = null;
    let quipSeq = 0;
    const QUIP_CHANCE = 0.35;

    // Full mid-hand resume (2026-08-29) -- see the identical note in
    // session-stud.js. No `pending` here (no buy/wipe decisions in this
    // family), so resuming just restarts the loop unconditionally.
    if (config.resumeFrom) {
      state = config.resumeFrom.state;
      dealerIndex = config.resumeFrom.extra.dealerIndex;
      handNumber = config.resumeFrom.extra.handNumber;
      lastQuip = config.resumeFrom.extra.lastQuip;
      quipSeq = config.resumeFrom.extra.quipSeq;
      if (state) {
        state.opponentStats = opponentStats;
        if (state.status !== "complete") processTurnLoop();
      }
    }

    function snapshot() {
      return { state, pending: null, extra: { dealerIndex, handNumber, lastQuip, quipSeq } };
    }

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
      state = CommunityStudRules.createHandState(players, dealerIndex, settings, handNumber, gameConfig);
      state.opponentStats = opponentStats;
      notify();
      processTurnLoop();
    }

    async function processTurnLoop() {
      if (running) return;
      running = true;
      try {
        while (state && state.status !== "complete") {
          if (state.bettingRound) {
            const bettorId = CommunityStudRules.getCurrentBettor(state);
            if (bettorId == null) {
              if (state.status === "complete") break;
              CommunityStudRules.advance(state);
              notify();
              continue;
            }
            const bettor = CommunityStudRules.getPlayer(state, bettorId);
            if (bettor.isHuman) {
              notify();
              break;
            }
            await sleep(BET_DELAY_MS);
            const profile = AIProfiles.profileFor(bettor.profileName);
            const decision = CommunityStudAIProfiles.decideBet(bettor, state, profile);
            CommunityStudRules.submitBet(state, bettorId, decision.action, decision.raiseDollars || 0);
            onBettingAction(bettorId, decision.action);
            if (decision.action === "raise") maybeQuip(bettor, "raise");
            notify();
            continue;
          }

          if (state.phase === "initialBet") {
            CommunityStudRules.startBettingRound(state);
            notify();
            continue;
          }

          if (CommunityStudRules.isRevealComplete(state)) {
            CommunityStudRules.resolveShowdown(state);
            notify();
            break;
          }

          await sleep(REVEAL_DELAY_MS);
          CommunityStudRules.revealNextCommunityCard(state);
          notify();
          // A betting round follows every reveal, including the last one --
          // showdown is triggered separately, once THAT round's own
          // completion reaches advance() with no reveals left.
          CommunityStudRules.startBettingRound(state);
          notify();
        }
      } finally {
        running = false;
      }
      if (state && state.status === "complete") {
        if (state.winnerId) maybeQuip(CommunityStudRules.getPlayer(state, state.winnerId), "win");
        onHandComplete({ winnerId: state.winnerId, rainedOut: false, potChips: 0 });
        notify();
      }
    }

    function humanBet(action, raiseDollars) {
      const human = getHuman();
      if (!state.bettingRound || CommunityStudRules.getCurrentBettor(state) !== human.id) return;
      CommunityStudRules.submitBet(state, human.id, action, raiseDollars || 0);
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

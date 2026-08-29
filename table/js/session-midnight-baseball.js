"use strict";

// Orchestrates one game's hand loop (deal -> reveal turns -> betting ->
// payout) for Midnight Baseball specifically. Used to be the whole of
// session.js as a singleton module; now a factory so table-night.js can
// create a fresh one each time Midnight Baseball is picked, while wallets,
// seats, and history live one level up and persist across a game change.
//
// config: { players, settings, dealerIndex, handNumber, onUpdate, onHandComplete }
//   - players/settings: same shape the old Session.init() built internally.
//   - dealerIndex/handNumber: seeded from table-night.js so the dealer
//     button and hand count keep going instead of resetting per game.
//   - onHandComplete(winnerId): called once a hand ends (win, not a
//     Midnight-Baseball concept for rain-outs) so table-night.js can record
//     day progress and its own cross-game hands-won tally.
const SessionMidnightBaseball = (function () {
  function create(config) {
    const FLIP_DELAY_MS = 450;
    const DECISION_DELAY_MS = 450;
    const BET_DELAY_MS = 450;

    const players = config.players;
    const settings = config.settings;
    const onUpdate = config.onUpdate || (() => {});
    const onHandComplete = config.onHandComplete || (() => {});
    const onBettingAction = config.onBettingAction || (() => {});
    const opponentStats = config.opponentStats || null;

    let dealerIndex = config.dealerIndex || 0;
    let handNumber = config.handNumber || 0;
    let state = null;
    let pending = null; // {kind: 'buy3'|'buy9'|'buy4', cardIndex?}
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

    function stopTurnWithQuips(playerId, reason) {
      const prevLeaderId = reason === "beat" ? MidnightBaseball.currentBestHand(state).holderId : null;
      MidnightBaseball.stopTurn(state, playerId, reason);
      if (reason === "beat") {
        if (prevLeaderId && prevLeaderId !== playerId) {
          const prevLeader = MidnightBaseball.getPlayer(state, prevLeaderId);
          if (prevLeader && !prevLeader.folded) maybeQuip(prevLeader, "overtaken");
        }
      } else {
        maybeQuip(MidnightBaseball.getPlayer(state, playerId), "fold");
      }
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
      state = MidnightBaseball.createHandState(players, dealerIndex, settings, handNumber);
      state.opponentStats = opponentStats;
      pending = null;
      notify();
      processTurnLoop();
    }

    async function processTurnLoop() {
      if (running) return;
      running = true;
      try {
        while (state && state.status !== "complete") {
          if (state.bettingRound) {
            const bettorId = MidnightBaseball.getCurrentBettor(state);
            if (bettorId == null) {
              if (state.status === "complete") break;
              MidnightBaseball.advanceTurn(state);
              notify();
              continue;
            }
            const bettor = MidnightBaseball.getPlayer(state, bettorId);
            if (bettor.isHuman) {
              notify();
              break;
            }
            await sleep(BET_DELAY_MS);
            const profile = AIProfiles.profileFor(bettor.profileName);
            const decision = AIProfiles.decideBet(bettor, state, profile);
            MidnightBaseball.submitBet(state, bettorId, decision.action, decision.raiseDollars || 0);
            onBettingAction(bettorId, decision.action);
            if (decision.action === "raise") maybeQuip(bettor, "raise");
            notify();
            continue;
          }

          const currentId = MidnightBaseball.currentTurnPlayerId(state);
          if (currentId == null) break;
          const player = MidnightBaseball.getPlayer(state, currentId);
          if (player.isHuman) {
            notify();
            break;
          }
          await runOneAIRevealStep(player);
        }
      } finally {
        running = false;
      }
      if (state && state.status === "complete") {
        if (state.winnerId) maybeQuip(MidnightBaseball.getPlayer(state, state.winnerId), "win");
        onHandComplete({ winnerId: state.winnerId, rainedOut: false, potChips: 0 });
        notify();
      }
    }

    async function runOneAIRevealStep(player) {
      const profile = AIProfiles.profileFor(player.profileName);
      const cardIndex = AIProfiles.decideNextCardIndex(player);
      const { needsDecision } = MidnightBaseball.flipCard(state, player.id, cardIndex);
      notify();
      await sleep(FLIP_DELAY_MS);

      if (needsDecision === "buy3") {
        const willBuy = AIProfiles.decideBuy3(player);
        const { declined } = MidnightBaseball.resolveBuy3(state, player.id, willBuy);
        if (!declined) maybeQuip(player, "buyWild");
        notify();
        await sleep(DECISION_DELAY_MS);
        if (declined) {
          stopTurnWithQuips(player.id, "declinedWild");
          notify();
          return;
        }
      } else if (needsDecision === "buy9") {
        const willBuy = AIProfiles.decideBuy9(player, profile, cardIndex);
        MidnightBaseball.resolveBuy9(state, player.id, willBuy);
        if (willBuy) maybeQuip(player, "buyWild");
        notify();
        await sleep(DECISION_DELAY_MS);
      } else if (needsDecision === "buy4") {
        const willBuy = AIProfiles.decideBuy4(player);
        MidnightBaseball.resolveBuy4(state, player.id, willBuy);
        if (willBuy) maybeQuip(player, "buyBonus");
        notify();
        await sleep(DECISION_DELAY_MS);
      }

      if (MidnightBaseball.hasBeatenBoard(state, player.id)) {
        stopTurnWithQuips(player.id, "beat");
      } else if (MidnightBaseball.remainingFaceDownCount(state, player.id) === 0) {
        stopTurnWithQuips(player.id, "ranOut");
      } else if (!AIProfiles.decideContinue(player, state, profile)) {
        stopTurnWithQuips(player.id, "concede");
      }
      notify();
    }

    function humanFlipCard(cardIndex) {
      const human = getHuman();
      if (pending || state.bettingRound || MidnightBaseball.currentTurnPlayerId(state) !== human.id) return;
      const { needsDecision } = MidnightBaseball.flipCard(state, human.id, cardIndex);
      if (needsDecision) {
        pending = { kind: needsDecision, cardIndex };
        notify();
        return;
      }
      afterHumanFlipResolved();
    }

    function afterHumanFlipResolved() {
      const human = getHuman();
      if (MidnightBaseball.hasBeatenBoard(state, human.id)) {
        stopTurnWithQuips(human.id, "beat");
        notify();
        processTurnLoop();
        return;
      }
      if (MidnightBaseball.remainingFaceDownCount(state, human.id) === 0) {
        stopTurnWithQuips(human.id, "ranOut");
        notify();
        processTurnLoop();
        return;
      }
      notify();
    }

    function humanResolveBuy(willBuy) {
      const human = getHuman();
      if (!pending || !["buy3", "buy9", "buy4"].includes(pending.kind)) return;
      const kind = pending.kind;
      pending = null;
      if (kind === "buy3") {
        const { declined } = MidnightBaseball.resolveBuy3(state, human.id, willBuy);
        if (declined) {
          stopTurnWithQuips(human.id, "declinedWild");
          notify();
          processTurnLoop();
          return;
        }
      } else if (kind === "buy9") {
        MidnightBaseball.resolveBuy9(state, human.id, willBuy);
      } else if (kind === "buy4") {
        MidnightBaseball.resolveBuy4(state, human.id, willBuy);
      }
      afterHumanFlipResolved();
    }

    function humanConcede() {
      const human = getHuman();
      if (pending || state.bettingRound || MidnightBaseball.currentTurnPlayerId(state) !== human.id) return;
      stopTurnWithQuips(human.id, "concede");
      notify();
      processTurnLoop();
    }

    function humanBet(action, raiseDollars) {
      const human = getHuman();
      if (!state.bettingRound || MidnightBaseball.getCurrentBettor(state) !== human.id) return;
      MidnightBaseball.submitBet(state, human.id, action, raiseDollars || 0);
      onBettingAction(human.id, action);
      notify();
      processTurnLoop();
    }

    function getViewState() {
      return { gameId: "midnightBaseball", players, dealerIndex, handNumber, state, pending, lastQuip };
    }

    return {
      startFirstHand,
      dealNextHand,
      canDealNextHand,
      humanFlipCard,
      humanResolveBuy,
      humanConcede,
      humanBet,
      getViewState,
    };
  }

  return { create };
})();

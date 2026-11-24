"use strict";

// Orchestrates Acey Ducey. One active player at a time; every OTHER seat
// just watches. The human's only decisions are their own bet amount (or
// pass) whenever it's their turn.
const SessionAceyDucey = (function () {
  function create(config) {
    const DEAL_DELAY_MS = 500;
    const BET_DELAY_MS = 500;
    // How long an AI's own drawn 3rd card/result stays on the table before
    // auto-advancing -- the human's own result instead waits for an
    // explicit "Continue" click (see humanContinue), since that's the one
    // the user actually needs time to read.
    const AI_RESULT_DISPLAY_MS = 1600;

    const players = config.players;
    const settings = config.settings;
    const onUpdate = config.onUpdate || (() => {});
    const onHandComplete = config.onHandComplete || (() => {});
    // Real gap, caught by a follow-up review (2026-11-23): this family
    // never actually received recentResults at all (every call site below
    // reads state.recentResults, but nothing ever set it), so Acey
    // Ducey's AI could never benefit from Storm's tilt or the Streak
    // Chaser's hot/cold streaks -- the same wiring every other family
    // already has.
    const recentResults = config.recentResults || null;

    const dealerIndex = config.dealerIndex || 0;
    let handNumber = config.handNumber || 0;
    let carriedPotChips = config.carriedPotChips || 0;
    let state = null;
    let pending = null; // {kind: 'bet', playerId}
    let running = false;
    let lastQuip = null;
    let quipSeq = 0;
    const QUIP_CHANCE = 0.35;

    // Full mid-hand resume (2026-08-29) -- see the identical note in
    // session-stud.js. No opponentStats in this family (Acey Ducey's
    // single bet-up-to-the-pot decision was scoped out of the AI opponent-
    // modeling work), so nothing to reattach besides state/pending.
    if (config.resumeFrom) {
      state = config.resumeFrom.state;
      pending = config.resumeFrom.pending;
      handNumber = config.resumeFrom.extra.handNumber;
      carriedPotChips = config.resumeFrom.extra.carriedPotChips;
      lastQuip = config.resumeFrom.extra.lastQuip;
      quipSeq = config.resumeFrom.extra.quipSeq;
      if (state) state.recentResults = recentResults;
      if (state && state.status !== "complete" && !pending) processLoop();
    }

    function snapshot() {
      return { state, pending, extra: { handNumber, carriedPotChips, lastQuip, quipSeq } };
    }

    // 2026-11-23: this game previously had no quip wiring at all (design
    // review finding #2's own list -- Acey Ducey, Blind Man's Bluff, and
    // 3-33 all had none; 3-33 got built the same day, these two were
    // deliberately deferred). There's no raise/fold/win in the usual
    // sense here -- just one bet-up-to-the-pot decision per turn,
    // resolved as win/lose/post/pass -- so this reuses the existing
    // win/lostHand/fold buckets rather than inventing new, data-less ones:
    // a losing bet (or "hitting the post," a worse losing bet) reads as
    // lostHand; declining to bet at all reads as the closest existing
    // equivalent to folding.
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
      beginHand();
    }

    function beginHand() {
      topUpAIWalletsIfNeeded();
      handNumber += 1;
      state = AceyDuceyRules.createHandState(players, dealerIndex, settings, carriedPotChips);
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
          if (state.status === "awaitingContinue") {
            const result = state.lastResult;
            const resultPlayer = result ? AceyDuceyRules.getPlayer(state, result.playerId) : null;
            if (resultPlayer && resultPlayer.isHuman) {
              pending = { kind: "continue" };
              notify();
              return;
            }
            await sleep(AI_RESULT_DISPLAY_MS);
            AceyDuceyRules.advanceTurn(state);
            notify();
            continue;
          }
          if (state.status === "awaitingDeal") {
            await sleep(DEAL_DELAY_MS);
            AceyDuceyRules.dealShownCards(state);
            notify();
            continue;
          }
          // awaitingBet
          const playerId = AceyDuceyRules.currentActivePlayerId(state);
          const player = AceyDuceyRules.getPlayer(state, playerId);
          if (player.isHuman) {
            pending = { kind: "bet", playerId };
            notify();
            return;
          }
          await sleep(BET_DELAY_MS * AIProfiles.tempoFor(player.profileName, state.recentResults && state.recentResults[player.id]));
          const profile = AIProfiles.profileForState(player.profileName, state.recentResults && state.recentResults[player.id]);
          const betDollars = AceyDuceyAIProfiles.decideBet(player, state, profile);
          AceyDuceyRules.resolveBet(state, playerId, betDollars);
          const { outcome } = state.lastResult;
          if (outcome === "win") maybeQuip(player, "win");
          else if (outcome === "lose" || outcome === "post") maybeQuip(player, "lostHand");
          else if (outcome === "pass") maybeQuip(player, "fold");
          notify();
        }
      } finally {
        running = false;
      }
      if (state && state.status === "complete") {
        carriedPotChips = state.pot;
        onHandComplete({ winnerId: null, rainedOut: false, potChips: 0 });
        notify();
      }
    }

    function humanBet(betDollars) {
      if (!pending || pending.kind !== "bet") return;
      const { playerId } = pending;
      pending = null;
      AceyDuceyRules.resolveBet(state, playerId, betDollars);
      notify();
      processLoop();
    }

    // Advances past the human's own just-resolved bet (shown 3rd card,
    // win/lose/post outcome) once they've actually seen it, instead of the
    // old behavior of wiping it the instant the bet resolved.
    function humanContinue() {
      if (!pending || pending.kind !== "continue") return;
      pending = null;
      AceyDuceyRules.advanceTurn(state);
      notify();
      processLoop();
    }

    function getViewState() {
      return { gameId: "aceyDucey", players, dealerIndex, handNumber, state, pending, lastQuip };
    }

    return {
      startFirstHand,
      dealNextHand,
      canDealNextHand,
      humanBet,
      humanContinue,
      getViewState,
      snapshot,
    };
  }

  return { create };
})();

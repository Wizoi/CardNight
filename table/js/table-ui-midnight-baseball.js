"use strict";

// Midnight Baseball's table-view rendering — seats, the "beat card" board,
// the human's own flip-to-reveal hand, and the flip/buy/concede/bet action
// panel. Split out of table-ui.js so a different game family (stud) can have
// its own genuinely different board/action-panel shape without the two
// being tangled together. `orchestrator` is TableNight's active
// SessionMidnightBaseball instance — this module only reads/acts through it,
// same contract table-ui.js used to have with the old Session singleton.
const TableUIMidnightBaseball = (function () {
  function cardMarkup(card, faceDown, peek, beaten) {
    if (faceDown) return `<div class="card card-back"></div>`;
    const red = card.suit === "H" || card.suit === "D";
    const wildTag = card.isWild || card.bought ? `<span class="wild-tag">W</span>` : "";
    const extraClass = `${peek ? " card-peek" : ""}${beaten ? " card-beaten" : ""}`;
    return `<div class="card ${red ? "card-red" : "card-black"}${extraClass}">${Deck.cardLabel(card)}${wildTag}</div>`;
  }

  function money(dollars) {
    return `$${dollars.toFixed(2)}`;
  }

  function renderSeats(el, gvs, debugMode, activeQuip) {
    const currentTurnId = gvs.state ? MidnightBaseball.currentTurnPlayerId(gvs.state) : null;
    const currentBettorId = gvs.state && gvs.state.bettingRound ? MidnightBaseball.getCurrentBettor(gvs.state) : null;
    const peekAi = debugMode && gvs.state;
    el.seats.innerHTML = gvs.players
      .map((p, i) => {
        const isDealer = i === gvs.dealerIndex;
        const isTurn = p.id === currentTurnId || p.id === currentBettorId;
        const faceUp = gvs.state ? p.hand.filter((c) => c.faceUp) : [];
        const faceDown = gvs.state ? p.hand.filter((c) => !c.faceUp) : [];
        const profileBadge = p.isHuman
          ? ""
          : `<span class="profile-badge">${p.archetypeLabel || AIProfiles.profileFor(p.profileName).label}</span>`;
        const avatarMarkup = !p.isHuman && p.avatarSpec ? `<div class="seat-avatar">${Avatar.render(p.avatarSpec, 40)}</div>` : "";
        const quipMarkup =
          activeQuip && activeQuip.playerId === p.id && Date.now() < activeQuip.expiresAt
            ? `<div class="seat-quip">&ldquo;${activeQuip.text}&rdquo;</div>`
            : "";
        const showPeek = peekAi && !p.isHuman;
        let debugLine = "";
        if (showPeek && !p.folded) {
          const showing = MidnightBaseball.evaluateShowingHand(gvs.state, p.id);
          const board = MidnightBaseball.currentBestHand(gvs.state).hand;
          const remaining = MidnightBaseball.remainingFaceDownCount(gvs.state, p.id);
          const truePotential = MidnightBaseball.estimatePotential(gvs.state, p.id);
          debugLine = `
            <div class="seat-debug">AI reasons from: ${HandEvaluator.describe(showing)}, ${remaining} card(s) left (board: ${HandEvaluator.describe(board)})</div>
            <div class="seat-debug seat-debug-peek">Peek only — true hand if fully revealed: ${HandEvaluator.describe(truePotential)}</div>
          `;
        }
        return `
          <div class="seat ${p.folded ? "seat-folded" : ""} ${isTurn ? "seat-active" : ""}">
            ${quipMarkup}
            ${avatarMarkup}
            <div class="seat-name">${isDealer ? "🎲 " : ""}${p.name}${profileBadge}</div>
            <div class="seat-chips">${money(ChipEconomy.chipsToDollars(p.wallet.chips))}</div>
            <div class="seat-cards">
              ${faceUp.map((c) => cardMarkup(c, false)).join("")}
              ${showPeek ? faceDown.map((c) => cardMarkup(c, false, true)).join("") : faceDown.map(() => cardMarkup(null, true)).join("")}
            </div>
            ${debugLine}
            ${p.folded ? '<div class="seat-status">Folded</div>' : ""}
          </div>
        `;
      })
      .join("");
  }

  function renderBoard(el, gvs) {
    if (!gvs.state) {
      el.boardHand.innerHTML = "";
      return;
    }
    const best = MidnightBaseball.currentBestHand(gvs.state);
    const holder = best.holderId ? MidnightBaseball.getPlayer(gvs.state, best.holderId) : null;
    const beatCardBeaten = !!holder;
    el.boardHand.innerHTML = `
      <div><strong>Beat card:</strong> ${cardMarkup(gvs.state.referenceCard, false, false, beatCardBeaten)}</div>
      <div><strong>Hand to beat:</strong> ${HandEvaluator.describe(best.hand)}${holder ? ` (held by ${holder.name})` : ""}</div>
      <div><strong>Pot:</strong> ${money(ChipEconomy.chipsToDollars(gvs.state.pot))}</div>
    `;
  }

  function renderHumanHand(el, gvs, humanId) {
    const human = gvs.players.find((p) => p.id === humanId);
    if (!gvs.state) {
      el.humanHand.innerHTML = "";
      return;
    }
    const canClick =
      !gvs.pending &&
      !gvs.state.bettingRound &&
      gvs.state.status !== "complete" &&
      MidnightBaseball.currentTurnPlayerId(gvs.state) === human.id &&
      !human.folded;
    el.humanHand.innerHTML = human.hand
      .map((c, i) => {
        if (c.faceUp) return cardMarkup(c, false);
        if (canClick) return `<button class="card card-back card-clickable" data-flip-index="${i}"></button>`;
        return cardMarkup(null, true);
      })
      .join("");
  }

  function renderActionPanel(el, gvs, humanId, orchestrator, settings) {
    const human = gvs.players.find((p) => p.id === humanId);
    if (!gvs.state) {
      el.actionPanel.innerHTML = `<button id="deal-first-hand-btn">Deal first hand</button>`;
      return;
    }
    if (gvs.state.status === "complete") {
      const winner = gvs.state.winnerId ? MidnightBaseball.getPlayer(gvs.state, gvs.state.winnerId) : null;
      const canDeal = orchestrator.canDealNextHand();
      el.actionPanel.innerHTML = `
        <div>${winner ? `${winner.name} won the hand.` : "Hand over."}</div>
        ${canDeal ? `<button id="deal-next-hand-btn">Deal next hand</button>` : `<div>You're out of chips for this hand. Buy more chips or cash out to continue.</div>`}
      `;
      return;
    }
    if (gvs.pending && gvs.pending.kind === "buy3") {
      el.actionPanel.innerHTML = `
        <div>You turned up a 3 — buy it for $3 to keep it wild and stay in, or fold.</div>
        <button data-buy-yes>Buy the 3 ($3)</button>
        <button data-buy-no>Fold</button>
      `;
      return;
    }
    if (gvs.pending && gvs.pending.kind === "buy9") {
      el.actionPanel.innerHTML = `
        <div>You turned up a 9 — buy it for $2 to make it wild? (optional)</div>
        <button data-buy-yes>Buy the 9 ($2)</button>
        <button data-buy-no>Leave it plain</button>
      `;
      return;
    }
    if (gvs.pending && gvs.pending.kind === "buy4") {
      el.actionPanel.innerHTML = `
        <div>You turned up a 4 — buy a bonus card for $1? (optional)</div>
        <button data-buy-yes>Buy bonus card ($1)</button>
        <button data-buy-no>Pass</button>
      `;
      return;
    }
    if (!gvs.pending && !gvs.state.bettingRound && MidnightBaseball.currentTurnPlayerId(gvs.state) === human.id) {
      const remaining = MidnightBaseball.remainingFaceDownCount(gvs.state, human.id);
      el.actionPanel.innerHTML = `
        <div>Keep turning over your own cards to beat the board — ${remaining} card(s) left. It's free unless you turn up a 3, 9, or 4.</div>
        <button data-concede>Concede</button>
      `;
      return;
    }
    if (gvs.state.bettingRound && MidnightBaseball.getCurrentBettor(gvs.state) === human.id) {
      const br = gvs.state.bettingRound;
      const toCallDollars = ChipEconomy.chipsToDollars(br.currentBetChips - br.committed[human.id]);
      const maxRaise = MidnightBaseball.maxRaiseDollars(gvs.state, human.id);
      el.actionPanel.innerHTML = `
        <div>Betting round — to call: ${money(toCallDollars)}</div>
        <button data-bet-fold>Fold</button>
        <button data-bet-call>${toCallDollars > 0 ? `Call ${money(toCallDollars)}` : "Check"}</button>
        ${maxRaise > 0 ? `<button data-bet-raise="${settings.raiseIncrementDollars}">Raise +${money(settings.raiseIncrementDollars)}</button>` : ""}
      `;
      return;
    }
    el.actionPanel.innerHTML = `<div>Waiting for other players...</div>`;
  }

  function wireActions(el, orchestrator) {
    el.humanHand.onclick = (e) => {
      const btn = e.target.closest("[data-flip-index]");
      if (btn) orchestrator.humanFlipCard(Number(btn.dataset.flipIndex));
    };
    el.actionPanel.onclick = (e) => {
      if (e.target.id === "deal-first-hand-btn") return orchestrator.startFirstHand();
      if (e.target.id === "deal-next-hand-btn") return orchestrator.dealNextHand();
      if (e.target.hasAttribute("data-buy-yes")) return orchestrator.humanResolveBuy(true);
      if (e.target.hasAttribute("data-buy-no")) return orchestrator.humanResolveBuy(false);
      if (e.target.hasAttribute("data-concede")) return orchestrator.humanConcede();
      if (e.target.hasAttribute("data-bet-fold")) return orchestrator.humanBet("fold");
      if (e.target.hasAttribute("data-bet-call")) return orchestrator.humanBet("call");
      if (e.target.hasAttribute("data-bet-raise")) return orchestrator.humanBet("raise", Number(e.target.getAttribute("data-bet-raise")));
    };
  }

  return { renderSeats, renderBoard, renderHumanHand, renderActionPanel, wireActions };
})();

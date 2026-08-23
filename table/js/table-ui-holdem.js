"use strict";

// Table-view rendering for the Hold'em engine (Omaha, Seattle, Boise,
// Jersey Hold'em). No per-seat "showing hand" (hole cards stay private the
// whole hand, same as community-stud) — seats just show a face-down hand
// and chip stack; the shared board sits in the middle. Uses the hand's own
// `raiseIncrementDollars`/blinds rather than the generic table `settings`,
// since this family's betting shape is its own (blinds, no ante, no cap).
const TableUIHoldem = (function () {
  function cardMarkup(card, faceDown) {
    if (faceDown) return `<div class="card card-back"></div>`;
    const red = card.suit === "H" || card.suit === "D";
    return `<div class="card ${red ? "card-red" : "card-black"}">${Deck.cardLabel(card)}</div>`;
  }

  function money(dollars) {
    return `$${dollars.toFixed(2)}`;
  }

  function renderSeats(el, gvs, debugMode, activeQuip) {
    const currentBettorId = gvs.state && gvs.state.bettingRound ? HoldemRules.getCurrentBettor(gvs.state) : null;
    const peekAi = debugMode && gvs.state;
    el.seats.innerHTML = gvs.players
      .map((p, i) => {
        const isDealer = i === gvs.dealerIndex;
        const isTurn = p.id === currentBettorId;
        const cardCount = gvs.state ? p.hand.length : 0;
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
        if (showPeek && gvs.state && !p.folded) {
          const hand = HoldemRules.bestHighHand(gvs.state, p);
          debugLine = `<div class="seat-debug">AI reasons from: ${hand.category > -1 ? HandEvaluator.describe(hand) : "hole cards only (no board yet)"}</div>`;
        }
        return `
          <div class="seat ${p.folded ? "seat-folded" : ""} ${isTurn ? "seat-active" : ""}">
            ${quipMarkup}
            ${avatarMarkup}
            <div class="seat-name">${isDealer ? "🎲 " : ""}${p.name}${profileBadge}</div>
            <div class="seat-chips">${money(ChipEconomy.chipsToDollars(p.wallet.chips))}</div>
            <div class="seat-cards">
              ${gvs.state ? Array.from({ length: cardCount }).map(() => cardMarkup(null, true)).join("") : ""}
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
    const cards = gvs.state.communityCards.map((c) => cardMarkup(c, false)).join("");
    el.boardHand.innerHTML = `
      <div><strong>Pot:</strong> ${money(ChipEconomy.chipsToDollars(gvs.state.pot))}</div>
      <div class="community-row">${cards}</div>
    `;
  }

  function renderHumanHand(el, gvs, humanId) {
    const human = gvs.players.find((p) => p.id === humanId);
    if (!gvs.state) {
      el.humanHand.innerHTML = "";
      return;
    }
    el.humanHand.innerHTML = human.hand.map((c) => cardMarkup(c, false)).join("");
  }

  function renderActionPanel(el, gvs, humanId, orchestrator) {
    const human = gvs.players.find((p) => p.id === humanId);
    if (!gvs.state) {
      el.actionPanel.innerHTML = `<button id="deal-first-hand-btn">Deal first hand</button>`;
      return;
    }
    if (gvs.state.status === "complete") {
      const canDeal = orchestrator.canDealNextHand();
      let resultLine;
      if (gvs.state.lowWinnerIds.length > 0) {
        const highNames = gvs.state.highWinnerIds.map((id) => HoldemRules.getPlayer(gvs.state, id).name).join(", ");
        const lowNames = gvs.state.lowWinnerIds.map((id) => HoldemRules.getPlayer(gvs.state, id).name).join(", ");
        resultLine = `High: ${highNames} (${gvs.state.bestHighDescribed}). Low: ${lowNames} (${gvs.state.bestLowDescribed}).`;
      } else {
        const highNames = gvs.state.highWinnerIds.map((id) => HoldemRules.getPlayer(gvs.state, id).name).join(", ");
        resultLine = gvs.state.bestHighDescribed ? `${highNames} win${gvs.state.highWinnerIds.length === 1 ? "s" : ""} with ${gvs.state.bestHighDescribed}.` : `${highNames} wins.`;
      }
      el.actionPanel.innerHTML = `
        <div>${resultLine}</div>
        ${canDeal ? `<button id="deal-next-hand-btn">Deal next hand</button>` : `<div>You're out of chips for this hand. Buy more chips or cash out to continue.</div>`}
      `;
      return;
    }
    if (gvs.state.bettingRound && HoldemRules.getCurrentBettor(gvs.state) === human.id) {
      const br = gvs.state.bettingRound;
      const toCallDollars = ChipEconomy.chipsToDollars(br.currentBetChips - br.committed[human.id]);
      const maxRaise = HoldemRules.maxRaiseDollars(gvs.state, human.id);
      const raiseStep = gvs.state.raiseIncrementDollars;
      el.actionPanel.innerHTML = `
        <div>Betting round — to call: ${money(toCallDollars)}</div>
        <button data-bet-fold>Fold</button>
        <button data-bet-call>${toCallDollars > 0 ? `Call ${money(toCallDollars)}` : "Check"}</button>
        ${maxRaise > 0 ? `<button data-bet-raise="${raiseStep}">Raise +${money(raiseStep)}</button>` : ""}
      `;
      return;
    }
    el.actionPanel.innerHTML = `<div>Dealing...</div>`;
  }

  function wireActions(el, orchestrator) {
    el.humanHand.onclick = null;
    el.actionPanel.onclick = (e) => {
      if (e.target.id === "deal-first-hand-btn") return orchestrator.startFirstHand();
      if (e.target.id === "deal-next-hand-btn") return orchestrator.dealNextHand();
      if (e.target.hasAttribute("data-bet-fold")) return orchestrator.humanBet("fold");
      if (e.target.hasAttribute("data-bet-call")) return orchestrator.humanBet("call");
      if (e.target.hasAttribute("data-bet-raise")) return orchestrator.humanBet("raise", Number(e.target.getAttribute("data-bet-raise")));
    };
  }

  return { renderSeats, renderBoard, renderHumanHand, renderActionPanel, wireActions };
})();

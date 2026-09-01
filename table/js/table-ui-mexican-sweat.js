"use strict";

// Table-view rendering for Mexican Sweat. No buy/wipe decisions at all
// (nobody, human included, chooses which of their own cards to reveal), so
// the action panel only ever shows betting — otherwise it's "revealing..."
// while the automatic simultaneous-flip loop runs.
const TableUIMexicanSweat = (function () {
  function cardMarkup(card, faceDown) {
    if (faceDown) return `<div class="card card-back"></div>`;
    const red = card.suit === "H" || card.suit === "D";
    const wildTag = card.isWild ? `<span class="wild-tag">W</span>` : "";
    return `<div class="card ${red ? "card-red" : "card-black"}">${Deck.cardFaceHtml(card)}${wildTag}</div>`;
  }

  function money(dollars) {
    return `$${dollars.toFixed(2)}`;
  }

  function renderSeats(el, gvs, debugMode, activeQuip) {
    const currentBettorId = gvs.state && gvs.state.bettingRound ? MexicanSweatRules.getCurrentBettor(gvs.state) : null;
    const peekAi = debugMode && gvs.state;
    el.seats.innerHTML = gvs.players
      .map((p, i) => {
        const isDealer = i === gvs.dealerIndex;
        const isTurn = p.id === currentBettorId;
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
        if (showPeek && gvs.state && !p.folded) {
          const showing = MexicanSweatRules.evaluateShowingHand(gvs.state, p.id);
          const roundsLeft = MexicanSweatRules.roundsRemaining(gvs.state);
          debugLine = `<div class="seat-debug">AI reasons from: ${HandEvaluator.describe(showing)}, ${roundsLeft} round(s) left</div>`;
        }
        return `
          <div class="seat ${p.folded ? "seat-folded" : ""} ${isTurn ? "seat-active" : ""}">
            ${quipMarkup}
            ${avatarMarkup}
            <div class="seat-name">${isDealer ? '<span class="dealer-badge" title="Dealer">D</span> ' : ""}${p.name}${profileBadge}</div>
            <div class="seat-chips">${money(ChipEconomy.chipsToDollars(p.wallet.chips))}</div>
            <div class="seat-cards">
              ${faceUp.map((c) => cardMarkup(c, false)).join("")}
              ${faceDown.map(() => cardMarkup(null, true)).join("")}
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
    const best = MexicanSweatRules.currentBestShowingHand(gvs.state);
    const holder = best.holderId ? MexicanSweatRules.getPlayer(gvs.state, best.holderId) : null;
    const wildLine = gvs.state.wildRank ? `<div><strong>Wild:</strong> ${gvs.state.wildRank}s</div>` : "";
    el.boardHand.innerHTML = `
      <div><strong>Best showing hand:</strong> ${holder ? `${HandEvaluator.describe(best.hand)} (held by ${holder.name})` : "None yet"}</div>
      <div><strong>Pot:</strong> ${money(ChipEconomy.chipsToDollars(gvs.state.pot))}</div>
      ${wildLine}
    `;
  }

  function renderHumanHand(el, gvs, humanId) {
    const human = gvs.players.find((p) => p.id === humanId);
    if (!gvs.state) {
      el.humanHand.innerHTML = "";
      return;
    }
    el.humanHand.innerHTML = human.hand.map((c) => (c.faceUp ? cardMarkup(c, false) : cardMarkup(null, true))).join("");
  }

  function renderActionPanel(el, gvs, humanId, orchestrator, settings) {
    const human = gvs.players.find((p) => p.id === humanId);
    if (!gvs.state) {
      el.actionPanel.innerHTML = `<button id="deal-first-hand-btn">Deal first hand</button>`;
      return;
    }
    if (gvs.state.status === "complete") {
      const winner = gvs.state.winnerId ? MexicanSweatRules.getPlayer(gvs.state, gvs.state.winnerId) : null;
      const canDeal = orchestrator.canDealNextHand();
      const resultLine = winner ? `${winner.name} won the hand.` : "Hand over.";
      el.actionPanel.innerHTML = `
        <div>${resultLine}</div>
        ${canDeal ? `<button id="deal-next-hand-btn">Deal next hand</button>` : `<div>You're out of chips for this hand. Buy more chips or cash out to continue.</div>`}
      `;
      return;
    }
    if (gvs.state.bettingRound && MexicanSweatRules.getCurrentBettor(gvs.state) === human.id) {
      const br = gvs.state.bettingRound;
      const toCallDollars = ChipEconomy.chipsToDollars(br.currentBetChips - br.committed[human.id]);
      const maxRaise = MexicanSweatRules.maxRaiseDollars(gvs.state, human.id);
      el.actionPanel.innerHTML = `
        <div>Betting round — to call: ${money(toCallDollars)}</div>
        <button data-bet-fold>Fold</button>
        <button data-bet-call>${toCallDollars > 0 ? `Call ${money(toCallDollars)}` : "Check"}</button>
        ${maxRaise > 0 ? `<button data-bet-raise="${settings.raiseIncrementDollars}">Raise +${money(settings.raiseIncrementDollars)}</button>` : ""}
      `;
      return;
    }
    el.actionPanel.innerHTML = `<div>Revealing...</div>`;
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

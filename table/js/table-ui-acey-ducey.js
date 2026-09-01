"use strict";

// Table-view rendering for Acey Ducey. One active player at a time; no
// hands to speak of (no player ever holds cards) -- the "board" IS the
// game: the two shown cards, and the third card once a bet resolves.
const TableUIAceyDucey = (function () {
  function cardMarkup(card) {
    if (!card) return `<div class="card card-back"></div>`;
    const red = card.suit === "H" || card.suit === "D";
    return `<div class="card ${red ? "card-red" : "card-black"}">${Deck.cardFaceHtml(card)}</div>`;
  }

  function money(dollars) {
    return `$${dollars.toFixed(2)}`;
  }

  function renderSeats(el, gvs) {
    const activeId = gvs.state ? AceyDuceyRules.currentActivePlayerId(gvs.state) : null;
    el.seats.innerHTML = gvs.players
      .map((p) => {
        const isTurn = p.id === activeId;
        const profileBadge = p.isHuman
          ? ""
          : `<span class="profile-badge">${p.archetypeLabel || AIProfiles.profileFor(p.profileName).label}</span>`;
        const avatarMarkup = !p.isHuman && p.avatarSpec ? `<div class="seat-avatar">${Avatar.render(p.avatarSpec, 40)}</div>` : "";
        const lastLine =
          gvs.state && gvs.state.lastResult && gvs.state.lastResult.playerId === p.id
            ? `<div class="seat-status">${describeOutcome(gvs.state.lastResult)}</div>`
            : "";
        return `
          <div class="seat ${isTurn ? "seat-active" : ""}">
            ${avatarMarkup}
            <div class="seat-name">${p.name}${profileBadge}</div>
            <div class="seat-chips">${money(ChipEconomy.chipsToDollars(p.wallet.chips))}</div>
            ${lastLine}
          </div>
        `;
      })
      .join("");
  }

  function describeOutcome(result) {
    if (result.outcome === "pass") return "Passed";
    if (result.outcome === "win") return `Won $${result.betDollars.toFixed(2)} bet`;
    if (result.outcome === "post") return `Hit the post — lost $${(result.betDollars * 2).toFixed(2)}`;
    return `Lost $${result.betDollars.toFixed(2)}`;
  }

  function renderBoard(el, gvs) {
    if (!gvs.state) {
      el.boardHand.innerHTML = "";
      return;
    }
    const shown = gvs.state.shownCards
      ? `<div><strong>Shown:</strong> ${gvs.state.shownCards.map((c) => cardMarkup(c)).join("")}</div>`
      : "";
    const third = gvs.state.thirdCard ? `<div><strong>Drawn:</strong> ${cardMarkup(gvs.state.thirdCard)}</div>` : "";
    el.boardHand.innerHTML = `
      <div><strong>Pot:</strong> ${money(ChipEconomy.chipsToDollars(gvs.state.pot))}</div>
      ${shown}
      ${third}
    `;
  }

  function renderHumanHand(el) {
    el.humanHand.innerHTML = "";
  }

  function renderActionPanel(el, gvs, humanId, orchestrator) {
    if (!gvs.state) {
      el.actionPanel.innerHTML = `<button id="deal-first-hand-btn">Deal first hand</button>`;
      return;
    }
    if (gvs.state.status === "complete") {
      const canDeal = orchestrator.canDealNextHand();
      el.actionPanel.innerHTML = `
        <div>Hand over.</div>
        ${canDeal ? `<button id="deal-next-hand-btn">Deal next hand</button>` : `<div>You're out of chips for this hand. Buy more chips or cash out to continue.</div>`}
      `;
      return;
    }
    if (gvs.pending && gvs.pending.kind === "bet" && gvs.pending.playerId === humanId) {
      const info = AceyDuceyRules.gapInfo(gvs.state.shownCards);
      const potDollars = ChipEconomy.chipsToDollars(gvs.state.pot);
      const noGapNote = info.gap === 0 ? " (no possible winning bet — adjacent ranks or a pair)" : "";
      el.actionPanel.innerHTML = `
        <div>Bet that the next card falls between your two shown cards${noGapNote}. Max bet: ${money(potDollars)}.</div>
        <input type="number" id="acey-bet-input" min="0" max="${potDollars}" step="0.25" value="0" />
        <button data-bet-submit>Bet</button>
        <button data-bet-pass>Pass</button>
      `;
      return;
    }
    el.actionPanel.innerHTML = `<div>Waiting for other players...</div>`;
  }

  function wireActions(el, orchestrator) {
    el.humanHand.onclick = null;
    el.actionPanel.onclick = (e) => {
      if (e.target.id === "deal-first-hand-btn") return orchestrator.startFirstHand();
      if (e.target.id === "deal-next-hand-btn") return orchestrator.dealNextHand();
      if (e.target.hasAttribute("data-bet-pass")) return orchestrator.humanBet(0);
      if (e.target.hasAttribute("data-bet-submit")) {
        const input = el.actionPanel.querySelector("#acey-bet-input");
        const value = input ? Number(input.value) || 0 : 0;
        return orchestrator.humanBet(value);
      }
    };
  }

  return { renderSeats, renderBoard, renderHumanHand, renderActionPanel, wireActions };
})();

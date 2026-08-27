"use strict";

// Table-view rendering for 3-5-7 Guts. Same "hidden until showdown, no
// betting rounds" shape as table-ui-guts.js, plus a round/wild-rank
// indicator since this game's hand size and wildcard escalate through 3
// fixed rounds within one hand.
const TableUIGuts357 = (function () {
  function cardMarkup(card, faceDown) {
    if (faceDown) return `<div class="card card-back"></div>`;
    const red = card.suit === "H" || card.suit === "D";
    const wildTag = card.isWild ? `<span class="wild-tag">W</span>` : "";
    return `<div class="card ${red ? "card-red" : "card-black"}">${Deck.cardLabel(card)}${wildTag}</div>`;
  }

  function money(dollars) {
    return `$${dollars.toFixed(2)}`;
  }

  function renderSeats(el, gvs, debugMode, activeQuip) {
    const revealed = gvs.state && gvs.state.status === "complete";
    const peekAi = debugMode && gvs.state;
    el.seats.innerHTML = gvs.players
      .map((p) => {
        const stillDeciding = gvs.state && !p.folded && gvs.state.stayDecisions[p.id] == null;
        const isTurn = !!(gvs.pending && gvs.pending.kind === "stayDecision" && stillDeciding && p.isHuman);
        const profileBadge = p.isHuman
          ? ""
          : `<span class="profile-badge">${p.archetypeLabel || AIProfiles.profileFor(p.profileName).label}</span>`;
        const avatarMarkup = !p.isHuman && p.avatarSpec ? `<div class="seat-avatar">${Avatar.render(p.avatarSpec, 40)}</div>` : "";
        const quipMarkup =
          activeQuip && activeQuip.playerId === p.id && Date.now() < activeQuip.expiresAt
            ? `<div class="seat-quip">&ldquo;${activeQuip.text}&rdquo;</div>`
            : "";
        const showCards = gvs.state && (revealed ? !p.folded : true);
        const faceDown = !(revealed && !p.folded);
        let debugLine = "";
        if (peekAi && !p.isHuman && gvs.state && !revealed && !p.folded) {
          const hand = Guts357Rules.evaluateHand(gvs.state, p);
          debugLine = `<div class="seat-debug">AI's actual hand: ${HandEvaluator.describe(hand)}</div>`;
        }
        return `
          <div class="seat ${p.folded ? "seat-folded" : ""} ${isTurn ? "seat-active" : ""}">
            ${quipMarkup}
            ${avatarMarkup}
            <div class="seat-name">${p.name}${profileBadge}</div>
            <div class="seat-chips">${money(ChipEconomy.chipsToDollars(p.wallet.chips))}</div>
            <div class="seat-cards">
              ${gvs.state && showCards ? p.hand.map((c) => cardMarkup(c, faceDown)).join("") : ""}
            </div>
            ${debugLine}
            ${p.folded ? '<div class="seat-status">Folded</div>' : gvs.state && stillDeciding && gvs.state.status !== "complete" ? '<div class="seat-status">Deciding...</div>' : ""}
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
    const roundLine = gvs.state.status === "complete" ? "" : `<div><strong>Round:</strong> ${gvs.state.roundIndex + 1} of 3 — ${gvs.state.wildRank}s wild</div>`;
    const potDisplay = gvs.state.status === "complete" ? gvs.state.potAtShowdown : gvs.state.pot;
    el.boardHand.innerHTML = `
      <div><strong>Pot:</strong> ${money(ChipEconomy.chipsToDollars(potDisplay))}</div>
      ${roundLine}
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
    if (!gvs.state) {
      el.actionPanel.innerHTML = `<button id="deal-first-hand-btn">Deal first hand</button>`;
      return;
    }
    if (gvs.state.status === "complete") {
      const winner = gvs.state.winnerId ? Guts357Rules.getPlayer(gvs.state, gvs.state.winnerId) : null;
      const canDeal = orchestrator.canDealNextHand();
      const resultLine = winner
        ? `${winner.name} wins the ${money(ChipEconomy.chipsToDollars(gvs.state.potAtShowdown))} pot.`
        : gvs.state.noContest
        ? "Nobody stayed in — the pot carries forward."
        : "Hand over.";
      el.actionPanel.innerHTML = `
        <div>${resultLine}</div>
        ${canDeal ? `<button id="deal-next-hand-btn">Deal next hand</button>` : `<div>You're out of chips for this hand. Buy more chips or cash out to continue.</div>`}
      `;
      return;
    }
    const human = gvs.players.find((p) => p.id === humanId);
    if (gvs.pending && gvs.pending.kind === "stayDecision" && !human.folded && gvs.state.stayDecisions[humanId] == null) {
      const hand = Guts357Rules.evaluateHand(gvs.state, human);
      el.actionPanel.innerHTML = `
        <div>Round ${gvs.state.roundIndex + 1} of 3 — your hand: ${HandEvaluator.describe(hand)}. Stay in (ante already paid) or fold?</div>
        <button data-stay-yes>Stay in</button>
        <button data-stay-no>Fold</button>
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
      if (e.target.hasAttribute("data-stay-yes")) return orchestrator.humanDeclare(true);
      if (e.target.hasAttribute("data-stay-no")) return orchestrator.humanDeclare(false);
    };
  }

  return { renderSeats, renderBoard, renderHumanHand, renderActionPanel, wireActions };
})();

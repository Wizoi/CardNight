"use strict";

// Table-view rendering for Blind Man's Bluff. The core visual gimmick:
// every OTHER seat's single card is always shown face up (that's the whole
// "forehead" mechanic -- you see everyone else's card) while the human's
// OWN seat always renders as a card-back, even though the underlying data
// is a perfectly normal card the whole time -- only reveals at showdown.
const TableUIBlindMansBluff = (function () {
  function cardMarkup(card, faceDown) {
    if (faceDown) return `<div class="card card-back"></div>`;
    const red = card.suit === "H" || card.suit === "D";
    return `<div class="card ${red ? "card-red" : "card-black"}">${Deck.cardLabel(card)}</div>`;
  }

  function money(dollars) {
    return `$${dollars.toFixed(2)}`;
  }

  function renderSeats(el, gvs, debugMode, activeQuip) {
    const revealed = gvs.state && gvs.state.status === "complete";
    const currentBettorId = gvs.state && gvs.state.bettingRound ? BlindMansBluffRules.getCurrentBettor(gvs.state) : null;
    el.seats.innerHTML = gvs.players
      .map((p) => {
        const isTurn = p.id === currentBettorId;
        const profileBadge = p.isHuman
          ? ""
          : `<span class="profile-badge">${p.archetypeLabel || AIProfiles.profileFor(p.profileName).label}</span>`;
        const avatarMarkup = !p.isHuman && p.avatarSpec ? `<div class="seat-avatar">${Avatar.render(p.avatarSpec, 40)}</div>` : "";
        const quipMarkup =
          activeQuip && activeQuip.playerId === p.id && Date.now() < activeQuip.expiresAt
            ? `<div class="seat-quip">&ldquo;${activeQuip.text}&rdquo;</div>`
            : "";
        // The human's OWN seat is the one exception to "everyone else's
        // card is always visible" -- it stays a card-back until showdown,
        // same as it would look to every OTHER seat looking at their own.
        const hideThisCard = p.isHuman && !revealed;
        const cardMk = gvs.state ? cardMarkup(p.hand[0], hideThisCard) : "";
        return `
          <div class="seat ${p.folded ? "seat-folded" : ""} ${isTurn ? "seat-active" : ""}">
            ${quipMarkup}
            ${avatarMarkup}
            <div class="seat-name">${p.name}${profileBadge}</div>
            <div class="seat-chips">${money(ChipEconomy.chipsToDollars(p.wallet.chips))}</div>
            <div class="seat-cards">${cardMk}</div>
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
    el.boardHand.innerHTML = `<div><strong>Pot:</strong> ${money(ChipEconomy.chipsToDollars(gvs.state.pot))}</div>`;
  }

  // The human's own hand panel stays empty/hidden the whole hand -- they
  // never get to look at their own card at all, by design (their seat in
  // renderSeats is the only place this card would ever render, and even
  // there it's a card-back until showdown).
  function renderHumanHand(el, gvs) {
    if (!gvs.state) {
      el.humanHand.innerHTML = "";
      return;
    }
    el.humanHand.innerHTML = `<em>Your card is on your forehead — you can't see it. Everyone else can.</em>`;
  }

  function renderActionPanel(el, gvs, humanId, orchestrator, settings) {
    const human = gvs.players.find((p) => p.id === humanId);
    if (!gvs.state) {
      el.actionPanel.innerHTML = `<button id="deal-first-hand-btn">Deal first hand</button>`;
      return;
    }
    if (gvs.state.status === "complete") {
      const canDeal = orchestrator.canDealNextHand();
      const resultLine = gvs.state.winnerIds && gvs.state.winnerIds.length > 1
        ? `${gvs.state.winnerIds.map((id) => BlindMansBluffRules.getPlayer(gvs.state, id).name).join(", ")} tied and split the pot.`
        : gvs.state.winnerId
        ? `${BlindMansBluffRules.getPlayer(gvs.state, gvs.state.winnerId).name} wins with the highest card.`
        : "Hand over.";
      el.actionPanel.innerHTML = `
        <div>${resultLine}</div>
        ${canDeal ? `<button id="deal-next-hand-btn">Deal next hand</button>` : `<div>You're out of chips for this hand. Buy more chips or cash out to continue.</div>`}
      `;
      return;
    }
    if (gvs.state.bettingRound && BlindMansBluffRules.getCurrentBettor(gvs.state) === human.id) {
      const br = gvs.state.bettingRound;
      const toCallDollars = ChipEconomy.chipsToDollars(br.currentBetChips - br.committed[human.id]);
      const maxRaise = BlindMansBluffRules.maxRaiseDollars(gvs.state, human.id);
      el.actionPanel.innerHTML = `
        <div>Betting round — to call: ${money(toCallDollars)} (you can't see your own card — judge by what everyone else is showing).</div>
        <button data-bet-fold>Fold</button>
        <button data-bet-call>${toCallDollars > 0 ? `Call ${money(toCallDollars)}` : "Check"}</button>
        ${maxRaise > 0 ? `<button data-bet-raise="${settings.raiseIncrementDollars}">Raise +${money(settings.raiseIncrementDollars)}</button>` : ""}
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
      if (e.target.hasAttribute("data-bet-fold")) return orchestrator.humanBet("fold");
      if (e.target.hasAttribute("data-bet-call")) return orchestrator.humanBet("call");
      if (e.target.hasAttribute("data-bet-raise")) return orchestrator.humanBet("raise", Number(e.target.getAttribute("data-bet-raise")));
    };
  }

  return { renderSeats, renderBoard, renderHumanHand, renderActionPanel, wireActions };
})();

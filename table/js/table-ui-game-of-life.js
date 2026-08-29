"use strict";

// Table-view rendering for Game of Life. Hands are private the whole hand
// (nobody has a "showing hand" -- gains from the good row are nobody
// else's business until showdown), so seats just show a card-back per
// card held; the two table rows are the real board.
const TableUIGameOfLife = (function () {
  function cardMarkup(card, faceDown) {
    if (faceDown) return `<div class="card card-back"></div>`;
    if (card.rank === "JOKER") return `<div class="card card-black">${Deck.cardLabel(card)}<span class="wild-tag">W</span></div>`;
    const red = card.suit === "H" || card.suit === "D";
    return `<div class="card ${red ? "card-red" : "card-black"}">${Deck.cardLabel(card)}</div>`;
  }

  function money(dollars) {
    return `$${dollars.toFixed(2)}`;
  }

  function renderSeats(el, gvs, debugMode, activeQuip) {
    const revealed = gvs.state && gvs.state.status === "complete";
    const currentBettorId = gvs.state && gvs.state.bettingRound ? RulesGameOfLife.getCurrentBettor(gvs.state) : null;
    const currentFlipperId = gvs.state && gvs.state.status === "flipping" ? RulesGameOfLife.currentFlipPlayerId(gvs.state) : null;
    const peekAi = debugMode && gvs.state;
    el.seats.innerHTML = gvs.players
      .map((p) => {
        const isTurn = p.id === currentBettorId || p.id === currentFlipperId;
        const profileBadge = p.isHuman
          ? ""
          : `<span class="profile-badge">${p.archetypeLabel || AIProfiles.profileFor(p.profileName).label}</span>`;
        const avatarMarkup = !p.isHuman && p.avatarSpec ? `<div class="seat-avatar">${Avatar.render(p.avatarSpec, 40)}</div>` : "";
        const quipMarkup =
          activeQuip && activeQuip.playerId === p.id && Date.now() < activeQuip.expiresAt
            ? `<div class="seat-quip">&ldquo;${activeQuip.text}&rdquo;</div>`
            : "";
        let debugLine = "";
        if (peekAi && !p.isHuman && gvs.state && !revealed) {
          const cards = p.hand.map((c) => ({ rank: c.rank, suit: c.suit, isWild: c.rank === "JOKER" }));
          const hand = HandEvaluator.evaluatePartial(cards);
          debugLine = `<div class="seat-debug">AI's actual hand: ${HandEvaluator.describe(hand)} (${p.hand.length} cards)</div>`;
        }
        const cards = gvs.state ? p.hand.map((c) => cardMarkup(c, !revealed)).join("") : "";
        return `
          <div class="seat ${p.folded ? "seat-folded" : ""} ${isTurn ? "seat-active" : ""}">
            ${quipMarkup}
            ${avatarMarkup}
            <div class="seat-name">${p.name}${profileBadge}</div>
            <div class="seat-chips">${money(ChipEconomy.chipsToDollars(p.wallet.chips))}</div>
            <div class="seat-cards">${cards}</div>
            ${debugLine}
            ${p.folded ? '<div class="seat-status">Folded</div>' : ""}
          </div>
        `;
      })
      .join("");
  }

  function rowMarkup(row) {
    return row
      .map((c) => {
        if (!c.flipped) return cardMarkup(null, true);
        return cardMarkup(c, false);
      })
      .join("");
  }

  function renderBoard(el, gvs) {
    if (!gvs.state) {
      el.boardHand.innerHTML = "";
      return;
    }
    const poisonLine = gvs.state.poisonedRanks.length ? `<div><strong>Poisoned ranks:</strong> ${gvs.state.poisonedRanks.join(", ")}</div>` : "";
    const potDisplay = gvs.state.status === "complete" ? gvs.state.potAtShowdown : gvs.state.pot;
    el.boardHand.innerHTML = `
      <div><strong>Pot:</strong> ${money(ChipEconomy.chipsToDollars(potDisplay))}</div>
      <div><strong>Good row:</strong> ${rowMarkup(gvs.state.goodRow)}</div>
      <div><strong>Bad row:</strong> ${rowMarkup(gvs.state.badRow)}</div>
      ${poisonLine}
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

  function renderActionPanel(el, gvs, humanId, orchestrator, settings) {
    const human = gvs.players.find((p) => p.id === humanId);
    if (!gvs.state) {
      el.actionPanel.innerHTML = `<button id="deal-first-hand-btn">Deal first hand</button>`;
      return;
    }
    if (gvs.state.status === "complete") {
      const canDeal = orchestrator.canDealNextHand();
      const names = (gvs.state.winnerIds || []).map((id) => RulesGameOfLife.getPlayer(gvs.state, id).name);
      const resultLine = names.length
        ? `${names.join(", ")} win${names.length > 1 ? "" : "s"} the ${money(ChipEconomy.chipsToDollars(gvs.state.potAtShowdown))} pot.`
        : "Hand over.";
      el.actionPanel.innerHTML = `
        <div>${resultLine}</div>
        ${canDeal ? `<button id="deal-next-hand-btn">Deal next hand</button>` : `<div>You're out of chips for this hand. Buy more chips or cash out to continue.</div>`}
      `;
      return;
    }
    if (gvs.pending && gvs.pending.kind === "flipChoice" && gvs.pending.playerId === humanId) {
      const required = RulesGameOfLife.requiredRowFor(gvs.state);
      if (required) {
        el.actionPanel.innerHTML = `
          <div>Flips alternate — it's the <strong>${required}</strong> row's turn.</div>
          <button data-flip-required="${required}">Flip ${required} row</button>
        `;
        return;
      }
      const goodLeft = gvs.state.goodRow.some((c) => !c.flipped);
      const badLeft = gvs.state.badRow.some((c) => !c.flipped);
      el.actionPanel.innerHTML = `
        <div>You're first to flip this hand — pick good (added to your hand) or bad (discarded, poisons its rank). Every flip after this one alternates automatically.</div>
        <button data-flip-good ${goodLeft ? "" : "disabled"}>Flip good row</button>
        <button data-flip-bad ${badLeft ? "" : "disabled"}>Flip bad row</button>
      `;
      return;
    }
    if (gvs.state.bettingRound && RulesGameOfLife.getCurrentBettor(gvs.state) === human.id) {
      const br = gvs.state.bettingRound;
      const toCallDollars = ChipEconomy.chipsToDollars(br.currentBetChips - br.committed[human.id]);
      const maxRaise = RulesGameOfLife.maxRaiseDollars(gvs.state, human.id);
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
    el.humanHand.onclick = null;
    el.actionPanel.onclick = (e) => {
      if (e.target.id === "deal-first-hand-btn") return orchestrator.startFirstHand();
      if (e.target.id === "deal-next-hand-btn") return orchestrator.dealNextHand();
      if (e.target.hasAttribute("data-flip-good")) return orchestrator.humanFlipChoice("good");
      if (e.target.hasAttribute("data-flip-bad")) return orchestrator.humanFlipChoice("bad");
      if (e.target.hasAttribute("data-flip-required")) return orchestrator.humanFlipChoice(e.target.getAttribute("data-flip-required"));
      if (e.target.hasAttribute("data-bet-fold")) return orchestrator.humanBet("fold");
      if (e.target.hasAttribute("data-bet-call")) return orchestrator.humanBet("call");
      if (e.target.hasAttribute("data-bet-raise")) return orchestrator.humanBet("raise", Number(e.target.getAttribute("data-bet-raise")));
    };
  }

  return { renderSeats, renderBoard, renderHumanHand, renderActionPanel, wireActions };
})();

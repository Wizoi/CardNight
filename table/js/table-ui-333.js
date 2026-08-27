"use strict";

// Table-view rendering for 3-33. The action panel alternates between the
// usual betting prompt and a "reveal next card" button (or the Ultima/
// outright-win/showdown result once the hand ends).
const TableUI333 = (function () {
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
    const currentBettorId = gvs.state && gvs.state.bettingRound ? Rules333.getCurrentBettor(gvs.state) : null;
    const peekAi = debugMode && gvs.state;
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
        let debugLine = "";
        if (peekAi && !p.isHuman && gvs.state && !revealed && !p.folded) {
          const low = Rules333.handSumResult(gvs.state, p, Rules333.LOW_TARGET);
          const high = Rules333.handSumResult(gvs.state, p, Rules333.HIGH_TARGET);
          debugLine = `<div class="seat-debug">AI's actual hand: low ${low.value}, high ${high.value} (${p.hand.length} card(s) left)</div>`;
        }
        const cards = gvs.state && !p.folded ? p.hand.map((c) => cardMarkup(c, !revealed)).join("") : "";
        const outright = gvs.state && gvs.state.outrightWinnerIds && gvs.state.outrightWinnerIds.includes(p.id);
        return `
          <div class="seat ${p.folded ? "seat-folded" : ""} ${isTurn ? "seat-active" : ""}">
            ${quipMarkup}
            ${avatarMarkup}
            <div class="seat-name">${p.name}${profileBadge}</div>
            <div class="seat-chips">${money(ChipEconomy.chipsToDollars(p.wallet.chips))}</div>
            <div class="seat-cards">${cards}</div>
            ${debugLine}
            ${p.folded ? '<div class="seat-status">Folded</div>' : gvs.state && p.hand.length === 0 && gvs.state.status !== "complete" ? '<div class="seat-status">Emptied hand!</div>' : ""}
            ${outright ? '<div class="seat-status">Outright winner!</div>' : ""}
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
    const communityLine = gvs.state.communityCards.length
      ? `<div><strong>Community (${gvs.state.communityCards.length}/${Rules333.TOTAL_ROUNDS}):</strong> ${gvs.state.communityCards.map((c) => cardMarkup(c, false)).join("")}</div>`
      : "";
    let resultLine = "";
    if (gvs.state.outrightWinnerIds) {
      resultLine = `<div><strong>Outright winner(s):</strong> ${gvs.state.outrightWinnerIds.map((id) => Rules333.getPlayer(gvs.state, id).name).join(", ")}</div>`;
    } else if (gvs.state.results) {
      const lowNames = gvs.state.results.lowWinners.map((id) => Rules333.getPlayer(gvs.state, id).name);
      const highNames = gvs.state.results.highWinners.map((id) => Rules333.getPlayer(gvs.state, id).name);
      resultLine = `
        <div><strong>Low (${Rules333.LOW_TARGET}):</strong> ${lowNames.length ? lowNames.join(", ") : "no qualifiers"}</div>
        <div><strong>High (${Rules333.HIGH_TARGET}):</strong> ${highNames.length ? highNames.join(", ") : "no qualifiers"}</div>
      `;
    }
    el.boardHand.innerHTML = `
      <div><strong>Targets:</strong> ${Rules333.LOW_TARGET} (low) / ${Rules333.HIGH_TARGET} (high)</div>
      <div><strong>Pot:</strong> ${money(ChipEconomy.chipsToDollars(gvs.state.pot))}</div>
      ${communityLine}
      ${resultLine}
    `;
  }

  function renderHumanHand(el, gvs, humanId) {
    const human = gvs.players.find((p) => p.id === humanId);
    if (!gvs.state) {
      el.humanHand.innerHTML = "";
      return;
    }
    if (human.folded) {
      el.humanHand.innerHTML = "<em>Folded</em>";
      return;
    }
    el.humanHand.innerHTML = human.hand.map((c) => cardMarkup(c, false)).join("") || "<em>No cards left</em>";
  }

  function renderActionPanel(el, gvs, humanId, orchestrator, settings) {
    const human = gvs.players.find((p) => p.id === humanId);
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
    if (gvs.state.bettingRound && Rules333.getCurrentBettor(gvs.state) === human.id) {
      const br = gvs.state.bettingRound;
      const toCallDollars = ChipEconomy.chipsToDollars(br.currentBetChips - br.committed[human.id]);
      const maxRaise = Rules333.maxRaiseDollars(gvs.state, human.id);
      el.actionPanel.innerHTML = `
        <div>Betting round — to call: ${money(toCallDollars)}</div>
        <button data-bet-fold>Fold</button>
        <button data-bet-call>${toCallDollars > 0 ? `Call ${money(toCallDollars)}` : "Check"}</button>
        ${maxRaise > 0 ? `<button data-bet-raise="${settings.raiseIncrementDollars}">Raise +${money(settings.raiseIncrementDollars)}</button>` : ""}
      `;
      return;
    }
    if (gvs.state.status === "revealing") {
      el.actionPanel.innerHTML = `
        <div>Round ${gvs.state.roundIndex + 1} of ${Rules333.TOTAL_ROUNDS} — reveal the next community card.</div>
        <button data-reveal-next>Reveal next card</button>
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
      if (e.target.hasAttribute("data-reveal-next")) return orchestrator.humanRevealNext();
      if (e.target.hasAttribute("data-bet-fold")) return orchestrator.humanBet("fold");
      if (e.target.hasAttribute("data-bet-call")) return orchestrator.humanBet("call");
      if (e.target.hasAttribute("data-bet-raise")) return orchestrator.humanBet("raise", Number(e.target.getAttribute("data-bet-raise")));
    };
  }

  return { renderSeats, renderBoard, renderHumanHand, renderActionPanel, wireActions };
})();

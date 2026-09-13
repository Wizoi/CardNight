"use strict";

// Table-view rendering for Honest Guts. Same overall shape as
// table-ui-guts.js (hidden hands until showdown, a passing UI, a
// stay/fold declare) plus a new shared pyramid board section and a
// fold-or-pay-50c row-betting prompt in between.
const TableUIHonestGuts = (function () {
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
    const revealed = gvs.state && gvs.state.status === "complete";
    const peekAi = debugMode && gvs.state;
    const stillPassing = gvs.state && gvs.state.status === "passing";
    el.seats.innerHTML = gvs.players
      .map((p) => {
        const stillDeciding = gvs.state && !p.folded && gvs.state.stayDecisions[p.id] == null && gvs.state.status === "declaring";
        const stillPickingPass = stillPassing && gvs.state.passSelections[p.id] == null;
        const isTurn = !!(
          gvs.pending &&
          ((gvs.pending.kind === "stayDecision" && stillDeciding && p.isHuman) ||
            (gvs.pending.kind === "passSelection" && stillPickingPass && p.isHuman) ||
            (gvs.pending.kind === "rowDecision" && p.isHuman))
        );
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
          const hand = HonestGutsRules.evaluateHand(gvs.state, p);
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
            ${
              p.folded
                ? '<div class="seat-status">Folded</div>'
                : stillPickingPass
                ? '<div class="seat-status">Passing...</div>'
                : gvs.state && stillDeciding
                ? '<div class="seat-status">Deciding...</div>'
                : ""
            }
          </div>
        `;
      })
      .join("");
  }

  function pyramidMarkup(state) {
    return state.pyramid
      .map((row, i) => {
        const revealed = state.pyramidRevealed[i];
        const cards = row
          .map((c) => (revealed ? cardMarkup({ ...c, isWild: HonestGutsRules.isCardWild(state, c) }, false) : cardMarkup(null, true)))
          .join("");
        return `<div class="pyramid-row"><span class="pyramid-row-label">Row ${i + 1}:</span> ${cards}</div>`;
      })
      .join("");
  }

  function renderBoard(el, gvs) {
    if (!gvs.state) {
      el.boardHand.innerHTML = "";
      return;
    }
    const wildLine = gvs.state.wildRanks.length ? `<div><strong>Wild:</strong> ${gvs.state.wildRanks.join(", ")}s${gvs.state.communityJokerRevealed ? ", plus the revealed Joker" : ""}</div>` : gvs.state.communityJokerRevealed ? `<div><strong>Wild:</strong> the revealed Joker</div>` : "";
    const potDisplay = gvs.state.status === "complete" ? gvs.state.potAtShowdown : gvs.state.pot;
    el.boardHand.innerHTML = `
      <div><strong>Pot:</strong> ${money(ChipEconomy.chipsToDollars(potDisplay))}</div>
      ${wildLine}
      <div class="pyramid">${pyramidMarkup(gvs.state)}</div>
    `;
  }

  function renderHumanHand(el, gvs, humanId) {
    const human = gvs.players.find((p) => p.id === humanId);
    if (!gvs.state) {
      el.humanHand.innerHTML = "";
      return;
    }
    const pendingPass = gvs.pending && gvs.pending.kind === "passSelection";
    const assignments = pendingPass && gvs.passSelectionSoFar ? gvs.passSelectionSoFar.assignments : {};
    el.humanHand.innerHTML = human.hand
      .map((c, i) => {
        if (pendingPass) {
          const assigned = assignments[i];
          const red = c.suit === "H" || c.suit === "D";
          const tag = assigned === "left" ? `<span class="wild-tag">L</span>` : assigned === "right" ? `<span class="wild-tag">R</span>` : "";
          return `<div data-pass-card="${i}" class="card ${red ? "card-red" : "card-black"}${assigned ? " card-beaten" : ""}">${Deck.cardFaceHtml(c)}${tag}</div>`;
        }
        return cardMarkup({ ...c, isWild: HonestGutsRules.isCardWild(gvs.state, c) }, false);
      })
      .join("");
  }

  function renderActionPanel(el, gvs, humanId, orchestrator) {
    if (!gvs.state) {
      el.actionPanel.innerHTML = `<button id="deal-first-hand-btn">Deal first hand</button>`;
      return;
    }
    if (gvs.state.status === "complete") {
      const winners = gvs.state.winnerIds.map((id) => HonestGutsRules.getPlayer(gvs.state, id).name);
      const canDeal = orchestrator.canDealNextHand();
      const resultLine = winners.length
        ? `${winners.join(", ")} ${winners.length > 1 ? "win" : "wins"} the ${money(ChipEconomy.chipsToDollars(gvs.state.potAtShowdown))} pot.`
        : gvs.state.noContest
        ? "Everybody folded — the pot carries forward."
        : "Round over.";
      const cycleLine = gvs.state.cycleComplete ? "" : "<div>The pot escalates — deal the next hand to keep the cycle going.</div>";
      el.actionPanel.innerHTML = `
        <div>${resultLine}</div>
        ${cycleLine}
        ${canDeal ? `<button id="deal-next-hand-btn">Deal next hand</button>` : `<div>You're out of chips for this hand. Buy more chips or cash out to continue.</div>`}
      `;
      return;
    }
    if (gvs.pending && gvs.pending.kind === "passSelection") {
      const counts = gvs.state.passCounts;
      const assignments = (gvs.passSelectionSoFar && gvs.passSelectionSoFar.assignments) || {};
      const leftSoFar = Object.values(assignments).filter((v) => v === "left").length;
      const rightSoFar = Object.values(assignments).filter((v) => v === "right").length;
      const ready = leftSoFar === counts.left && rightSoFar === counts.right;
      el.actionPanel.innerHTML = `
        <div>Choose ${counts.left} card(s) to pass left (L) and ${counts.right} to pass right (R) — click a card to assign it, click again to cycle L → R → unassigned.</div>
        <div>Left: ${leftSoFar}/${counts.left} &nbsp; Right: ${rightSoFar}/${counts.right}</div>
        <button data-confirm-pass ${ready ? "" : "disabled"}>Confirm pass</button>
      `;
      return;
    }
    if (gvs.pending && gvs.pending.kind === "rowDecision") {
      const human = gvs.players.find((p) => p.id === humanId);
      const hand = HonestGutsRules.evaluateHand(gvs.state, human);
      el.actionPanel.innerHTML = `
        <div>Row ${gvs.state.rowIndex + 1} of 3 revealed. Your hand: ${HandEvaluator.describe(hand)}.</div>
        <button data-row-pay>Put in ${money(gvs.state.rowBetDollars)}</button>
        <button data-row-fold>Fold</button>
      `;
      return;
    }
    if (gvs.pending && gvs.pending.kind === "stayDecision") {
      const human = gvs.players.find((p) => p.id === humanId);
      const hand = HonestGutsRules.evaluateHand(gvs.state, human);
      el.actionPanel.innerHTML = `
        <div>Pyramid's fully revealed. Your hand: ${HandEvaluator.describe(hand)}. Stay in (ante already paid) or fold?</div>
        <button data-stay-yes>Stay in</button>
        <button data-stay-no>Fold</button>
      `;
      return;
    }
    el.actionPanel.innerHTML = `<div>Waiting for other players...</div>`;
  }

  function wireActions(el, orchestrator) {
    el.humanHand.onclick = (e) => {
      const passCardEl = e.target.closest("[data-pass-card]");
      if (passCardEl) return orchestrator.humanTogglePassCard(Number(passCardEl.getAttribute("data-pass-card")));
    };
    el.actionPanel.onclick = (e) => {
      if (e.target.id === "deal-first-hand-btn") return orchestrator.startFirstHand();
      if (e.target.id === "deal-next-hand-btn") return orchestrator.dealNextHand();
      if (e.target.hasAttribute("data-confirm-pass")) return orchestrator.humanConfirmPassSelection();
      if (e.target.hasAttribute("data-row-pay")) return orchestrator.humanRowDecision(true);
      if (e.target.hasAttribute("data-row-fold")) return orchestrator.humanRowDecision(false);
      if (e.target.hasAttribute("data-stay-yes")) return orchestrator.humanDeclare(true);
      if (e.target.hasAttribute("data-stay-no")) return orchestrator.humanDeclare(false);
    };
  }

  return { renderSeats, renderBoard, renderHumanHand, renderActionPanel, wireActions };
})();

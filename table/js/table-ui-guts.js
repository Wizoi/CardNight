"use strict";

// Table-view rendering for the open-loop Guts engine (Deep or Double
// Screw, 3 Buy 5 / 5 Buy 5, Four-Two-Two). No betting rounds and no
// per-street reveals -- every player's hand is either fully hidden
// (while everyone's still deciding) or fully shown (once the round's
// showdown has happened), so seats are simpler than any other family.
const TableUIGuts = (function () {
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
        const stillDeciding = gvs.state && gvs.state.stayDecisions[p.id] == null;
        const stillPickingPass = stillPassing && gvs.state.passSelections[p.id] == null;
        const isTurn = !!(
          gvs.pending &&
          ((gvs.pending.kind === "stayDecision" && stillDeciding && p.isHuman) ||
            (gvs.pending.kind === "passSelection" && stillPickingPass && p.isHuman) ||
            gvs.pending.playerId === p.id)
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
        if (peekAi && !p.isHuman && gvs.state && !revealed) {
          const hand = GutsRules.evaluateHand(gvs.state, p);
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
                : gvs.state && stillDeciding && gvs.state.status !== "complete" && gvs.state.status !== "passing"
                ? '<div class="seat-status">Deciding...</div>'
                : ""
            }
          </div>
        `;
      })
      .join("");
  }

  function renderHumanHand(el, gvs, humanId) {
    const human = gvs.players.find((p) => p.id === humanId);
    if (!gvs.state) {
      el.humanHand.innerHTML = "";
      return;
    }
    const pendingExchange = gvs.pending && gvs.pending.kind === "exchangeDecision" && gvs.pending.playerId === humanId;
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
        const markup = cardMarkup(c, false);
        if (!pendingExchange) return markup;
        // See table-ui-anaconda.js's identical fix -- replacing the whole
        // `<div class="card` prefix used to prematurely close the class
        // attribute right after "card", silently dropping card-red/
        // card-black (every red card rendered black during an exchange).
        return markup.replace("<div", `<div data-exchange-card="${i}"`);
      })
      .join("");
  }

  function renderActionPanel(el, gvs, humanId, orchestrator, settings) {
    if (!gvs.state) {
      el.actionPanel.innerHTML = `<button id="deal-first-hand-btn">Deal first hand</button>`;
      return;
    }
    if (gvs.state.status === "complete") {
      const winner = gvs.state.winnerId ? GutsRules.getPlayer(gvs.state, gvs.state.winnerId) : null;
      const canDeal = orchestrator.canDealNextHand();
      const winnerHandDesc = winner ? HandEvaluator.describe(GutsRules.evaluateHand(gvs.state, winner)) : null;
      const dummyHandDesc =
        gvs.state.dummyBeatEveryone && gvs.state.dummyHand ? HandEvaluator.describe(GutsRules.evaluateHand(gvs.state, gvs.state.dummyHand)) : null;
      const resultLine = winner
        ? `${winner.name} wins the ${money(ChipEconomy.chipsToDollars(gvs.state.potAtShowdown))} pot with ${winnerHandDesc}.`
        : gvs.state.noContest
        ? "Nobody stayed in — the pot carries forward."
        : gvs.state.dummyBeatEveryone
        ? `The dummy hand${dummyHandDesc ? ` (${dummyHandDesc})` : ""} beats everyone who stayed in — no winner this round.`
        : "Round over.";
      const cycleLine = gvs.state.cycleComplete ? "" : "<div>The pot escalates — deal the next hand to keep the cycle going.</div>";
      // Reported directly (2026-11-23): a player watching the pot climb
      // into the hundreds assumed that was their own personal loss, when
      // the real dollar accounting always capped what they actually paid
      // at whatever was left in their wallet. Net ($ actually won/lost)
      // stays the true figure -- this is a clarifying note, not a change
      // to that math.
      const humanShortfall = (gvs.state.allInShortfalls || []).find((s) => s.playerId === humanId);
      const allInLine = humanShortfall
        ? `<div class="all-in-notice">⚠️ You went all-in for ${money(ChipEconomy.chipsToDollars(humanShortfall.paidChips))} — short of the ${money(
            ChipEconomy.chipsToDollars(humanShortfall.owedChips)
          )} pot match. That's all it actually cost you; the pot climbing further from here isn't money you lost.</div>`
        : "";
      el.actionPanel.innerHTML = `
        <div>${resultLine}</div>
        ${allInLine}
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
    if (gvs.pending && gvs.pending.kind === "stayDecision" && gvs.pending.playerId == null) {
      const human = gvs.players.find((p) => p.id === humanId);
      const hand = GutsRules.evaluateHand(gvs.state, human);
      // Reported directly (2026-11-23): the pot shown here is what a
      // LOSING stayer matches in full if the cycle doesn't resolve this
      // round -- a player watching it climb into the hundreds can read
      // that as their own exposure, when the real cap is whatever's left
      // in their own wallet (no borrowing, ever). Spell out the smaller
      // of the two up front, before the decision, not just after.
      const potChips = gvs.state.potAtShowdown != null ? gvs.state.potAtShowdown : gvs.state.pot;
      const walletChips = human && human.wallet ? human.wallet.chips : 0;
      const atRiskLine =
        walletChips < potChips
          ? `<div>If you stay and lose, you'd go all-in for ${money(ChipEconomy.chipsToDollars(walletChips))} (your whole stack) rather than the full ${money(
              ChipEconomy.chipsToDollars(potChips)
            )} pot match.</div>`
          : "";
      el.actionPanel.innerHTML = `
        <div>Your hand: ${HandEvaluator.describe(hand)}. Stay in (ante already paid) or fold?</div>
        ${atRiskLine}
        <button data-stay-yes>Stay in</button>
        <button data-stay-no>Fold</button>
      `;
      return;
    }
    if (gvs.pending && gvs.pending.kind === "exchangeDecision" && gvs.pending.playerId === humanId) {
      const priceDollars = gvs.state.gameConfig.exchangePriceDollars;
      el.actionPanel.innerHTML = `
        <div>Click a card below to exchange it for ${money(priceDollars)}, or skip.</div>
        <button data-exchange-skip>Keep my hand</button>
      `;
      return;
    }
    el.actionPanel.innerHTML = `<div>Waiting for other players...</div>`;
  }

  function wireActions(el, orchestrator) {
    el.humanHand.onclick = (e) => {
      const exchangeCardEl = e.target.closest("[data-exchange-card]");
      if (exchangeCardEl) return orchestrator.humanExchangeDecision(Number(exchangeCardEl.getAttribute("data-exchange-card")));
      const passCardEl = e.target.closest("[data-pass-card]");
      if (passCardEl) return orchestrator.humanTogglePassCard(Number(passCardEl.getAttribute("data-pass-card")));
    };
    el.actionPanel.onclick = (e) => {
      if (e.target.id === "deal-first-hand-btn") return orchestrator.startFirstHand();
      if (e.target.id === "deal-next-hand-btn") return orchestrator.dealNextHand();
      if (e.target.hasAttribute("data-confirm-pass")) return orchestrator.humanConfirmPassSelection();
      if (e.target.hasAttribute("data-stay-yes")) return orchestrator.humanDeclare(true);
      if (e.target.hasAttribute("data-stay-no")) return orchestrator.humanDeclare(false);
      if (e.target.hasAttribute("data-exchange-skip")) return orchestrator.humanExchangeDecision(-1);
    };
  }

  return { renderSeats, renderHumanHand, renderActionPanel, wireActions };
})();

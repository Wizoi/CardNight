"use strict";

// Table-view rendering for Pair of Jacks, Trips to Win. Standard draw-
// poker board: hands are private the whole hand (revealed only at
// showdown), and the draw itself uses the same click-a-card-to-select
// pattern already established for 3 Buy 5's exchange and Deep or Double
// Screw's passing.
const TableUIDrawPoker = (function () {
  function cardMarkup(card, faceDown) {
    if (faceDown) return `<div class="card card-back"></div>`;
    if (card.rank === "JOKER") return `<div class="card card-black">${Deck.cardFaceHtml(card)}<span class="wild-tag">W</span></div>`;
    const red = card.suit === "H" || card.suit === "D";
    return `<div class="card ${red ? "card-red" : "card-black"}">${Deck.cardFaceHtml(card)}</div>`;
  }

  function money(dollars) {
    return `$${dollars.toFixed(2)}`;
  }

  function renderSeats(el, gvs, debugMode, activeQuip) {
    const revealed = gvs.state && gvs.state.status === "complete";
    const currentBettorId = gvs.state && gvs.state.bettingRound ? RulesDrawPoker.getCurrentBettor(gvs.state) : null;
    const currentDrawerId = gvs.state && gvs.state.status === "drawing" ? RulesDrawPoker.currentDrawPlayerId(gvs.state) : null;
    const peekAi = debugMode && gvs.state;
    el.seats.innerHTML = gvs.players
      .map((p) => {
        const isTurn = p.id === currentBettorId || p.id === currentDrawerId;
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
          const hand = RulesDrawPoker.evaluateHand(p.hand);
          debugLine = `<div class="seat-debug">AI's actual hand: ${HandEvaluator.describe(hand)}</div>`;
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

  function renderBoard(el, gvs) {
    if (!gvs.state) {
      el.boardHand.innerHTML = "";
      return;
    }
    const phaseLine =
      gvs.state.status === "opening"
        ? "Opening round (Jacks-or-better to open)"
        : gvs.state.status === "drawing"
        ? "Draw"
        : gvs.state.status === "finalBetting"
        ? "Final betting round"
        : "";
    const potDisplay = gvs.state.status === "complete" ? gvs.state.potAtShowdown : gvs.state.pot;
    el.boardHand.innerHTML = `
      <div><strong>Pot:</strong> ${money(ChipEconomy.chipsToDollars(potDisplay))}</div>
      <div>${phaseLine}</div>
    `;
  }

  function renderHumanHand(el, gvs, humanId) {
    const human = gvs.players.find((p) => p.id === humanId);
    if (!gvs.state) {
      el.humanHand.innerHTML = "";
      return;
    }
    const pendingDraw = gvs.pending && gvs.pending.kind === "draw" && gvs.pending.playerId === humanId;
    if (!pendingDraw) el.__drawSelection = [];
    const selected = el.__drawSelection || [];
    el.humanHand.innerHTML = human.hand
      .map((c, i) => {
        const markup = cardMarkup(c, false);
        if (!pendingDraw) return markup;
        const isSelected = selected.includes(i);
        // See table-ui-anaconda.js's identical fix -- replacing the whole
        // `<div class="card` prefix used to prematurely close the class
        // attribute right after "card", silently dropping card-red/
        // card-black (every red card rendered black during a draw).
        let out = markup.replace("<div", `<div data-draw-card="${i}"`);
        if (isSelected) out = out.replace('class="', 'class="card-beaten ');
        return out;
      })
      .join("");
  }

  function renderActionPanel(el, gvs, humanId, orchestrator, settings) {
    const human = gvs.players.find((p) => p.id === humanId);
    if (!gvs.state) {
      el.actionPanel.innerHTML = `<button id="deal-first-hand-btn">Deal first hand</button>`;
      return;
    }
    if (gvs.state.status === "complete" && !gvs.state.noOpener) {
      const canDeal = orchestrator.canDealNextHand();
      const names = (gvs.state.winnerIds || []).map((id) => RulesDrawPoker.getPlayer(gvs.state, id).name);
      const resultLine = names.length
        ? `${names.join(", ")} win${names.length > 1 ? "" : "s"} the ${money(ChipEconomy.chipsToDollars(gvs.state.potAtShowdown))} pot with Trips or better.`
        : "Nobody reached Trips or better — the pot carries forward.";
      el.actionPanel.innerHTML = `
        <div>${resultLine}</div>
        ${canDeal ? `<button id="deal-next-hand-btn">Deal next hand</button>` : `<div>You're out of chips for this hand. Buy more chips or cash out to continue.</div>`}
      `;
      return;
    }
    if (gvs.pending && gvs.pending.kind === "draw" && gvs.pending.playerId === humanId) {
      const maxDiscards = RulesDrawPoker.maxDiscardsFor(human);
      const selected = (el.__drawSelection || []).length;
      el.actionPanel.innerHTML = `
        <div data-max-discards="${maxDiscards}">Click up to ${maxDiscards} card(s) to discard and draw replacements (<span data-selected-count>${selected}/${maxDiscards}</span> selected).</div>
        <button data-draw-confirm>Draw</button>
      `;
      return;
    }
    if (gvs.state.bettingRound && RulesDrawPoker.getCurrentBettor(gvs.state) === human.id) {
      const br = gvs.state.bettingRound;
      const toCallDollars = ChipEconomy.chipsToDollars(br.currentBetChips - br.committed[human.id]);
      const maxRaise = RulesDrawPoker.maxRaiseDollars(gvs.state, human.id);
      const hand = RulesDrawPoker.evaluateHand(human.hand);
      const canOpen = gvs.state.status === "opening" && !gvs.state.openedThisRound;
      const qualifies = RulesDrawPoker.qualifiesToOpen(hand);
      if (canOpen && !qualifies) {
        el.actionPanel.innerHTML = `
          <div>Your hand: ${HandEvaluator.describe(hand)} — not Jacks-or-better, so you can't open.</div>
          <button data-bet-call>Check</button>
        `;
        return;
      }
      el.actionPanel.innerHTML = `
        <div>Your hand: ${HandEvaluator.describe(hand)}. To call: ${money(toCallDollars)}.</div>
        <button data-bet-fold>Fold</button>
        <button data-bet-call>${toCallDollars > 0 ? `Call ${money(toCallDollars)}` : canOpen ? "Check" : "Check"}</button>
        ${maxRaise > 0 ? `<button data-bet-raise="${settings.raiseIncrementDollars}">${canOpen ? "Open for" : "Raise +"} ${money(settings.raiseIncrementDollars)}</button>` : ""}
      `;
      return;
    }
    el.actionPanel.innerHTML = `<div>Waiting for other players...</div>`;
  }

  // A card-selection toggle is pure UI state -- it doesn't touch the
  // orchestrator, so there's no notify()-driven re-render to rely on the
  // way every other action gets one. Update the clicked card's own class
  // and the panel's live count directly instead of waiting for one.
  function wireActions(el, orchestrator) {
    el.__drawSelection = el.__drawSelection || [];
    el.humanHand.onclick = (e) => {
      const cardEl = e.target.closest("[data-draw-card]");
      if (!cardEl) return;
      const idx = Number(cardEl.getAttribute("data-draw-card"));
      const sel = el.__drawSelection;
      const pos = sel.indexOf(idx);
      const maxDiscards = Number(el.actionPanel.querySelector("[data-max-discards]")?.dataset.maxDiscards) || 3;
      if (pos >= 0) {
        sel.splice(pos, 1);
        cardEl.classList.remove("card-beaten");
      } else if (sel.length < maxDiscards) {
        sel.push(idx);
        cardEl.classList.add("card-beaten");
      }
      const countEl = el.actionPanel.querySelector("[data-selected-count]");
      if (countEl) countEl.textContent = `${sel.length}/${maxDiscards}`;
    };
    el.actionPanel.onclick = (e) => {
      if (e.target.id === "deal-first-hand-btn") return orchestrator.startFirstHand();
      if (e.target.id === "deal-next-hand-btn") return orchestrator.dealNextHand();
      if (e.target.hasAttribute("data-draw-confirm")) {
        const discardIndices = el.__drawSelection.slice();
        el.__drawSelection = [];
        return orchestrator.humanDraw(discardIndices);
      }
      if (e.target.hasAttribute("data-bet-fold")) return orchestrator.humanBet("fold");
      if (e.target.hasAttribute("data-bet-call")) return orchestrator.humanBet("call");
      if (e.target.hasAttribute("data-bet-raise")) return orchestrator.humanBet("raise", Number(e.target.getAttribute("data-bet-raise")));
    };
  }

  return { renderSeats, renderBoard, renderHumanHand, renderActionPanel, wireActions };
})();

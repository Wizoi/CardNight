"use strict";

// Table-view rendering for Anaconda. Two discard phases (7->4 pass-away,
// then 7->5 straight discard) use the same click-a-card-to-select pattern
// as Pair of Jacks' draw and Deep or Double Screw's passing, except this
// game requires an EXACT count selected (3, then 2) before confirming,
// not "up to N".
const TableUIAnaconda = (function () {
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
    const peekAi = debugMode && gvs.state;
    el.seats.innerHTML = gvs.players
      .map((p) => {
        const isTurn = !!(gvs.pending && gvs.pending.playerId === p.id) || (gvs.state && gvs.state.bettingRound && RulesAnaconda.getCurrentBettor(gvs.state) === p.id);
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
          const showing = RulesAnaconda.evaluateShowingHand(gvs.state, p);
          debugLine = `<div class="seat-debug">AI's actual hand: ${HandEvaluator.describe(showing)} so far</div>`;
        }
        const cards = gvs.state && !p.folded ? p.hand.map((c) => cardMarkup(c, revealed ? false : !c.faceUp)).join("") : "";
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
      {
        discard1: "Discard 3 (passed to your left)",
        betting1: "Betting round",
        discard2: "Discard 2 more",
        betting2: "Betting round",
        revealing: "Rolling your own...",
        revealingBet: `Betting round (reveal ${gvs.state.revealsDone}/5)`,
        complete: "Hand complete",
      }[gvs.state.status] || "";
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
    const pendingKind = gvs.pending && gvs.pending.playerId === humanId ? gvs.pending.kind : null;
    if (pendingKind !== "discard1" && pendingKind !== "discard2") el.__discardSelection = [];
    if (pendingKind !== "arrange") el.__arrangeOrder = [];
    const selected = el.__discardSelection || [];
    const order = el.__arrangeOrder || [];
    el.humanHand.innerHTML = human.hand
      .map((c, i) => {
        const markup = cardMarkup(c, false);
        if (pendingKind === "arrange") {
          const position = order.indexOf(i);
          // Same data-attribute/class-insertion approach as the discard
          // selection below -- see its comment for why this can't just
          // replace the `<div class="card` prefix.
          let out = markup.replace("<div", `<div data-arrange-card="${i}"`);
          if (position >= 0) {
            out = out.replace('class="', 'class="card-beaten ');
            out = out.replace("</div>", `<span class="order-tag">${position + 1}</span></div>`);
          }
          return out;
        }
        if (!pendingKind) return markup;
        const isSelected = selected.includes(i);
        // Inserting the data attribute after `<div` and the selection
        // class at the FRONT of the existing class list (rather than
        // replacing the whole `<div class="card` prefix, which used to
        // prematurely close the class attribute right after "card" and
        // silently drop card-red/card-black -- a real bug: every red card
        // rendered black the moment a discard selection was in progress).
        let out = markup.replace("<div", `<div data-discard-card="${i}"`);
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
    if (gvs.state.status === "complete") {
      const canDeal = orchestrator.canDealNextHand();
      const names = (gvs.state.winnerIds || []).map((id) => RulesAnaconda.getPlayer(gvs.state, id).name);
      const lowNames = (gvs.state.lowWinnerIds || []).map((id) => RulesAnaconda.getPlayer(gvs.state, id).name);
      let resultLine = "Hand over.";
      if (lowNames.length) {
        resultLine = `High: ${names.join(", ")}. Low: ${lowNames.join(", ")}. Pot: ${money(ChipEconomy.chipsToDollars(gvs.state.potAtShowdown))}.`;
      } else if (names.length) {
        resultLine = `${names.join(", ")} win${names.length > 1 ? "" : "s"} the ${money(ChipEconomy.chipsToDollars(gvs.state.potAtShowdown))} pot.`;
      }
      el.actionPanel.innerHTML = `
        <div>${resultLine}</div>
        ${canDeal ? `<button id="deal-next-hand-btn">Deal next hand</button>` : `<div>You're out of chips for this hand. Buy more chips or cash out to continue.</div>`}
      `;
      return;
    }
    if (gvs.pending && gvs.pending.playerId === humanId && gvs.pending.kind === "arrange") {
      const orderedCount = (el.__arrangeOrder || []).length;
      const total = human.hand.length;
      el.actionPanel.innerHTML = `
        <div>Click your cards in the order you want to reveal them (1st reveal first) — ${orderedCount}/${total} placed.</div>
        <button data-arrange-confirm ${orderedCount === total ? "" : "disabled"}>Confirm order</button>
      `;
      return;
    }
    if (gvs.pending && gvs.pending.playerId === humanId && (gvs.pending.kind === "discard1" || gvs.pending.kind === "discard2")) {
      const needed = gvs.pending.kind === "discard1" ? 3 : 2;
      const selected = (el.__discardSelection || []).length;
      const label = gvs.pending.kind === "discard1" ? "discard (passed to your left)" : "discard";
      el.actionPanel.innerHTML = `
        <div data-need-count="${needed}">Click exactly ${needed} card(s) to ${label} (<span data-selected-count>${selected}/${needed}</span> selected).</div>
        <button data-discard-confirm ${selected === needed ? "" : "disabled"}>Confirm</button>
      `;
      return;
    }
    if (gvs.state.bettingRound && RulesAnaconda.getCurrentBettor(gvs.state) === human.id) {
      const br = gvs.state.bettingRound;
      const toCallDollars = ChipEconomy.chipsToDollars(br.currentBetChips - br.committed[human.id]);
      const maxRaise = RulesAnaconda.maxRaiseDollars(gvs.state, human.id);
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

  // Re-numbers every card's reveal-order badge in place after a click,
  // rather than a full re-render -- same "patch the DOM directly" approach
  // the discard-selection handler below already uses for snappy feedback.
  function refreshArrangeBadges(el) {
    const order = el.__arrangeOrder || [];
    el.humanHand.querySelectorAll("[data-arrange-card]").forEach((cardEl) => {
      const idx = Number(cardEl.getAttribute("data-arrange-card"));
      const position = order.indexOf(idx);
      const existingBadge = cardEl.querySelector(".order-tag");
      if (position >= 0) {
        cardEl.classList.add("card-beaten");
        if (existingBadge) existingBadge.textContent = String(position + 1);
        else {
          const span = document.createElement("span");
          span.className = "order-tag";
          span.textContent = String(position + 1);
          cardEl.appendChild(span);
        }
      } else {
        cardEl.classList.remove("card-beaten");
        if (existingBadge) existingBadge.remove();
      }
    });
  }

  function wireActions(el, orchestrator) {
    el.__discardSelection = el.__discardSelection || [];
    el.__arrangeOrder = el.__arrangeOrder || [];
    el.humanHand.onclick = (e) => {
      const arrangeCardEl = e.target.closest("[data-arrange-card]");
      if (arrangeCardEl) {
        const idx = Number(arrangeCardEl.getAttribute("data-arrange-card"));
        const order = el.__arrangeOrder;
        const pos = order.indexOf(idx);
        if (pos >= 0) order.splice(pos, 1);
        else order.push(idx);
        refreshArrangeBadges(el);
        const total = el.humanHand.querySelectorAll("[data-arrange-card]").length;
        const label = el.actionPanel.querySelector("div");
        if (label) label.textContent = `Click your cards in the order you want to reveal them (1st reveal first) — ${order.length}/${total} placed.`;
        const confirmBtn = el.actionPanel.querySelector("[data-arrange-confirm]");
        if (confirmBtn) confirmBtn.disabled = order.length !== total;
        return;
      }
      const cardEl = e.target.closest("[data-discard-card]");
      if (!cardEl) return;
      const idx = Number(cardEl.getAttribute("data-discard-card"));
      const sel = el.__discardSelection;
      const needed = Number(el.actionPanel.querySelector("[data-need-count]")?.dataset.needCount) || 3;
      const pos = sel.indexOf(idx);
      if (pos >= 0) {
        sel.splice(pos, 1);
        cardEl.classList.remove("card-beaten");
      } else if (sel.length < needed) {
        sel.push(idx);
        cardEl.classList.add("card-beaten");
      }
      const countEl = el.actionPanel.querySelector("[data-selected-count]");
      if (countEl) countEl.textContent = `${sel.length}/${needed}`;
      const confirmBtn = el.actionPanel.querySelector("[data-discard-confirm]");
      if (confirmBtn) confirmBtn.disabled = sel.length !== needed;
    };
    el.actionPanel.onclick = (e) => {
      if (e.target.id === "deal-first-hand-btn") return orchestrator.startFirstHand();
      if (e.target.id === "deal-next-hand-btn") return orchestrator.dealNextHand();
      if (e.target.hasAttribute("data-arrange-confirm")) {
        const order = el.__arrangeOrder.slice();
        el.__arrangeOrder = [];
        return orchestrator.humanArrangeOrder(order);
      }
      if (e.target.hasAttribute("data-discard-confirm")) {
        const indices = el.__discardSelection.slice();
        el.__discardSelection = [];
        return orchestrator.humanDiscard(indices);
      }
      if (e.target.hasAttribute("data-bet-fold")) return orchestrator.humanBet("fold");
      if (e.target.hasAttribute("data-bet-call")) return orchestrator.humanBet("call");
      if (e.target.hasAttribute("data-bet-raise")) return orchestrator.humanBet("raise", Number(e.target.getAttribute("data-bet-raise")));
    };
  }

  return { renderSeats, renderBoard, renderHumanHand, renderActionPanel, wireActions };
})();

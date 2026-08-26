"use strict";

// Table-view rendering for the shared stud engine (Daytime/Rainy Day
// Baseball). Dealing is dealer-driven and automatic (no player-paced
// flip-your-own-card loop), so unlike Midnight Baseball's action panel,
// there's no "keep flipping / concede" state — the human only ever acts on
// a buy-3/9/4 decision or a betting round; everything else plays out on its
// own with the same pacing delays already used elsewhere in the app.
const TableUIStud = (function () {
  function cardMarkup(card, faceDown, beaten) {
    if (faceDown) return `<div class="card card-back"></div>`;
    const red = card.suit === "H" || card.suit === "D";
    const wildTag = card.isWild || card.bought ? `<span class="wild-tag">W</span>` : "";
    const extraClass = beaten ? " card-beaten" : "";
    return `<div class="card ${red ? "card-red" : "card-black"}${extraClass}">${Deck.cardLabel(card)}${wildTag}</div>`;
  }

  function money(dollars) {
    return `$${dollars.toFixed(2)}`;
  }

  function renderSeats(el, gvs, debugMode, activeQuip) {
    const currentBettorId = gvs.state && gvs.state.bettingRound ? StudRules.getCurrentBettor(gvs.state) : null;
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
          const showing = StudRules.evaluateShowingHand(gvs.state, p.id);
          const streetsLeft = StudRules.streetsRemaining(gvs.state);
          debugLine = `<div class="seat-debug">AI reasons from: ${HandEvaluator.describe(showing)}, ${streetsLeft} street(s) left</div>`;
        }
        return `
          <div class="seat ${p.folded ? "seat-folded" : ""} ${isTurn ? "seat-active" : ""}">
            ${quipMarkup}
            ${avatarMarkup}
            <div class="seat-name">${isDealer ? "🎲 " : ""}${p.name}${profileBadge}</div>
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
    const best = StudRules.currentBestShowingHand(gvs.state);
    const holder = best.holderId ? StudRules.getPlayer(gvs.state, best.holderId) : null;
    const tableCardsLine =
      gvs.state.tableCards && gvs.state.tableCards.length
        ? `<div><strong>Table cards:</strong> ${gvs.state.tableCards
            .map((c, i) => {
              const label = gvs.state.gameConfig.tableReveals[i].label;
              return c.revealed ? `${label}: ${cardMarkup(c, false)}` : `${label}: ${cardMarkup(null, true)}`;
            })
            .join(" ")}</div>`
        : "";
    const enterprisePileLine =
      gvs.state.enterprisePile && gvs.state.enterprisePile.length
        ? `<div><strong>Enterprise pile:</strong> ${gvs.state.enterprisePile
            .map((c, i) => `${cardMarkup(c, false)} ${money(StudRules.currentEnterprisePriceDollars(gvs.state, i))}`)
            .join(" &nbsp; ")}</div>`
        : "";
    el.boardHand.innerHTML = `
      <div><strong>Best showing hand:</strong> ${holder ? `${HandEvaluator.describe(best.hand)} (held by ${holder.name})` : "None yet"}</div>
      <div><strong>Pot:</strong> ${money(ChipEconomy.chipsToDollars(gvs.state.pot))}</div>
      ${tableCardsLine}
      ${enterprisePileLine}
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
      const winner = gvs.state.winnerId ? StudRules.getPlayer(gvs.state, gvs.state.winnerId) : null;
      const canDeal = orchestrator.canDealNextHand();
      const resultLine = gvs.state.rainedOut
        ? "Rained out! The pot carries forward to the next hand."
        : winner
        ? `${winner.name} won the hand.`
        : "Hand over.";
      el.actionPanel.innerHTML = `
        <div>${resultLine}</div>
        ${canDeal ? `<button id="deal-next-hand-btn">Deal next hand</button>` : `<div>You're out of chips for this hand. Buy more chips or cash out to continue.</div>`}
      `;
      return;
    }
    if (gvs.pending && gvs.pending.kind === "buy3") {
      el.actionPanel.innerHTML = `
        <div>You were dealt a 3 — buy it for $3 to keep it wild and stay in, or fold.</div>
        <button data-buy-yes>Buy the 3 ($3)</button>
        <button data-buy-no>Fold</button>
      `;
      return;
    }
    if (gvs.pending && gvs.pending.kind === "buy9") {
      el.actionPanel.innerHTML = `
        <div>You were dealt a 9 — buy it for $2 to make it wild? (optional)</div>
        <button data-buy-yes>Buy the 9 ($2)</button>
        <button data-buy-no>Leave it plain</button>
      `;
      return;
    }
    if (gvs.pending && gvs.pending.kind === "buy4") {
      el.actionPanel.innerHTML = `
        <div>You were dealt a 4 — buy a bonus card for $1? (optional)</div>
        <button data-buy-yes>Buy bonus card ($1)</button>
        <button data-buy-no>Pass</button>
      `;
      return;
    }
    if (gvs.pending && (gvs.pending.kind === "enterprisePile" || gvs.pending.kind === "enterprisePileAfterWipe")) {
      const pile = gvs.state.enterprisePile;
      const buyButtons = pile
        .map((c, i) => {
          const priceDollars = StudRules.currentEnterprisePriceDollars(gvs.state, i);
          return `<button data-enterprise-buy="${i}">Buy ${Deck.cardLabel(c)} (${money(priceDollars)})</button>`;
        })
        .join("");
      const wipeButton = gvs.pending.kind === "enterprisePile" ? `<button data-enterprise-wipe>Wipe the pile (free)</button>` : "";
      el.actionPanel.innerHTML = `
        <div>Buy a card from the Enterprise pile, ${gvs.pending.kind === "enterprisePile" ? "wipe it for a fresh 3, " : ""}or take a free card face down.</div>
        ${buyButtons}
        ${wipeButton}
        <button data-enterprise-free>Take a free card (face down)</button>
      `;
      return;
    }
    if (gvs.state.bettingRound && StudRules.getCurrentBettor(gvs.state) === human.id) {
      const br = gvs.state.bettingRound;
      const toCallDollars = ChipEconomy.chipsToDollars(br.currentBetChips - br.committed[human.id]);
      const maxRaise = StudRules.maxRaiseDollars(gvs.state, human.id);
      el.actionPanel.innerHTML = `
        <div>Betting round — to call: ${money(toCallDollars)}</div>
        <button data-bet-fold>Fold</button>
        <button data-bet-call>${toCallDollars > 0 ? `Call ${money(toCallDollars)}` : "Check"}</button>
        ${maxRaise > 0 ? `<button data-bet-raise="${settings.raiseIncrementDollars}">Raise +${money(settings.raiseIncrementDollars)}</button>` : ""}
      `;
      return;
    }
    el.actionPanel.innerHTML = `<div>Dealing...</div>`;
  }

  function wireActions(el, orchestrator) {
    el.humanHand.onclick = null;
    el.actionPanel.onclick = (e) => {
      if (e.target.id === "deal-first-hand-btn") return orchestrator.startFirstHand();
      if (e.target.id === "deal-next-hand-btn") return orchestrator.dealNextHand();
      if (e.target.hasAttribute("data-buy-yes")) return orchestrator.humanResolveBuy(true);
      if (e.target.hasAttribute("data-buy-no")) return orchestrator.humanResolveBuy(false);
      if (e.target.hasAttribute("data-enterprise-buy")) return orchestrator.humanResolveEnterprise("buy", Number(e.target.getAttribute("data-enterprise-buy")));
      if (e.target.hasAttribute("data-enterprise-wipe")) return orchestrator.humanResolveEnterprise("wipe");
      if (e.target.hasAttribute("data-enterprise-free")) return orchestrator.humanResolveEnterprise("free");
      if (e.target.hasAttribute("data-bet-fold")) return orchestrator.humanBet("fold");
      if (e.target.hasAttribute("data-bet-call")) return orchestrator.humanBet("call");
      if (e.target.hasAttribute("data-bet-raise")) return orchestrator.humanBet("raise", Number(e.target.getAttribute("data-bet-raise")));
    };
  }

  return { renderSeats, renderBoard, renderHumanHand, renderActionPanel, wireActions };
})();

"use strict";

// Table-view rendering for the community-stud engine (Cincinnati, Criss
// Cross). No per-seat "showing hand" the way stud has -- hole cards stay
// private the whole hand -- so seats just show a face-down hand and chip
// stack; the interesting board state is the shared community-card layout
// in the middle, plus the human's own hole cards below.
const TableUICommunityStud = (function () {
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
    const currentBettorId = gvs.state && gvs.state.bettingRound ? CommunityStudRules.getCurrentBettor(gvs.state) : null;
    const peekAi = debugMode && gvs.state;
    // Hole cards stay private the whole hand, but once the hand is
    // complete every non-folded player's hand is turned face up -- same
    // showdown-reveal convention rules-anaconda.js/rules-draw-poker.js's
    // own table-ui files already use. Reported 2026-08-29 (a live Criss
    // Cross game ended with "no idea what the winning hand was" -- this
    // family previously never revealed hole cards at all, even at
    // showdown). A fold-out win (nobody left to compare against) still
    // just reveals the sole remaining hand, which is harmless.
    const revealed = gvs.state && gvs.state.status === "complete";
    el.seats.innerHTML = gvs.players
      .map((p, i) => {
        const isDealer = i === gvs.dealerIndex;
        const isTurn = p.id === currentBettorId;
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
        if (showPeek && gvs.state && !revealed && !p.folded) {
          const showing = CommunityStudRules.evaluateBestHand(gvs.state, p);
          debugLine = `<div class="seat-debug">AI reasons from: ${HandEvaluator.describe(showing)}</div>`;
        }
        const cardsMarkup =
          gvs.state && !p.folded
            ? revealed
              ? CommunityStudRules.holeCards(gvs.state, p).map((c) => cardMarkup(c, false)).join("")
              : Array.from({ length: p.hand.length }).map(() => cardMarkup(null, true)).join("")
            : "";
        return `
          <div class="seat ${p.folded ? "seat-folded" : ""} ${isTurn ? "seat-active" : ""}">
            ${quipMarkup}
            ${avatarMarkup}
            <div class="seat-name">${isDealer ? "🎲 " : ""}${p.name}${profileBadge}</div>
            <div class="seat-chips">${money(ChipEconomy.chipsToDollars(p.wallet.chips))}</div>
            <div class="seat-cards">
              ${cardsMarkup}
            </div>
            ${debugLine}
            ${p.folded ? '<div class="seat-status">Folded</div>' : ""}
          </div>
        `;
      })
      .join("");
  }

  function renderCommunityLayout(gvs) {
    const cards = gvs.state.communityCards.map((c) => (c.revealed ? cardMarkup(c, false) : cardMarkup(null, true)));
    if (gvs.state.gameConfig.arms) {
      // Cross layout: top / left-center-right / bottom.
      return `
        <div class="community-cross">
          <div class="cross-row">${cards[0]}</div>
          <div class="cross-row">${cards[1]}${cards[2]}${cards[3]}</div>
          <div class="cross-row">${cards[4]}</div>
        </div>
      `;
    }
    return `<div class="community-row">${cards.join("")}</div>`;
  }

  function renderBoard(el, gvs) {
    if (!gvs.state) {
      el.boardHand.innerHTML = "";
      return;
    }
    el.boardHand.innerHTML = `
      <div><strong>Pot:</strong> ${money(ChipEconomy.chipsToDollars(gvs.state.pot))}</div>
      ${renderCommunityLayout(gvs)}
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
      const nameFor = (id) => CommunityStudRules.getPlayer(gvs.state, id).name;
      const handFor = (id) => HandEvaluator.describe(CommunityStudRules.evaluateBestHand(gvs.state, CommunityStudRules.getPlayer(gvs.state, id)));
      let resultLine = "Hand over.";
      if (gvs.state.lowWinnerIds && gvs.state.lowWinnerIds.length) {
        resultLine = `High: ${gvs.state.highWinnerIds.map((id) => `${nameFor(id)} (${handFor(id)})`).join(", ")}. Low: ${gvs.state.lowWinnerIds
          .map((id) => nameFor(id))
          .join(", ")}.`;
      } else if (gvs.state.highWinnerIds && gvs.state.highWinnerIds.length) {
        resultLine = `${gvs.state.highWinnerIds.map((id) => nameFor(id)).join(", ")} won with ${handFor(gvs.state.highWinnerIds[0])} — no qualifying low.`;
      } else if (gvs.state.winnerId) {
        // A genuine multi-player showdown names the winning hand; a
        // fold-out win (nobody left to compare against) has nothing
        // meaningful to describe, so it just names the winner.
        const isShowdown = gvs.players.filter((p) => !p.folded).length > 1;
        resultLine = isShowdown ? `${nameFor(gvs.state.winnerId)} won with ${handFor(gvs.state.winnerId)}.` : `${nameFor(gvs.state.winnerId)} won the hand.`;
      }
      el.actionPanel.innerHTML = `
        <div>${resultLine}</div>
        ${canDeal ? `<button id="deal-next-hand-btn">Deal next hand</button>` : `<div>You're out of chips for this hand. Buy more chips or cash out to continue.</div>`}
      `;
      return;
    }
    if (gvs.state.bettingRound && CommunityStudRules.getCurrentBettor(gvs.state) === human.id) {
      const br = gvs.state.bettingRound;
      const toCallDollars = ChipEconomy.chipsToDollars(br.currentBetChips - br.committed[human.id]);
      const maxRaise = CommunityStudRules.maxRaiseDollars(gvs.state, human.id);
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
      if (e.target.hasAttribute("data-bet-fold")) return orchestrator.humanBet("fold");
      if (e.target.hasAttribute("data-bet-call")) return orchestrator.humanBet("call");
      if (e.target.hasAttribute("data-bet-raise")) return orchestrator.humanBet("raise", Number(e.target.getAttribute("data-bet-raise")));
    };
  }

  return { renderSeats, renderBoard, renderHumanHand, renderActionPanel, wireActions };
})();

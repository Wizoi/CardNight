"use strict";

// Table-view rendering for the shared PressYourLuckRules engine (5.5-21,
// 7-27). The action panel shows a fold/call/raise betting prompt whenever
// a betting round is open, alongside the existing hit/stand and buy-back
// prompts (see rules-press-your-luck.js's bettingEnabled config).
const TableUIPressYourLuck = (function () {
  function cardMarkup(card, faceDown) {
    if (faceDown) return `<div class="card card-back"></div>`;
    const red = card.suit === "H" || card.suit === "D";
    return `<div class="card ${red ? "card-red" : "card-black"}">${Deck.cardLabel(card)}</div>`;
  }

  function money(dollars) {
    return `$${dollars.toFixed(2)}`;
  }

  function formatTarget(n) {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function renderSeats(el, gvs, debugMode, activeQuip) {
    const revealed = gvs.state && gvs.state.status === "complete";
    const currentBettorId = gvs.state && gvs.state.bettingRound ? PressYourLuckRules.getCurrentBettor(gvs.state) : null;
    const peekAi = debugMode && gvs.state;
    el.seats.innerHTML = gvs.players
      .map((p) => {
        const isTurn = (gvs.pending && gvs.pending.playerId === p.id) || p.id === currentBettorId;
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
          const cfg = gvs.state.gameConfig;
          const low = PressYourLuckRules.handSumResult(gvs.state, p, cfg.lowTarget);
          const high = PressYourLuckRules.handSumResult(gvs.state, p, cfg.highTarget);
          debugLine = `<div class="seat-debug">AI's actual hand: low ${low.busted ? "busted" : low.value}, high ${high.busted ? "busted" : high.value}</div>`;
        }
        const cards =
          gvs.state && !p.folded ? p.hand.map((c) => cardMarkup(c, revealed ? false : !c.faceUp)).join("") : "";
        return `
          <div class="seat ${p.folded ? "seat-folded" : ""} ${isTurn ? "seat-active" : ""}">
            ${quipMarkup}
            ${avatarMarkup}
            <div class="seat-name">${p.name}${profileBadge}</div>
            <div class="seat-chips">${money(ChipEconomy.chipsToDollars(p.wallet.chips))}</div>
            <div class="seat-cards">${cards}</div>
            ${debugLine}
            ${gvs.state && p.folded ? '<div class="seat-status">Folded</div>' : ""}
            ${gvs.state && p.standing && !p.folded && gvs.state.status !== "complete" ? '<div class="seat-status">Standing</div>' : ""}
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
    const cfg = gvs.state.gameConfig;
    let resultLine = "";
    if (gvs.state.results) {
      if (gvs.state.results.kitchenSink) {
        resultLine = `<div><strong>Kitchen Sink!</strong> ${gvs.state.results.winnerIds.map((id) => PressYourLuckRules.getPlayer(gvs.state, id).name).join(", ")} take the whole pot.</div>`;
      } else {
        const lowNames = gvs.state.results.lowWinners.map((id) => PressYourLuckRules.getPlayer(gvs.state, id).name);
        const highNames = gvs.state.results.highWinners.map((id) => PressYourLuckRules.getPlayer(gvs.state, id).name);
        resultLine = `
          <div><strong>Low (${formatTarget(cfg.lowTarget)}):</strong> ${lowNames.length ? lowNames.join(", ") : "no qualifiers"}</div>
          <div><strong>High (${formatTarget(cfg.highTarget)}):</strong> ${highNames.length ? highNames.join(", ") : "no qualifiers"}</div>
        `;
      }
    }
    el.boardHand.innerHTML = `
      <div><strong>Targets:</strong> ${formatTarget(cfg.lowTarget)} (low) / ${formatTarget(cfg.highTarget)} (high)</div>
      <div><strong>Pot:</strong> ${money(ChipEconomy.chipsToDollars(gvs.state.pot))}</div>
      ${resultLine}
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
      el.actionPanel.innerHTML = `
        <div>Hand over.</div>
        ${canDeal ? `<button id="deal-next-hand-btn">Deal next hand</button>` : `<div>You're out of chips for this hand. Buy more chips or cash out to continue.</div>`}
      `;
      return;
    }
    const cfg = gvs.state.gameConfig;
    if (gvs.pending && gvs.pending.kind === "bet" && gvs.pending.playerId === humanId) {
      const br = gvs.state.bettingRound;
      const toCallDollars = ChipEconomy.chipsToDollars(br.currentBetChips - br.committed[human.id]);
      const maxRaise = PressYourLuckRules.maxRaiseDollars(gvs.state, human.id);
      el.actionPanel.innerHTML = `
        <div>Betting round — to call: ${money(toCallDollars)}</div>
        <button data-bet-fold>Fold</button>
        <button data-bet-call>${toCallDollars > 0 ? `Call ${money(toCallDollars)}` : "Check"}</button>
        ${maxRaise > 0 ? `<button data-bet-raise="${settings.raiseIncrementDollars}">Raise +${money(settings.raiseIncrementDollars)}</button>` : ""}
      `;
      return;
    }
    if (gvs.pending && gvs.pending.kind === "initialBuyback" && gvs.pending.playerId === humanId) {
      const priceDollars = cfg.buyBack.priceScheduleDollars[human.buyBacksUsed];
      el.actionPanel.innerHTML = `
        <div>Buy back your up-card for ${money(priceDollars)} — replaced, hidden again? (optional)</div>
        <button data-buyback-yes>Buy it back (${money(priceDollars)})</button>
        <button data-buyback-no>Keep it</button>
      `;
      return;
    }
    if (gvs.pending && gvs.pending.kind === "buyBack" && gvs.pending.playerId === humanId) {
      const priceDollars = cfg.buyBack.priceScheduleDollars[human.buyBacksUsed];
      el.actionPanel.innerHTML = `
        <div>Buy back that card for ${money(priceDollars)} — replaced, hidden again? (optional)</div>
        <button data-buyback-yes>Buy it back (${money(priceDollars)})</button>
        <button data-buyback-no>Keep it</button>
      `;
      return;
    }
    if (gvs.pending && gvs.pending.kind === "hitOrStand" && gvs.pending.playerId === humanId) {
      const low = PressYourLuckRules.handSumResult(gvs.state, human, cfg.lowTarget);
      const high = PressYourLuckRules.handSumResult(gvs.state, human, cfg.highTarget);
      const lowText = low.busted ? "busted" : `${low.value} (${low.distance.toFixed(1)} from ${formatTarget(cfg.lowTarget)})`;
      const highText = high.busted ? "busted" : `${high.value} (${high.distance.toFixed(1)} from ${formatTarget(cfg.highTarget)})`;
      el.actionPanel.innerHTML = `
        <div>Your best low: ${lowText}. Your best high: ${highText}.</div>
        <button data-hit>Take a card</button>
        <button data-stand>Stand</button>
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
      if (e.target.hasAttribute("data-hit")) return orchestrator.humanHitOrStand("hit");
      if (e.target.hasAttribute("data-stand")) return orchestrator.humanHitOrStand("stand");
      if (e.target.hasAttribute("data-buyback-yes")) {
        return orchestrator.humanInitialBuyback ? tryBoth(orchestrator, true) : null;
      }
      if (e.target.hasAttribute("data-buyback-no")) {
        return tryBoth(orchestrator, false);
      }
      if (e.target.hasAttribute("data-bet-fold")) return orchestrator.humanBet("fold");
      if (e.target.hasAttribute("data-bet-call")) return orchestrator.humanBet("call");
      if (e.target.hasAttribute("data-bet-raise")) return orchestrator.humanBet("raise", Number(e.target.getAttribute("data-bet-raise")));
    };
  }

  // Both the initial-buyback and mid-loop-buyback prompts render the same
  // buttons; whichever pending kind is actually active determines which
  // orchestrator method is the real no-op vs. the live one (the other
  // silently no-ops on a pending-kind mismatch, same guard every other
  // family's humanX functions already use).
  function tryBoth(orchestrator, willBuy) {
    orchestrator.humanInitialBuyback(willBuy);
    orchestrator.humanBuyBack(willBuy);
  }

  return { renderSeats, renderBoard, renderHumanHand, renderActionPanel, wireActions };
})();

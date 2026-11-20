"use strict";

// Table-view rendering for 3-33. The action panel alternates between the
// usual betting prompt and a "reveal next card" button (or the Ultima/
// outright-win/showdown result once the hand ends).
const TableUI333 = (function () {
  function cardMarkup(card, faceDown) {
    if (faceDown) return `<div class="card card-back"></div>`;
    const red = card.suit === "H" || card.suit === "D";
    return `<div class="card ${red ? "card-red" : "card-black"}">${Deck.cardFaceHtml(card)}</div>`;
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
        // At showdown every contender's actual low/high value is worth
        // showing regardless of debug mode -- reported directly: cards are
        // shown face up but nothing ever states what they actually summed
        // to, so there's no way to verify a stated win/split.
        let valueLine = "";
        if (revealed && !p.folded && p.hand.length > 0) {
          const low = Rules333.handSumResult(gvs.state, p, Rules333.LOW_TARGET);
          const high = Rules333.handSumResult(gvs.state, p, Rules333.HIGH_TARGET);
          valueLine = `<div class="seat-debug">Low: ${low.value} (Δ${low.distance}) &middot; High: ${high.value} (Δ${high.distance})</div>`;
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
            ${valueLine}
            ${p.folded ? '<div class="seat-status">Folded</div>' : gvs.state && p.hand.length === 0 && gvs.state.status !== "complete" ? '<div class="seat-status">Emptied hand!</div>' : ""}
            ${outright ? '<div class="seat-status">Outright winner!</div>' : ""}
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
      let resultLine = "Hand over.";
      if (gvs.state.outrightWinnerIds) {
        const names = gvs.state.outrightWinnerIds.map((id) => Rules333.getPlayer(gvs.state, id).name).join(", ");
        resultLine = `${names} win${gvs.state.outrightWinnerIds.length > 1 ? "" : "s"} the pot outright (Ultima!).`;
      } else if (gvs.state.results) {
        const { lowWinners, highWinners, lowResults, highResults } = gvs.state.results;
        const lowVal = lowResults.find((r) => r.id === lowWinners[0]);
        const highVal = highResults.find((r) => r.id === highWinners[0]);
        const lowTxt = lowWinners.length
          ? `${lowWinners.map((id) => Rules333.getPlayer(gvs.state, id).name).join(", ")} win${lowWinners.length > 1 ? "" : "s"} low with ${lowVal.result.value}`
          : "Nobody qualified for low";
        const highTxt = highWinners.length
          ? `${highWinners.map((id) => Rules333.getPlayer(gvs.state, id).name).join(", ")} win${highWinners.length > 1 ? "" : "s"} high with ${highVal.result.value}`
          : "Nobody qualified for high";
        resultLine = `${lowTxt}. ${highTxt}.`;
      }
      el.actionPanel.innerHTML = `
        <div>${resultLine}</div>
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

  return { renderSeats, renderHumanHand, renderActionPanel, wireActions };
})();

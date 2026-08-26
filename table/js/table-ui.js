"use strict";

// Shell: setup, roster picker, cut-for-deal reveal, game-picker menu,
// header/history/regulars, and dispatch to whichever per-game-family module
// (table-ui-midnight-baseball.js / table-ui-stud.js) renders the actual
// table contents for whatever TableNight.orchestrator is currently active.
// Re-renders content on every update rather than diffing — simplest correct
// approach, same as before. View *navigation* (which section is visible) is
// deliberately kept separate from content rendering: render() always
// refreshes content regardless of which view is showing (so a background
// AI action doesn't yank the player out of the History view), and only
// explicit user actions (or the auto-pick timer) call showView().
(function () {
  const el = {};
  let debugMode = false;
  let lastViewState = null;
  let historyReturnView = "table"; // where "Back" from History goes -- wherever it was opened from
  const SETUP_PREFS_KEY = "cardnight.table.setupPrefs.v1";
  const SEAT_ASSIGNMENTS_KEY = "cardnight.table.seatAssignments.v1";
  const MAX_AI_SEATS = 7; // 8-player table has 7 AI seats, the most any table size needs

  // seatAssignments[i] is the tablePersonId chosen for AI seat i (0-based: seat
  // i corresponds to game seat i+1), or null for "random at deal time."
  let seatAssignments = new Array(MAX_AI_SEATS).fill(null);
  let rosterPickingSeatIndex = null;
  let rosterFilters = { archetypeId: "", pronouns: "", search: "" };

  const QUIP_DISPLAY_MS = 4200;
  let activeQuip = null;
  let lastShownQuipId = 0;
  let autoPickTimer = null;
  let cutForDealAutoTimer = null;

  function loadSetupPrefs() {
    try {
      const raw = localStorage.getItem(SETUP_PREFS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.error("Failed to read saved setup preferences", err);
      return null;
    }
  }

  function saveSetupPrefs(prefs) {
    localStorage.setItem(SETUP_PREFS_KEY, JSON.stringify(prefs));
  }

  function loadSeatAssignments() {
    try {
      const raw = localStorage.getItem(SEAT_ASSIGNMENTS_KEY);
      const arr = raw ? JSON.parse(raw) : null;
      if (Array.isArray(arr)) {
        seatAssignments = new Array(MAX_AI_SEATS).fill(null).map((_, i) => arr[i] || null);
      }
    } catch (err) {
      console.error("Failed to read saved seat assignments", err);
    }
  }

  function saveSeatAssignments() {
    localStorage.setItem(SEAT_ASSIGNMENTS_KEY, JSON.stringify(seatAssignments));
  }

  function cacheEls() {
    el.debugToggle = document.getElementById("debug-toggle");
    el.setupView = document.getElementById("setup-view");
    el.tableView = document.getElementById("table-view");
    el.historyView = document.getElementById("history-view");
    el.cutForDealView = document.getElementById("cutfordeal-view");
    el.pickerView = document.getElementById("picker-view");

    el.setupName = document.getElementById("setup-name");
    el.setupSeats = document.getElementById("setup-seats");
    el.setupAiProfiles = document.getElementById("setup-ai-profiles");
    el.setupBuyIn = document.getElementById("setup-buyin");
    el.setupCap = document.getElementById("setup-cap");
    el.setupStart = document.getElementById("setup-start");

    el.rosterModal = document.getElementById("roster-modal");
    el.rosterModalTitle = document.getElementById("roster-modal-title");
    el.rosterArchetypeFilter = document.getElementById("roster-archetype-filter");
    el.rosterPronounFilter = document.getElementById("roster-pronoun-filter");
    el.rosterSearch = document.getElementById("roster-search");
    el.rosterCount = document.getElementById("roster-count");
    el.rosterGrid = document.getElementById("roster-grid");
    el.rosterCloseBtn = document.getElementById("roster-close-btn");

    el.gameNameDisplay = document.getElementById("game-name-display");
    el.rulesLink = document.getElementById("rules-link");
    el.gameScriptDetails = document.getElementById("game-script-details");
    el.gameScriptSummary = document.getElementById("game-script-summary");
    el.gameScriptBody = document.getElementById("game-script-body");
    el.potDisplay = document.getElementById("pot-display");
    el.walletDisplay = document.getElementById("wallet-display");
    el.rebuyBtn = document.getElementById("rebuy-btn");
    el.cashoutBtn = document.getElementById("cashout-btn");
    el.historyBtn = document.getElementById("history-btn");
    el.changeGameBtn = document.getElementById("change-game-btn");
    el.testJumpSelect = document.getElementById("test-jump-select");
    el.testJumpSelect.innerHTML =
      `<option value="">Jump to...</option>` + GameRegistry.list().map((g) => `<option value="${g.id}">${g.name}</option>`).join("");

    el.seats = document.getElementById("seats");
    el.boardHand = document.getElementById("board-hand");
    el.humanHand = document.getElementById("human-hand");
    el.actionPanel = document.getElementById("action-panel");
    el.logFeed = document.getElementById("log-feed");

    el.historyList = document.getElementById("history-list");
    el.regularsList = document.getElementById("regulars-list");
    el.exportHistoryBtn = document.getElementById("export-history-btn");
    el.backToTableBtn = document.getElementById("back-to-table-btn");
    el.setupHistoryBtn = document.getElementById("setup-history-btn");

    el.cutForDealDraws = document.getElementById("cutfordeal-draws");
    el.cutForDealWinner = document.getElementById("cutfordeal-winner");
    el.cutForDealContinueBtn = document.getElementById("cutfordeal-continue-btn");

    el.pickerHeading = document.getElementById("picker-heading");
    el.pickerMenu = document.getElementById("picker-menu");
  }

  let currentView = "setup";
  function showView(name) {
    // A pending AI auto-pick timer is only valid while still on the picker
    // screen -- if something else (the picker menu, "Jump to game") already
    // chose a game and left this view, the stale timer must not fire later
    // and silently stomp that choice with an unrelated random pick.
    if (name !== "picker" && autoPickTimer) {
      clearTimeout(autoPickTimer);
      autoPickTimer = null;
    }
    currentView = name;
    el.setupView.hidden = name !== "setup";
    el.tableView.hidden = name !== "table";
    el.historyView.hidden = name !== "history";
    el.cutForDealView.hidden = name !== "cutfordeal";
    el.pickerView.hidden = name !== "picker";
  }

  function playStyleBadge(archetypeId) {
    const profileName = TablePeople.profileFor(archetypeId);
    return `<span class="play-style-badge play-style-${profileName}">Plays: ${AIProfiles.profileFor(profileName).label}</span>`;
  }

  function renderSetupSeats(seatCount) {
    const rows = [];
    for (let i = 1; i < seatCount; i++) {
      const seatIndex = i - 1;
      const personId = seatAssignments[seatIndex];
      const person = personId ? TablePeople.getById(personId) : null;
      rows.push(`
        <div class="seat-picker-row">
          <span class="seat-picker-label">Seat ${i + 1}</span>
          ${
            person
              ? `
                <div class="seat-picker-chosen">
                  ${Avatar.render(person.avatar, 40)}
                  <div class="seat-picker-info">
                    <div class="seat-picker-name">${person.name} <span class="pronoun-tag">${person.pronouns}</span></div>
                    <div class="seat-picker-oneliner">${person.archetypeLabel} — ${person.oneLiner}</div>
                    ${playStyleBadge(person.archetypeId)}
                  </div>
                </div>
              `
              : `<div class="seat-picker-chosen seat-picker-random">Random — assigned when you sit down</div>`
          }
          <div class="seat-picker-actions">
            <button type="button" data-choose-seat="${seatIndex}">${person ? "Change" : "Choose"}</button>
            <button type="button" class="dice-btn" data-randomize-seat="${seatIndex}" title="Randomize this seat">🎲</button>
          </div>
        </div>
      `);
    }
    el.setupAiProfiles.innerHTML = rows.join("");
  }

  function renderRosterGrid() {
    const allMatches = TablePeople.filter(rosterFilters);
    const takenElsewhere = new Set(seatAssignments.filter((id, i) => id && i !== rosterPickingSeatIndex));
    const available = allMatches.filter((p) => !takenElsewhere.has(p.id));
    const taken = allMatches.filter((p) => takenElsewhere.has(p.id));
    const ordered = available.concat(taken);

    el.rosterCount.textContent = `${available.length} of ${allMatches.length} shown available (${taken.length} already seated)`;

    el.rosterGrid.innerHTML = ordered
      .map((p) => {
        const disabled = takenElsewhere.has(p.id);
        return `
          <button type="button" class="roster-card" data-pick-person="${p.id}" ${disabled ? "disabled" : ""}>
            ${Avatar.render(p.avatar, 56)}
            <div class="roster-card-name">${p.name} <span class="pronoun-tag">${p.pronouns}</span></div>
            <div class="roster-card-archetype">${p.archetypeLabel}</div>
            ${playStyleBadge(p.archetypeId)}
            <div class="roster-card-oneliner">${p.oneLiner}</div>
            ${disabled ? '<div class="roster-card-taken">Already seated</div>' : ""}
          </button>
        `;
      })
      .join("");
    if (!ordered.length) el.rosterGrid.innerHTML = `<div>No one matches those filters.</div>`;
  }

  function populateRosterFilterOptions() {
    const options = TablePeople.archetypeList()
      .map((a) => `<option value="${a.id}">${a.label}</option>`)
      .join("");
    el.rosterArchetypeFilter.innerHTML = `<option value="">Any archetype</option>${options}`;
  }

  function nextUnfilledSeatIndex(afterIndex) {
    const seatCount = Number(el.setupSeats.value);
    for (let i = afterIndex + 1; i < seatCount - 1; i++) {
      if (!seatAssignments[i]) return i;
    }
    return null;
  }

  function openRosterModal(seatIndex) {
    rosterPickingSeatIndex = seatIndex;
    el.rosterModalTitle.textContent = `Choose a player — Seat ${seatIndex + 2}`;
    el.rosterArchetypeFilter.value = rosterFilters.archetypeId;
    el.rosterPronounFilter.value = rosterFilters.pronouns;
    el.rosterSearch.value = rosterFilters.search;
    renderRosterGrid();
    el.rosterModal.hidden = false;
    el.rosterSearch.focus();
  }

  function closeRosterModal() {
    el.rosterModal.hidden = true;
    rosterPickingSeatIndex = null;
  }

  function money(dollars) {
    return `$${dollars.toFixed(2)}`;
  }

  const LOW_CHIPS_DOLLARS = 5; // "about to run out" threshold for showing the rebuy button

  function familyModuleFor(gameId) {
    const entry = GameRegistry.get(gameId);
    if (!entry) return TableUIMidnightBaseball;
    if (entry.uiFamily === "stud") return TableUIStud;
    if (entry.uiFamily === "mexicanSweat") return TableUIMexicanSweat;
    if (entry.uiFamily === "communityStud") return TableUICommunityStud;
    if (entry.uiFamily === "guts") return TableUIGuts;
    if (entry.uiFamily === "guts357") return TableUIGuts357;
    if (entry.uiFamily === "holdem") return TableUIHoldem;
    if (entry.uiFamily === "pressYourLuck") return TableUIPressYourLuck;
    if (entry.uiFamily === "threeThirtyThree") return TableUI333;
    if (entry.uiFamily === "aceyDucey") return TableUIAceyDucey;
    if (entry.uiFamily === "blindMansBluff") return TableUIBlindMansBluff;
    if (entry.uiFamily === "gameOfLife") return TableUIGameOfLife;
    if (entry.uiFamily === "drawPoker") return TableUIDrawPoker;
    if (entry.uiFamily === "anaconda") return TableUIAnaconda;
    return TableUIMidnightBaseball;
  }

  // Maps table/'s per-game registry ids to app/'s rules-page ids, so the
  // in-game "Rules" link can open the matching detail view in the other
  // (independent, no-shared-code) app. The four hold'em variants all share
  // ONE combined app/ entry (matching games.md's single combined heading),
  // unlike every other game here which gets its own.
  const RULES_PAGE_ID_BY_GAME = {
    midnightBaseball: "midnight-baseball",
    daytimeBaseball: "daytime-baseball",
    rainyDayBaseball: "rainy-day-baseball",
    freeEnterprise: "free-enterprise",
    followTheQueen: "follow-the-queen",
    sevenAndWhatMakesIt: "seven-and-what-makes-it",
    goodBadUgly: "good-bad-ugly",
    mexicanSweat: "mexican-sweat",
    cincinnati: "cincinnati",
    crissCross: "criss-cross",
    deepOrDoubleScrew: "deep-or-double-screw",
    threeBuyFive: "3-buy-5-5-buy-5",
    fourTwoTwo: "four-two-two",
    threeFiveSeven: "3-5-7-guts",
    omaha: "omaha-seattle-boise-jersey-holdem",
    seattle: "omaha-seattle-boise-jersey-holdem",
    boise: "omaha-seattle-boise-jersey-holdem",
    jerseyHoldem: "omaha-seattle-boise-jersey-holdem",
    fiveFiveTwentyOne: "5-5-21",
    sevenTwentySeven: "7-27",
    threeThirtyThree: "3-33",
    aceyDucey: "acey-ducey",
    blindMansBluff: "blind-mans-bluff",
    gameOfLife: "game-of-life",
    pairOfJacksTripsToWin: "pair-of-jacks-trips-to-win",
    anaconda: "anaconda",
  };

  // Looks up the matching app/games-data.js entry (icon, category, the
  // dealer's-read-aloud `script`) for a table/ game id, via the same
  // id-mapping the "Rules" link already uses -- app/ and table/ share no
  // code, but games-data.js is just a plain data file, loaded the same
  // deliberate-exception way the Rules link already reaches into app/.
  function gameDataFor(tableGameId) {
    const appId = RULES_PAGE_ID_BY_GAME[tableGameId];
    if (!appId || typeof GAMES === "undefined") return null;
    return GAMES.find((g) => g.id === appId) || null;
  }

  function renderGameBanner(vs) {
    const entry = GameRegistry.get(vs.activeGameId);
    el.gameNameDisplay.textContent = entry ? entry.name : "";
    const rulesId = RULES_PAGE_ID_BY_GAME[vs.activeGameId];
    if (rulesId) {
      el.rulesLink.href = `../app/index.html#/game/${rulesId}`;
      el.rulesLink.hidden = false;
    } else {
      el.rulesLink.hidden = true;
    }

    const data = entry ? gameDataFor(vs.activeGameId) : null;
    if (data) {
      el.gameScriptSummary.innerHTML = `<span class="game-script-icon">${data.icon}</span> How to describe ${data.name}`;
      // Every entry's `script` is a plain string EXCEPT the combined
      // Omaha/Seattle/Boise/Jersey Hold'em entry, whose one games-data.js
      // record covers 4 variants at once -- there it's an array of
      // {label, text} instead, one per variant (plus a hi-lo add-on).
      if (Array.isArray(data.script)) {
        el.gameScriptBody.innerHTML = data.script
          .map((part) => `<p><strong>${part.label}:</strong> ${part.text}</p>`)
          .join("");
      } else {
        el.gameScriptBody.textContent = data.script || "No dealer script written for this game yet.";
      }
      el.gameScriptDetails.hidden = false;
    } else {
      el.gameScriptDetails.hidden = true;
    }
  }

  function renderHeader(vs) {
    renderGameBanner(vs);
    const human = vs.players.find((p) => p.id === vs.humanId);
    el.walletDisplay.textContent = `Chips: ${money(ChipEconomy.chipsToDollars(human.wallet.chips))} | Bought in: ${money(ChipEconomy.totalBoughtInDollars(human.wallet))}`;
    const gvs = vs.orchestratorViewState;
    el.potDisplay.textContent = gvs && gvs.state ? `Pot: ${money(ChipEconomy.chipsToDollars(gvs.state.pot))}` : "";
    const rebuyRoom = human.wallet.isTracked ? vs.settings.rebuyCapDollars - ChipEconomy.totalRebuysDollars(human.wallet) : 0;
    el.rebuyBtn.disabled = rebuyRoom < ChipEconomy.BUY_IN_INCREMENT_DOLLARS;
    el.rebuyBtn.hidden = ChipEconomy.chipsToDollars(human.wallet.chips) > LOW_CHIPS_DOLLARS;
    // Only between hands -- switching games mid-hand would abandon the
    // outgoing orchestrator's still-running async turn loop (AI actions on
    // a sleep-based delay) rather than cleanly stopping it, letting a
    // stale hand-completion race with the new game.
    const canSwitchGames = !gvs || !gvs.state || gvs.state.status === "complete";
    el.changeGameBtn.disabled = !canSwitchGames;
    // The testing jump is exempt from that guard on purpose -- it's a debug
    // shortcut, not the in-fiction "Change game" flow, so jumping mid-hand is
    // allowed and just abandons/resets whatever hand was in progress (the
    // outgoing orchestrator's async loop naturally stops itself at its next
    // human-decision checkpoint once nothing is left to call back into it).
    el.testJumpSelect.disabled = false;
    el.testJumpSelect.value = "";
  }

  function renderLog(gvs) {
    if (!gvs || !gvs.state) {
      el.logFeed.innerHTML = "";
      return;
    }
    el.logFeed.innerHTML = gvs.state.log
      .slice(-30)
      .map((line) => `<div class="log-line">${line}</div>`)
      .join("");
    el.logFeed.scrollTop = el.logFeed.scrollHeight;
  }

  function renderHistory(vs) {
    if (!vs.history.days.length) {
      el.historyList.innerHTML = `<div>No history yet.</div>`;
      return;
    }
    el.historyList.innerHTML = `
      <table>
        <thead><tr><th>Date</th><th>Bought in</th><th>Cash out / current</th><th>Net</th><th>Hands</th></tr></thead>
        <tbody>
          ${vs.history.days
            .map((d) => {
              const boughtIn = d.initialBuyInDollars + d.rebuys.reduce((s, r) => s + r.dollars, 0);
              const cashLabel = d.cashedOutDollars != null ? money(d.cashedOutDollars) : `${money(d.currentChipsDollars)} (in progress)`;
              const netClass = d.net > 0 ? "net-positive" : d.net < 0 ? "net-negative" : "";
              return `<tr><td>${d.date}</td><td>${money(boughtIn)}</td><td>${cashLabel}</td><td class="${netClass}">${money(d.net)}</td><td>${d.handsPlayed}</td></tr>`;
            })
            .join("")}
        </tbody>
      </table>
    `;
  }

  function renderRegulars(vs) {
    const regulars = HistoryStore.regularsSummary(vs.history);
    if (!regulars.length) {
      el.regularsList.innerHTML = `<div>No opponents recorded yet.</div>`;
      return;
    }
    el.regularsList.innerHTML = `
      <table>
        <thead><tr><th>Name</th><th>Archetype</th><th>Sessions</th><th>Hands won</th><th>Net</th><th>Last played</th></tr></thead>
        <tbody>
          ${regulars
            .map((r) => {
              const netClass = r.netDollars > 0 ? "net-positive" : r.netDollars < 0 ? "net-negative" : "";
              return `<tr><td>${r.name}</td><td>${r.archetypeLabel}</td><td>${r.sessionsPlayed}</td><td>${r.handsWon}</td><td class="${netClass}">${money(r.netDollars)}</td><td>${r.lastPlayedDate}</td></tr>`;
            })
            .join("")}
        </tbody>
      </table>
    `;
  }

  // Each seat has its own card in a shared fan, face down until revealed --
  // the human clicks their own to flip it; AI seats reveal on their own
  // pace (see maybeAutoRevealCutForDeal). A tie redeals a fresh fan of just
  // the tied seats, flagged with a small notice above the fan.
  function renderCutForDeal(vs) {
    const state = vs.cutForDealState;
    const round = state.currentRound;
    const tieNotice =
      state.tieBreakInProgress && state.status !== "complete"
        ? `<div class="cutfordeal-tie-notice">Tied — cutting again among: ${round.map((e) => vs.players.find((p) => p.id === e.seatId).name).join(", ")}</div>`
        : "";
    el.cutForDealDraws.innerHTML = `
      ${tieNotice}
      <div class="cutfordeal-fan">
        ${round
          .map((entry) => {
            const player = vs.players.find((p) => p.id === entry.seatId);
            let cardMarkup;
            if (entry.revealed) {
              const red = entry.card.suit === "H" || entry.card.suit === "D";
              cardMarkup = `<div class="card ${red ? "card-red" : "card-black"}">${Deck.cardLabel(entry.card)}</div>`;
            } else if (player.isHuman && state.status !== "complete") {
              cardMarkup = `<div class="card card-back cutfordeal-clickable" data-cutfordeal-seat="${entry.seatId}"></div>`;
            } else {
              cardMarkup = `<div class="card card-back"></div>`;
            }
            return `
              <div class="cutfordeal-seat">
                <div class="cutfordeal-seat-name">${player.name}${player.isHuman ? " (you)" : ""}</div>
                ${cardMarkup}
              </div>
            `;
          })
          .join("")}
      </div>
    `;
    if (state.status === "complete") {
      const winner = vs.players.find((p) => p.id === state.winnerSeatId);
      el.cutForDealWinner.innerHTML = `<strong>${winner.name}</strong> has the high card and picks the first game!`;
      el.cutForDealContinueBtn.hidden = false;
    } else {
      el.cutForDealWinner.innerHTML = "";
      el.cutForDealContinueBtn.hidden = true;
    }
  }

  // AI seats reveal their own card on a steady pace regardless of whether
  // the human's clicked yet; once only the human is left in the current
  // round, this just stops and waits for their click.
  function maybeAutoRevealCutForDeal(vs) {
    if (cutForDealAutoTimer) return;
    const nextAI = vs.cutForDealState.currentRound.find((e) => !e.revealed && e.seatId !== vs.humanId);
    if (!nextAI) return;
    cutForDealAutoTimer = setTimeout(() => {
      cutForDealAutoTimer = null;
      TableNight.revealCutForDealSeat(nextAI.seatId);
    }, 600);
  }

  function renderPicker(vs) {
    const pickerSeatId = vs.seatOrder[vs.currentPickerSeatIndex];
    const picker = vs.players.find((p) => p.id === pickerSeatId);
    if (picker.isHuman) {
      el.pickerHeading.textContent = "Pick the next game";
      el.pickerMenu.innerHTML = vs.gameList
        .map((g) => {
          const data = gameDataFor(g.id);
          const icon = data ? data.icon : "🎴";
          const category = data ? data.category : "";
          return `
            <button type="button" class="game-pick-card" data-pick-game="${g.id}">
              <span class="game-pick-icon">${icon}</span>
              <span class="game-pick-name">${g.name}</span>
              ${category ? `<span class="game-pick-category">${category}</span>` : ""}
            </button>
          `;
        })
        .join("");
    } else {
      el.pickerHeading.textContent = `${picker.name} is picking the next game...`;
      el.pickerMenu.innerHTML = `<div class="picker-waiting">Waiting for ${picker.name} to choose&hellip;</div>`;
    }
  }

  // Gated on actually being on the picker screen -- not just on the data
  // state being ready for it. Cut-for-deal resolving and the picker screen
  // being VISITED are two different moments now that the reveal is
  // interactive (the player might still be looking at the cut-for-deal
  // winner announcement, not yet having clicked "Continue"); starting this
  // timer the instant the data was ready (the old, pre-interactive
  // behavior) could silently auto-pick and yank the view to the table
  // before the player ever saw the picker screen at all.
  function maybeAutoPickForAI() {
    if (currentView !== "picker" || TableNight.currentPickerIsHuman() || autoPickTimer) return;
    autoPickTimer = setTimeout(() => {
      autoPickTimer = null;
      TableNight.autoPickForAI();
      showView("table");
    }, 900);
  }

  // Always refreshes content, regardless of which view is currently
  // showing — a background AI action shouldn't yank the player out of the
  // History view. Actual view *navigation* only happens at explicit action
  // sites (button clicks, the auto-pick timer), never here.
  function render(vs) {
    lastViewState = vs;
    renderHeader(vs);

    const gvs = vs.orchestratorViewState;
    if (gvs) {
      if (gvs.lastQuip && gvs.lastQuip.id !== lastShownQuipId) {
        lastShownQuipId = gvs.lastQuip.id;
        activeQuip = { playerId: gvs.lastQuip.playerId, text: gvs.lastQuip.text, expiresAt: Date.now() + QUIP_DISPLAY_MS };
        setTimeout(() => {
          if (lastViewState) render(lastViewState);
        }, QUIP_DISPLAY_MS + 50);
      }
      const familyModule = familyModuleFor(vs.activeGameId);
      familyModule.wireActions(el, TableNight.orchestrator);
      familyModule.renderSeats(el, gvs, debugMode, activeQuip);
      familyModule.renderBoard(el, gvs);
      familyModule.renderHumanHand(el, gvs, vs.humanId);
      familyModule.renderActionPanel(el, gvs, vs.humanId, TableNight.orchestrator, vs.settings);
      renderLog(gvs);
    }

    if (vs.cutForDealState) {
      renderCutForDeal(vs);
      if (vs.cutForDealState.status === "revealing") {
        maybeAutoRevealCutForDeal(vs);
      } else if (!vs.activeGameId) {
        renderPicker(vs);
        maybeAutoPickForAI();
      }
    }

    renderHistory(vs);
    renderRegulars(vs);
  }

  function wireEvents() {
    el.debugToggle.addEventListener("change", () => {
      debugMode = el.debugToggle.checked;
      if (lastViewState) render(lastViewState);
    });

    const savedPrefs = loadSetupPrefs();
    if (savedPrefs) {
      if (savedPrefs.humanName) el.setupName.value = savedPrefs.humanName;
      if (savedPrefs.seatCount) el.setupSeats.value = String(savedPrefs.seatCount);
      if (savedPrefs.buyInDollars) el.setupBuyIn.value = String(savedPrefs.buyInDollars);
      if (savedPrefs.rebuyCapDollars != null) el.setupCap.value = String(savedPrefs.rebuyCapDollars);
    }
    loadSeatAssignments();
    populateRosterFilterOptions();

    el.setupSeats.addEventListener("change", () => renderSetupSeats(Number(el.setupSeats.value)));
    renderSetupSeats(Number(el.setupSeats.value));

    el.setupAiProfiles.addEventListener("click", (e) => {
      const chooseBtn = e.target.closest("[data-choose-seat]");
      if (chooseBtn) return openRosterModal(Number(chooseBtn.dataset.chooseSeat));
      const diceBtn = e.target.closest("[data-randomize-seat]");
      if (diceBtn) {
        const seatIndex = Number(diceBtn.dataset.randomizeSeat);
        const takenElsewhere = seatAssignments.filter((id, i) => id && i !== seatIndex);
        seatAssignments[seatIndex] = TablePeople.randomUnused(takenElsewhere).id;
        saveSeatAssignments();
        renderSetupSeats(Number(el.setupSeats.value));
      }
    });

    el.rosterCloseBtn.addEventListener("click", closeRosterModal);
    el.rosterModal.addEventListener("click", (e) => {
      if (e.target === el.rosterModal) closeRosterModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !el.rosterModal.hidden) closeRosterModal();
    });
    el.rosterArchetypeFilter.addEventListener("change", () => {
      rosterFilters.archetypeId = el.rosterArchetypeFilter.value;
      renderRosterGrid();
    });
    el.rosterPronounFilter.addEventListener("change", () => {
      rosterFilters.pronouns = el.rosterPronounFilter.value;
      renderRosterGrid();
    });
    el.rosterSearch.addEventListener("input", () => {
      rosterFilters.search = el.rosterSearch.value;
      renderRosterGrid();
    });
    el.rosterGrid.addEventListener("click", (e) => {
      const card = e.target.closest("[data-pick-person]");
      if (!card || card.disabled) return;
      const filledSeatIndex = rosterPickingSeatIndex;
      seatAssignments[filledSeatIndex] = card.dataset.pickPerson;
      saveSeatAssignments();
      renderSetupSeats(Number(el.setupSeats.value));
      const nextSeat = nextUnfilledSeatIndex(filledSeatIndex);
      if (nextSeat != null) openRosterModal(nextSeat);
      else closeRosterModal();
    });

    el.setupStart.addEventListener("click", () => {
      const seatCount = Number(el.setupSeats.value);
      const humanName = el.setupName.value.trim() || "You";
      const buyInDollars = Number(el.setupBuyIn.value) || 20;
      const rebuyCapDollars = Number(el.setupCap.value) || 60;
      saveSetupPrefs({ humanName, seatCount, buyInDollars, rebuyCapDollars });
      TableNight.init(
        { humanName, seatCount, aiSeatAssignments: seatAssignments, buyInDollars, rebuyCapDollars },
        render
      );
      TableNight.beginCutForDeal();
      showView("cutfordeal");
    });

    el.cutForDealDraws.addEventListener("click", (e) => {
      const card = e.target.closest("[data-cutfordeal-seat]");
      if (!card) return;
      TableNight.revealCutForDealSeat(card.dataset.cutfordealSeat);
    });

    el.cutForDealContinueBtn.addEventListener("click", () => {
      showView("picker");
      render(TableNight.getViewState());
    });

    el.pickerMenu.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-pick-game]");
      if (!btn) return;
      TableNight.chooseNextGame(btn.dataset.pickGame);
      showView("table");
    });

    el.changeGameBtn.addEventListener("click", () => {
      TableNight.rotatePickerAfterGameEnds();
      showView("picker");
      render(TableNight.getViewState());
    });

    // Testing shortcut: jump straight into any registered game, bypassing
    // the picker/rotation ceremony entirely -- for trying games out, not
    // part of the normal in-fiction flow. Same between-hands guard as
    // "Change game" (the select is disabled otherwise), for the same
    // stale-async-loop reason.
    el.testJumpSelect.addEventListener("change", () => {
      const gameId = el.testJumpSelect.value;
      if (!gameId) return;
      TableNight.chooseNextGame(gameId);
      showView("table");
    });

    el.historyBtn.addEventListener("click", () => {
      historyReturnView = "table";
      showView("history");
    });
    el.setupHistoryBtn.addEventListener("click", () => {
      historyReturnView = "setup";
      showView("history");
      const history = TableNight.peekHistory();
      renderHistory({ history });
      renderRegulars({ history });
    });
    el.backToTableBtn.addEventListener("click", () => showView(historyReturnView));
    el.exportHistoryBtn.addEventListener("click", () => TableNight.exportHistory());

    el.rebuyBtn.addEventListener("click", () => {
      const amount = ChipEconomy.BUY_IN_INCREMENT_DOLLARS;
      if (!TableNight.canRebuy(amount)) {
        alert(`That would exceed tonight's rebuy cap.`);
        return;
      }
      TableNight.rebuy(amount);
    });
    el.cashoutBtn.addEventListener("click", () => {
      if (confirm("Cash out and leave the table? This ends tonight's sitting — you can start a new one anytime.")) {
        TableNight.cashOut();
        showView("setup");
      }
    });
  }

  cacheEls();
  wireEvents();
  showView("setup");
})();

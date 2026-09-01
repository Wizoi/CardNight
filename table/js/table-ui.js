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
  const MIN_AI_SEATS = 4; // games.md's house rule: table size is 5-8 players, including the human

  // seatAssignments[i] is the tablePersonId chosen for AI seat i (0-based: seat
  // i corresponds to game seat i+1). Every currently-visible seat (index <
  // activeAiSeatCount) always has a real assignment, filled in immediately
  // (see ensureSeatFilled) -- there's no more "random at deal time" state to
  // show on screen, per the user's request to drop that noise.
  let seatAssignments = new Array(MAX_AI_SEATS).fill(null);
  let activeAiSeatCount = 5; // 6 players total by default, matching the old dropdown's first option
  let rosterPickingSeatIndex = null;
  let rosterFilters = { archetypeId: "", pronouns: "", search: "" };

  const QUIP_DISPLAY_MS = 4200;
  let activeQuip = null;
  let lastShownQuipId = 0;
  let autoPickTimer = null;
  let cutForDealAutoTimer = null;
  // Human-picker variant-choice step: set while showing the "choose variants
  // for X" form instead of the game grid; null the rest of the time.
  let pendingVariantGameId = null;
  // Set once a game (+ variants) has actually been chosen -- by an AI
  // picker, or by the human via the grid/variant-form -- but the human
  // hasn't clicked "Continue" past the game-selected/instructions screen
  // yet. chooseNextGame() itself doesn't run until that click, so
  // activeGameId stays unset the whole time this is set -- see
  // maybeAutoPickForAI/renderPicker and the picker-menu click handler.
  let pendingConfirm = null;

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

    el.resumeBanner = document.getElementById("resume-banner");
    el.resumeNightBtn = document.getElementById("resume-night-btn");
    el.discardSavedNightBtn = document.getElementById("discard-saved-night-btn");

    el.setupName = document.getElementById("setup-name");
    el.setupSeatBoxes = document.getElementById("setup-seat-boxes");
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

    el.gameIconDisplay = document.getElementById("game-icon-display");
    el.gameNameDisplay = document.getElementById("game-name-display");
    el.rulesLink = document.getElementById("rules-link");
    el.gameScriptDetails = document.getElementById("game-script-details");
    el.gameScriptToggleBtn = document.getElementById("game-script-toggle-btn");
    el.gameScriptBody = document.getElementById("game-script-body");
    el.gameScriptVariants = document.getElementById("game-script-variants");
    el.potDisplay = document.getElementById("pot-display");
    el.walletDisplay = document.getElementById("wallet-display");
    el.rebuyBtn = document.getElementById("rebuy-btn");
    el.cashoutBtn = document.getElementById("cashout-btn");
    el.historyBtn = document.getElementById("history-btn");
    el.changeGameBtn = document.getElementById("change-game-btn");
    el.moreMenuBtn = document.getElementById("more-menu-btn");
    el.moreMenu = document.getElementById("more-menu");

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
    // A variant-choice form or AI-pick summary left mid-flow (e.g. "Jump to
    // game" interrupting the real picker ceremony) shouldn't linger and
    // resurface stale the next time the picker screen shows.
    if (name !== "picker") {
      pendingVariantGameId = null;
      pendingConfirm = null;
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
    const temperamentClass = TablePeople.temperamentClassFor(archetypeId);
    return `<span class="play-style-badge play-style-${temperamentClass}">Plays: ${AIProfiles.profileFor(profileName).label}</span>`;
  }

  // Every visible seat always shows a real person immediately -- no more
  // "random at deal time" placeholder state. Called whenever a seat becomes
  // visible with nothing assigned yet (initial load, or a freshly added "+"
  // seat) so there's never a gap to render.
  function ensureSeatFilled(seatIndex) {
    if (seatAssignments[seatIndex]) return;
    const takenElsewhere = seatAssignments.filter((id, i) => id && i !== seatIndex);
    seatAssignments[seatIndex] = TablePeople.randomUnused(takenElsewhere).id;
  }

  function renderSetupSeats() {
    for (let i = 0; i < activeAiSeatCount; i++) ensureSeatFilled(i);
    saveSeatAssignments();

    const boxes = [];
    for (let i = 0; i < activeAiSeatCount; i++) {
      const person = TablePeople.getById(seatAssignments[i]);
      const canRemove = activeAiSeatCount > MIN_AI_SEATS;
      boxes.push(`
        <div class="seat-box" data-choose-seat="${i}" title="${person.name} — ${person.archetypeLabel}. Click to choose someone else.">
          ${canRemove ? `<button type="button" class="seat-box-remove" data-remove-seat="${i}" title="Remove this seat">×</button>` : ""}
          ${Avatar.render(person.avatar, 40)}
          <div class="seat-box-name">${person.name}</div>
        </div>
      `);
    }
    if (activeAiSeatCount < MAX_AI_SEATS) {
      boxes.push(`
        <button type="button" class="seat-box seat-box-add" data-add-seat title="Add a seat">+</button>
      `);
    }
    el.setupSeatBoxes.innerHTML = boxes.join("");
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

  // The four hold'em variants' one combined games-data.js entry needs a
  // reverse lookup (table game id -> which of its script array entries is
  // actually THIS game) -- RULES_PAGE_ID_BY_GAME above only maps forward
  // (every one of the 4 ids -> the same shared app id).
  const HOLDEM_VARIANT_SCRIPT_LABEL_BY_GAME = {
    omaha: "Omaha",
    seattle: "Seattle",
    boise: "Boise",
    jerseyHoldem: "Jersey Hold'em",
  };

  // Every entry's `script` is a plain string EXCEPT the combined
  // Omaha/Seattle/Boise/Jersey Hold'em entry, whose one games-data.js
  // record covers 4 variants at once -- there it's an array of
  // {label, text} instead, one per variant (plus a hi-lo add-on). Shown in
  // full, this dumped every OTHER hold'em variant's instructions into the
  // box too regardless of which one was actually being played (reported
  // directly: "didn't want all the Texas Hold'em games... definitely saw
  // it there") -- now filtered down to just the matching variant's own
  // part, plus the always-relevant hi-lo add-on note. Shared by the
  // in-game "how to describe it" box and the game-selected transition
  // screen so both render dealer-script text identically.
  function scriptHtml(data, tableGameId) {
    if (!data) return "";
    if (Array.isArray(data.script)) {
      const wantedLabel = HOLDEM_VARIANT_SCRIPT_LABEL_BY_GAME[tableGameId];
      const parts = wantedLabel ? data.script.filter((part) => part.label === wantedLabel || part.label === "If hi-lo is on, add") : data.script;
      return parts.map((part) => `<p><strong>${part.label}:</strong> ${part.text}</p>`).join("");
    }
    return `<p>${data.script || "No dealer script written for this game yet."}</p>`;
  }

  // Collapsed by default, toggled open by clicking the "i" button next to
  // the game name (2026-08-29 -- previously always-expanded, deliberately
  // left undecided at the time). Reset to collapsed the moment the active
  // game actually changes, so a new game doesn't inherit the last one's
  // open/closed state.
  let gameScriptExpanded = false;
  let lastBannerGameId = undefined;

  // Reads the CURRENTLY ACTIVE value for one variantOptions key, for
  // whatever hand is live right now -- most families merge dealer's-choice
  // variantChoices straight into state.gameConfig (applyVariants), so
  // state.gameConfig[key] is authoritative there; the 3 families with no
  // gameConfig object of their own (Anaconda, Game of Life, Pair of Jacks
  // draw poker) expose the raw variantChoices object directly instead (see
  // each session-*.js's getViewState).
  function activeVariantValue(gvs, key) {
    if (gvs.state && gvs.state.gameConfig && key in gvs.state.gameConfig) return gvs.state.gameConfig[key];
    if (gvs.variantChoices) return gvs.variantChoices[key];
    return undefined;
  }

  // Populates the in-game info box's "what's actually in play this hand"
  // section (2026-08-31, per the user's request that variant choices not
  // just be silently "known" -- the game-selected transition screen
  // already surfaces them via variantSummaryLines; this reuses the same
  // describeVariantChoice lookup against the LIVE hand's resolved values
  // instead of a picker-time choice).
  function renderGameScriptVariants(entry, gvs) {
    if (!entry || !entry.variantOptions || !entry.variantOptions.length || !gvs || !gvs.state) {
      el.gameScriptVariants.innerHTML = "";
      return;
    }
    const lines = entry.variantOptions.map((opt) => `<div><strong>${opt.label}:</strong> ${describeVariantChoice(opt, activeVariantValue(gvs, opt.key))}</div>`);
    el.gameScriptVariants.innerHTML = lines.join("");
  }

  function renderGameBanner(vs) {
    const entry = GameRegistry.get(vs.activeGameId);
    el.gameNameDisplay.textContent = entry ? entry.name : "";
    if (vs.activeGameId !== lastBannerGameId) {
      lastBannerGameId = vs.activeGameId;
      gameScriptExpanded = false;
    }
    const rulesId = RULES_PAGE_ID_BY_GAME[vs.activeGameId];
    if (rulesId) {
      el.rulesLink.href = `../app/index.html#/game/${rulesId}`;
      el.rulesLink.hidden = false;
    } else {
      el.rulesLink.hidden = true;
    }

    const data = entry ? gameDataFor(vs.activeGameId) : null;
    el.gameIconDisplay.textContent = data ? data.icon : "";
    el.gameScriptToggleBtn.hidden = !data;
    if (data) {
      el.gameScriptBody.innerHTML = scriptHtml(data, vs.activeGameId);
    }
    renderGameScriptVariants(entry, vs.orchestratorViewState);
    el.gameScriptToggleBtn.setAttribute("aria-expanded", String(gameScriptExpanded));
    el.gameScriptDetails.hidden = !data || !gameScriptExpanded;
  }

  function renderHeader(vs) {
    renderGameBanner(vs);
    const human = vs.players.find((p) => p.id === vs.humanId);
    // "Bought in" dropped from the always-visible header as part of the
    // 2026-08-29 redesign (still fully tracked in History) -- the compact
    // chips-block only has room for the one figure that matters turn to
    // turn.
    el.walletDisplay.textContent = `Chips: ${money(ChipEconomy.chipsToDollars(human.wallet.chips))}`;
    const gvs = vs.orchestratorViewState;
    // Once a hand's complete, several games zero out state.pot right after
    // payout (it's been awarded, not vanished) -- potAtShowdown, where a game
    // tracks it, is what was actually won/carried. Games that never zero the
    // pot at completion (stud, community stud, Mexican Sweat, Midnight
    // Baseball, Acey Ducey) don't set this field, so this falls back to the
    // always-accurate live state.pot for them.
    const potChips = gvs && gvs.state && gvs.state.status === "complete" && typeof gvs.state.potAtShowdown === "number" ? gvs.state.potAtShowdown : gvs && gvs.state ? gvs.state.pot : null;
    // The "Pot" label now lives in its own #pot-hero-label element, so this
    // is just the dollar figure -- avoids "Pot: Pot $4.50" once stacked.
    el.potDisplay.textContent = potChips != null ? money(ChipEconomy.chipsToDollars(potChips)) : "—";
    const rebuyRoom = human.wallet.isTracked ? vs.settings.rebuyCapDollars - ChipEconomy.totalRebuysDollars(human.wallet) : 0;
    el.rebuyBtn.disabled = rebuyRoom < ChipEconomy.BUY_IN_INCREMENT_DOLLARS;
    el.rebuyBtn.hidden = ChipEconomy.chipsToDollars(human.wallet.chips) > LOW_CHIPS_DOLLARS;
    // Only between hands -- switching games mid-hand would abandon the
    // outgoing orchestrator's still-running async turn loop (AI actions on
    // a sleep-based delay) rather than cleanly stopping it, letting a
    // stale hand-completion race with the new game.
    const canSwitchGames = !gvs || !gvs.state || gvs.state.status === "complete";
    el.changeGameBtn.disabled = !canSwitchGames;
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

  // One shared, anonymous fan of face-down cards -- nobody knows in advance
  // which position holds which card, so picking one is a genuine choice
  // (2026-08-29 redesign, at the user's request: the old layout pre-bound
  // each face-down card to a specific seat's name before it was ever
  // clicked, which read as trusting a secret pre-assignment rather than an
  // actual cut). The human can claim any open slot whenever they like; AI
  // seats claim a random remaining slot on their own pace, in random order
  // (see maybeAutoRevealCutForDeal) -- not turn-by-turn by seat. Results
  // (who drew what) populate a list below the fan as each seat claims a
  // slot. A tie redeals a fresh anonymous fan to just the tied seats,
  // flagged with a small notice above it.
  function renderCutForDeal(vs) {
    const state = vs.cutForDealState;
    const round = state.currentRound;
    const eligiblePlayers = state.eligibleSeatIds.map((seatId) => vs.players.find((p) => p.id === seatId));
    const humanAlreadyClaimed = round.some((e) => e.seatId === vs.humanId);
    const tieNotice =
      state.tieBreakInProgress && state.status !== "complete"
        ? `<div class="cutfordeal-tie-notice">Tied — cutting again among: ${eligiblePlayers.map((p) => p.name).join(", ")}</div>`
        : "";
    const fanMarkup = round
      .map((entry) => {
        if (entry.revealed) {
          const red = entry.card.suit === "H" || entry.card.suit === "D";
          return `<div class="card ${red ? "card-red" : "card-black"}">${Deck.cardLabel(entry.card)}</div>`;
        }
        if (state.status !== "complete" && !humanAlreadyClaimed) {
          return `<div class="card card-back cutfordeal-clickable" data-cutfordeal-slot="${entry.slotIndex}"></div>`;
        }
        return `<div class="card card-back"></div>`;
      })
      .join("");
    const resultsMarkup = eligiblePlayers
      .map((player) => {
        const entry = round.find((e) => e.seatId === player.id);
        const drawn = entry ? `<div class="card ${entry.card.suit === "H" || entry.card.suit === "D" ? "card-red" : "card-black"}">${Deck.cardLabel(entry.card)}</div>` : `<div class="cutfordeal-waiting">…</div>`;
        return `
          <div class="cutfordeal-result-row">
            <div class="cutfordeal-seat-name">${player.name}${player.isHuman ? " (you)" : ""}</div>
            ${drawn}
          </div>
        `;
      })
      .join("");
    el.cutForDealDraws.innerHTML = `
      ${tieNotice}
      <div class="cutfordeal-fan">${fanMarkup}</div>
      <div class="cutfordeal-results">${resultsMarkup}</div>
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

  // AI seats claim a random remaining slot on a steady pace regardless of
  // whether the human's claimed theirs yet, in random order rather than a
  // fixed seat sequence; once only the human is left with a slot still to
  // claim, this just stops and waits for their click.
  function maybeAutoRevealCutForDeal(vs) {
    if (cutForDealAutoTimer) return;
    const state = vs.cutForDealState;
    const claimedSeatIds = new Set(state.currentRound.filter((e) => e.seatId != null).map((e) => e.seatId));
    const waitingAiSeatIds = state.eligibleSeatIds.filter((seatId) => seatId !== vs.humanId && !claimedSeatIds.has(seatId));
    if (!waitingAiSeatIds.length) return;
    const nextSeatId = waitingAiSeatIds[Math.floor(Math.random() * waitingAiSeatIds.length)];
    cutForDealAutoTimer = setTimeout(() => {
      cutForDealAutoTimer = null;
      TableNight.autoClaimCutForDealSlot(nextSeatId);
    }, 600);
  }

  function gameCardsMarkup(gameList) {
    return gameList
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
  }

  // Jump mode reuses the exact same card-grid picker as the real in-fiction
  // flow below, just without caring whose turn it actually is to pick --
  // a debug/testing shortcut, usable anytime (including mid-hand, which
  // abandons/resets whatever was in progress), not part of the normal
  // cut-for-deal/rotation ceremony.
  function describeVariantChoice(opt, value) {
    const chosen = opt.choices.find((c) => c.value === value);
    return chosen ? chosen.label : String(value);
  }

  // The variant-choice form for one game -- a radio group per option,
  // pre-selected to that option's default, plus Deal/Back buttons. Shown in
  // place of the game grid once a human picker clicks a game that has
  // variantOptions; a game with none skips straight to chooseNextGame
  // instead (see the picker-menu click handler).
  function variantFormMarkup(entry) {
    const groups = entry.variantOptions
      .map(
        (opt) => `
          <fieldset class="variant-option-group">
            <legend>${opt.label}</legend>
            ${opt.choices
              .map(
                (c, i) => `
                  <label class="variant-choice-label">
                    <input type="radio" name="variant-${opt.key}" value="${i}" ${c.value === opt.default ? "checked" : ""} />
                    ${c.label}
                  </label>
                `
              )
              .join("")}
          </fieldset>
        `
      )
      .join("");
    return `
      <div class="variant-form" data-variant-game="${entry.id}">
        <h3>${entry.name} — dealer's choice</h3>
        ${groups}
        <button type="button" data-deal-with-variants>Deal!</button>
        <button type="button" data-variant-back>&larr; Back</button>
      </div>
    `;
  }

  function readVariantFormChoices(entry) {
    const choices = {};
    for (const opt of entry.variantOptions) {
      const checked = el.pickerMenu.querySelector(`input[name="variant-${opt.key}"]:checked`);
      choices[opt.key] = checked ? opt.choices[Number(checked.value)].value : opt.default;
    }
    return choices;
  }

  function variantSummaryLines(entry, variantChoices) {
    return (entry.variantOptions || []).map((opt) => `${opt.label}: ${describeVariantChoice(opt, variantChoices[opt.key])}`);
  }

  // The transition screen shown once a game (+ variants) is actually
  // decided -- by an AI picker, or by the human finishing the grid/variant
  // flow -- before the table itself appears. Doubles as an instructions
  // screen: the same dealer-script text the in-game info box shows, so a
  // game nobody's played in a while gets a refresher right when it matters
  // instead of only being one click away mid-hand.
  function renderConfirmScreen(entry, variantChoices, isAi) {
    const data = gameDataFor(entry.id);
    const icon = data ? data.icon : "🎴";
    const lines = variantSummaryLines(entry, variantChoices);
    el.pickerHeading.textContent = "Game selected";
    el.pickerMenu.innerHTML = `
      <div class="confirm-screen">
        <div class="game-pick-icon">${icon}</div>
        <div>${isAi ? `The dealer is playing <strong>${entry.name}</strong>.` : `You're playing <strong>${entry.name}</strong>.`}</div>
        ${lines.length ? `<ul class="confirm-variant-lines">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>` : ""}
        <div class="confirm-instructions">${scriptHtml(data, entry.id)}</div>
        <div class="confirm-actions">
          ${isAi ? "" : `<button type="button" data-confirm-back>&larr; Back</button>`}
          <button type="button" data-confirm-continue>Continue</button>
        </div>
      </div>
    `;
  }

  function renderPicker(vs) {
    if (pendingConfirm) {
      renderConfirmScreen(pendingConfirm.entry, pendingConfirm.variantChoices, pendingConfirm.isAi);
      return;
    }

    if (pendingVariantGameId) {
      const entry = GameRegistry.get(pendingVariantGameId);
      el.pickerHeading.textContent = "Pick the next game";
      el.pickerMenu.innerHTML = variantFormMarkup(entry);
      return;
    }

    const picker = vs.players.find((p) => p.id === vs.currentPickerSeatId);
    if (picker.isHuman) {
      el.pickerHeading.textContent = "Pick the next game";
      el.pickerMenu.innerHTML = gameCardsMarkup(vs.gameList);
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
    if (currentView !== "picker" || pendingConfirm || TableNight.currentPickerIsHuman() || autoPickTimer) return;
    autoPickTimer = setTimeout(() => {
      autoPickTimer = null;
      // Stays on the picker screen showing the game-selected/instructions
      // screen until the human clicks "Continue" -- see renderPicker's
      // pendingConfirm branch and the data-confirm-continue handler below.
      const { choice, variantChoices } = TableNight.autoPickForAI();
      pendingConfirm = { entry: choice, variantChoices, isAi: true };
      render(TableNight.getViewState());
    }, 900);
  }

  // In "dealersChoice" mode (the default), a completed hand doesn't just
  // offer to deal another hand of the same game -- the next dealer (the
  // rotated picker) picks fresh, same as clicking "Change game" today.
  // Every table-ui-<family>.js's renderActionPanel uses the same
  // #deal-next-hand-btn id when a next hand CAN be dealt (hand complete,
  // player has chips) -- swap just that button for one that hands off to
  // the picker instead, rather than touching all 14 family files. Left
  // alone in "continuous" mode (the old always-on behavior): pick once,
  // keep dealing the same game via "Deal next hand" until "Change game".
  function maybeSwapForNextDealerPick(el, vs) {
    if (vs.dealMode !== "dealersChoice" && vs.dealMode !== "humanChoice") return;
    // The Guts family's escalating-pot cycle can finish a ROUND (a winner
    // paid, losers charged to match) without the CYCLE itself being over --
    // cycleComplete stays false until exactly one player wins solo. That
    // still renders #deal-next-hand-btn (the correct "keep escalating the
    // SAME game" action), but this function used to swap it for "pick the
    // next game" unconditionally on every button of that id, incorrectly
    // treating an in-progress cycle's own next round as if the whole game
    // were finished. Reported directly: a $3 pot with 3 losers should have
    // continued for a $12 pot in the SAME game, not jumped to picking a
    // different one entirely. cycleComplete is undefined for every other
    // family, so this check is a no-op everywhere else.
    const gvs = vs.orchestratorViewState;
    if (gvs && gvs.state && gvs.state.cycleComplete === false) return;
    const dealBtn = el.actionPanel.querySelector("#deal-next-hand-btn");
    if (!dealBtn) return;
    const label = vs.dealMode === "humanChoice" ? "Pick the next game →" : "Next dealer picks the game →";
    dealBtn.outerHTML = `<button data-pick-next-game>${label}</button>`;
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
      maybeSwapForNextDealerPick(el, vs);
    }

    if (vs.cutForDealState) {
      renderCutForDeal(vs);
    }
    // Picker rendering is deliberately NOT nested under `vs.cutForDealState`
    // -- "My choice" mode skips the whole cut-for-deal ceremony outright
    // (it doesn't apply when the human always picks anyway), so
    // cutForDealState stays null the entire night in that mode, and the
    // picker still needs to render.
    if (vs.cutForDealState && vs.cutForDealState.status === "revealing") {
      maybeAutoRevealCutForDeal(vs);
    } else if (!vs.activeGameId || pendingConfirm) {
      // The `|| pendingConfirm` half keeps the game-selected/instructions
      // screen rendering even after chooseNextGame has already set
      // activeGameId -- it's waiting on the human to click "Continue,"
      // not blocked by the normal "nothing picked yet" gate. (In
      // practice chooseNextGame doesn't run until that click anyway --
      // see the picker-menu click handler -- so activeGameId is still
      // unset here too; this condition is belt-and-suspenders.)
      renderPicker(vs);
      maybeAutoPickForAI();
    }

    renderHistory(vs);
    renderRegulars(vs);
  }

  function wireEvents() {
    el.debugToggle.addEventListener("change", () => {
      debugMode = el.debugToggle.checked;
      if (lastViewState) render(lastViewState);
    });

    el.resumeBanner.hidden = !TableNight.hasSavedSnapshot();
    el.resumeNightBtn.addEventListener("click", () => {
      const saved = TableNight.loadSnapshot();
      if (!saved) {
        el.resumeBanner.hidden = true;
        return;
      }
      TableNight.restore(saved, render);
      const vs = TableNight.getViewState();
      // Same routing a fresh sitting already uses at each of these points
      // (setup-start's cutfordeal, humanChoice mode's picker, etc.) --
      // pick the view that matches wherever this saved night actually left
      // off, based on what actually got restored.
      if (vs.orchestratorViewState || vs.activeGameId) {
        showView("table");
      } else if (vs.cutForDealState) {
        showView(vs.cutForDealState.status === "revealing" ? "cutfordeal" : "picker");
      } else {
        showView("picker");
      }
      render(vs);
    });
    el.discardSavedNightBtn.addEventListener("click", () => {
      TableNight.clearSnapshot();
      el.resumeBanner.hidden = true;
    });

    const savedPrefs = loadSetupPrefs();
    if (savedPrefs) {
      if (savedPrefs.humanName) el.setupName.value = savedPrefs.humanName;
      if (savedPrefs.seatCount) activeAiSeatCount = Math.min(MAX_AI_SEATS, Math.max(MIN_AI_SEATS, savedPrefs.seatCount - 1));
      if (savedPrefs.buyInDollars) el.setupBuyIn.value = String(savedPrefs.buyInDollars);
      if (savedPrefs.rebuyCapDollars != null) el.setupCap.value = String(savedPrefs.rebuyCapDollars);
      if (savedPrefs.dealMode) {
        const radio = document.querySelector(`input[name="deal-mode"][value="${savedPrefs.dealMode}"]`);
        if (radio) radio.checked = true;
      }
    }
    loadSeatAssignments();
    populateRosterFilterOptions();
    renderSetupSeats();

    el.setupSeatBoxes.addEventListener("click", (e) => {
      const removeBtn = e.target.closest("[data-remove-seat]");
      if (removeBtn) {
        const seatIndex = Number(removeBtn.dataset.removeSeat);
        seatAssignments.splice(seatIndex, 1);
        seatAssignments.push(null);
        activeAiSeatCount -= 1;
        renderSetupSeats();
        return;
      }
      const addBtn = e.target.closest("[data-add-seat]");
      if (addBtn) {
        activeAiSeatCount += 1;
        renderSetupSeats();
        return;
      }
      const seatBox = e.target.closest("[data-choose-seat]");
      if (seatBox) openRosterModal(Number(seatBox.dataset.chooseSeat));
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
      seatAssignments[rosterPickingSeatIndex] = card.dataset.pickPerson;
      renderSetupSeats();
      closeRosterModal();
    });

    el.setupStart.addEventListener("click", () => {
      const seatCount = activeAiSeatCount + 1;
      const humanName = el.setupName.value.trim() || "You";
      const buyInDollars = Number(el.setupBuyIn.value) || 20;
      const rebuyCapDollars = Number(el.setupCap.value) || 60;
      const dealModeInput = document.querySelector('input[name="deal-mode"]:checked');
      const dealMode = dealModeInput ? dealModeInput.value : "dealersChoice";
      saveSetupPrefs({ humanName, seatCount, buyInDollars, rebuyCapDollars, dealMode });
      TableNight.init(
        { humanName, seatCount, aiSeatAssignments: seatAssignments, buyInDollars, rebuyCapDollars, dealMode },
        render
      );
      // "My choice" mode means the human always picks anyway, so cut-for-
      // deal's whole purpose (deciding who deals/picks first) doesn't apply
      // -- skip straight to the picker instead of a ceremony whose result
      // wouldn't change anything.
      if (dealMode === "humanChoice") {
        showView("picker");
        render(TableNight.getViewState());
      } else {
        TableNight.beginCutForDeal();
        showView("cutfordeal");
      }
    });

    el.cutForDealDraws.addEventListener("click", (e) => {
      const card = e.target.closest("[data-cutfordeal-slot]");
      if (!card || !lastViewState) return;
      TableNight.claimCutForDealSlot(lastViewState.humanId, Number(card.dataset.cutfordealSlot));
    });

    el.cutForDealContinueBtn.addEventListener("click", () => {
      showView("picker");
      render(TableNight.getViewState());
    });

    el.pickerMenu.addEventListener("click", (e) => {
      const pickBtn = e.target.closest("[data-pick-game]");
      if (pickBtn) {
        const entry = GameRegistry.get(pickBtn.dataset.pickGame);
        if (entry.variantOptions && entry.variantOptions.length) {
          pendingVariantGameId = entry.id;
          render(TableNight.getViewState());
          return;
        }
        // No variants to choose -- straight to the game-selected/
        // instructions screen (chooseNextGame itself waits for Continue,
        // same as the variant-form path below).
        pendingConfirm = { entry, variantChoices: GameRegistry.defaultVariantChoices(entry), isAi: false };
        render(TableNight.getViewState());
        return;
      }

      const dealBtn = e.target.closest("[data-deal-with-variants]");
      if (dealBtn) {
        const entry = GameRegistry.get(pendingVariantGameId);
        const variantChoices = readVariantFormChoices(entry);
        pendingVariantGameId = null;
        pendingConfirm = { entry, variantChoices, isAi: false };
        render(TableNight.getViewState());
        return;
      }

      const backBtn = e.target.closest("[data-variant-back]");
      if (backBtn) {
        pendingVariantGameId = null;
        render(TableNight.getViewState());
        return;
      }

      const confirmBackBtn = e.target.closest("[data-confirm-back]");
      if (confirmBackBtn) {
        pendingConfirm = null;
        render(TableNight.getViewState());
        return;
      }

      const continueBtn = e.target.closest("[data-confirm-continue]");
      if (continueBtn) {
        const { entry, variantChoices } = pendingConfirm;
        TableNight.chooseNextGame(entry.id, variantChoices);
        pendingConfirm = null;
        showView("table");
      }
    });

    el.changeGameBtn.addEventListener("click", () => {
      TableNight.rotatePickerAfterGameEnds();
      showView("picker");
      render(TableNight.getViewState());
    });

    el.gameScriptToggleBtn.addEventListener("click", () => {
      gameScriptExpanded = !gameScriptExpanded;
      el.gameScriptToggleBtn.setAttribute("aria-expanded", String(gameScriptExpanded));
      el.gameScriptDetails.hidden = !gameScriptExpanded;
    });

    // The "⋯" menu tucks the less-common actions (Change game/Cash out/
    // History) out of the always-visible bar. One single delegated
    // listener handles the toggle, closing on an item click, AND closing
    // on an outside click -- deliberately not split across separate
    // listeners with stopPropagation (the previous shape), which reads
    // correct in isolation but is easy to get subtly wrong under real
    // click ordering; one listener with one clear branch order is safer.
    document.addEventListener("click", (e) => {
      if (el.moreMenuBtn.contains(e.target)) {
        const isOpen = !el.moreMenu.hidden;
        el.moreMenu.hidden = isOpen;
        el.moreMenuBtn.setAttribute("aria-expanded", String(!isOpen));
        return;
      }
      if (!el.moreMenu.hidden) {
        el.moreMenu.hidden = true;
        el.moreMenuBtn.setAttribute("aria-expanded", "false");
      }
    });

    // Delegated on the container (not the button itself, which gets
    // replaced every render by maybeSwapForNextDealerPick) so this keeps
    // working across re-renders without being rewired each time. Each
    // family's own wireActions assigns el.actionPanel.onclick directly
    // (an assignment, not addEventListener), so this listener coexists
    // with it rather than being overwritten.
    el.actionPanel.addEventListener("click", (e) => {
      if (!e.target.closest("[data-pick-next-game]")) return;
      TableNight.rotatePickerAfterGameEnds();
      showView("picker");
      render(TableNight.getViewState());
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

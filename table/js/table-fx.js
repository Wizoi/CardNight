"use strict";

// Visual & Audio "Juice" + Pluggable V2 Tabletop Interface layer for CardNight ("Luck of the Deal").
// Hooks into table-ui.js's render cycle via TableFX.enhanceTable(el, vs)
// without touching any rules-*.js or session-*.js state machine.
// Implements all 4 Concept Mockups:
//   - Concept 1: Horseshoe Mahogany & Brass Table Stadium + 4 Lighting Themes
//   - Concept 2: Artisanal Playing Cards, Gold-Foil Wild Shaders, 3D Flips & Curved Hand Fan
//   - Concept 3: Interactive Diegetic Game Boards (Free Enterprise Brass Market Stalls + Wipe Coin,
//     Baseball Chalkboard Scoreboard + Tilted Red Queen Rain-Out Stamp, 7-27/5.5-21/3-33 Twin
//     Brass Analog Dial Gauges with Rotating SVG Needles, 3-5-7 Guts Embossed Gold IN! / Slate OUT
//     Medallions, Acey Ducey Goalposts, Good/Bad/Ugly Pedestals, Game of Life Tracks, etc.)
//   - Concept 4: Sculpted Metallic Persona Frames (Steel Square, Gold Circle, Copper Octagon),
//     Bold Archetype Headers ("THE FORTRESS / Arthur"), Speech Quips & Telemetry Icons.
const TableFX = (function () {
  const THEME_KEY = "cardnight.table.theme.v1";
  const SPEED_KEY = "cardnight.table.aiSpeed.v1";
  const SOUND_KEY = "cardnight.table.soundMuted.v1";
  const LAYOUT_KEY = "cardnight.table.layoutMode.v1";
  const SIZE_KEY = "cardnight.table.uiScale.v1";
  const UI_SCALES = [0.85, 1, 1.15, 1.3, 1.45];

  const THEMES = [
    { id: "basement", label: "Basement Rec Room", icon: "🍺" },
    { id: "classic", label: "Casino Emerald", icon: "♠️" },
    { id: "speakeasy", label: "Smoky Speakeasy", icon: "🥃" },
    { id: "balatro", label: "Arcade CRT Neon", icon: "✨" },
  ];

  const LAYOUT_MODES = [
    { id: "auto", label: "Auto Device" },
    { id: "desktop", label: "Desktop Table" },
    { id: "landscape", label: "Phone Landscape" },
    { id: "portrait", label: "Phone Portrait" },
  ];

  const SPEEDS = [
    { id: "1x", label: "1x Pace", factor: 1 },
    { id: "2x", label: "2x Fast", factor: 0.42 },
    { id: "turbo", label: "Turbo", factor: 0.12 },
  ];

  let currentTheme = localStorage.getItem(THEME_KEY) || "basement";
  let currentSpeed = localStorage.getItem(SPEED_KEY) || "1x";
  let currentLayout = localStorage.getItem(LAYOUT_KEY) || "auto";
  let soundMuted = localStorage.getItem(SOUND_KEY) === "true";
  let currentScale = Number(localStorage.getItem(SIZE_KEY)) || 1;
  if (!UI_SCALES.includes(currentScale)) currentScale = 1;

  // Intercept typical AI pacing delays (350ms - 950ms) when 2x or Turbo speed is selected.
  const nativeSetTimeout = window.setTimeout.bind(window);
  window.setTimeout = function (fn, delay, ...args) {
    if (typeof delay === "number" && delay >= 300 && delay <= 950) {
      const speedObj = SPEEDS.find((s) => s.id === currentSpeed) || SPEEDS[0];
      if (speedObj.factor !== 1) {
        delay = Math.max(40, Math.round(delay * speedObj.factor));
      }
    }
    return nativeSetTimeout(fn, delay, ...args);
  };

  // ---- 1. Procedural Web Audio Synthesizer (Zero External Assets) ----
  const Sound = (function () {
    let ctx = null;
    function getCtx() {
      if (soundMuted) return null;
      if (!ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) ctx = new AudioCtx();
      }
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      return ctx;
    }

    function cardFlip() {
      const ac = getCtx();
      if (!ac) return;
      try {
        const now = ac.currentTime;
        const bufferSize = Math.floor(ac.sampleRate * 0.045);
        const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.32));
        }
        const noise = ac.createBufferSource();
        noise.buffer = buffer;
        const filter = ac.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(1400, now);
        filter.frequency.exponentialRampToValueAtTime(650, now + 0.04);
        filter.Q.value = 1.8;
        const gain = ac.createGain();
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.005, now + 0.045);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ac.destination);
        noise.start(now);
      } catch (e) {}
    }

    function chipClink() {
      const ac = getCtx();
      if (!ac) return;
      try {
        const now = ac.currentTime;
        [2650, 3950].forEach((f, idx) => {
          const osc = ac.createOscillator();
          const gain = ac.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(f + Math.random() * 120, now + idx * 0.018);
          gain.gain.setValueAtTime(0.07, now + idx * 0.018);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.018 + 0.065);
          osc.connect(gain);
          gain.connect(ac.destination);
          osc.start(now + idx * 0.018);
          osc.stop(now + idx * 0.018 + 0.07);
        });
      } catch (e) {}
    }

    function wildChime() {
      const ac = getCtx();
      if (!ac) return;
      try {
        const now = ac.currentTime;
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          const osc = ac.createOscillator();
          const gain = ac.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(f, now + i * 0.045);
          gain.gain.setValueAtTime(0.08, now + i * 0.045);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.045 + 0.28);
          osc.connect(gain);
          gain.connect(ac.destination);
          osc.start(now + i * 0.045);
          osc.stop(now + i * 0.045 + 0.3);
        });
      } catch (e) {}
    }

    function winFanfare() {
      const ac = getCtx();
      if (!ac) return;
      try {
        const now = ac.currentTime;
        [392.0, 493.88, 587.33, 783.99].forEach((f, i) => {
          const osc = ac.createOscillator();
          const gain = ac.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(f, now + i * 0.07);
          gain.gain.setValueAtTime(0.09, now + i * 0.07);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.42);
          osc.connect(gain);
          gain.connect(ac.destination);
          osc.start(now + i * 0.07);
          osc.stop(now + i * 0.07 + 0.45);
        });
      } catch (e) {}
    }

    return { cardFlip, chipClink, wildChime, winFanfare };
  })();

  // ---- 2. 3D SVG Clay Chip Stack Generator ----
  const CHIP_DENOMS = [
    { val: 20, color: "#1f1f24", rim: "#d4af37", stripe: "#f4ecd8" },
    { val: 10, color: "#186a4b", rim: "#e8cd6f", stripe: "#ffffff" },
    { val: 5, color: "#b82921", rim: "#f4ecd8", stripe: "#ffd166" },
    { val: 1, color: "#235789", rim: "#f4ecd8", stripe: "#ffffff" },
    { val: 0.25, color: "#d9cab3", rim: "#7a5230", stripe: "#b82921" },
  ];

  function renderChipStackSvg(dollars, compact) {
    const amount = Math.max(0, Number(dollars) || 0);
    if (amount <= 0) return "";
    let rem = Math.round(amount * 100) / 100;
    const chips = [];
    for (const d of CHIP_DENOMS) {
      while (rem >= d.val - 0.001 && chips.length < (compact ? 6 : 10)) {
        chips.push(d);
        rem = Math.round((rem - d.val) * 100) / 100;
      }
    }
    if (!chips.length) chips.push(CHIP_DENOMS[CHIP_DENOMS.length - 1]);

    const w = compact ? 24 : 34;
    const stepY = compact ? 3.2 : 4.2;
    const baseH = compact ? 11 : 14;
    const totalH = Math.ceil(baseH + (chips.length - 1) * stepY + 4);
    const cx = w / 2;
    const rx = compact ? 9.5 : 13.5;
    const ry = compact ? 4.2 : 5.8;

    const layers = chips
      .map((c, i) => {
        const cy = totalH - 6 - i * stepY;
        return `
          <ellipse cx="${cx}" cy="${cy + 1.6}" rx="${rx}" ry="${ry}" fill="rgba(0,0,0,0.45)" />
          <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${c.color}" stroke="${c.rim}" stroke-width="1.2" />
          <ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.68}" ry="${ry * 0.65}" fill="none" stroke="${c.stripe}" stroke-width="1.1" stroke-dasharray="2.5 2.5" />
        `;
      })
      .join("");

    return `<svg class="chip-stack-svg ${compact ? "chip-stack-compact" : "chip-stack-pot"}" width="${w}" height="${totalH}" viewBox="0 0 ${w} ${totalH}" aria-hidden="true">${layers}</svg>`;
  }

  // Helper to render a V2 artisanal card anywhere on the custom board
  function fxCardHtml(card, faceDown, extraClasses) {
    if (faceDown || !card) {
      return `<div class="card card-back${extraClasses ? " " + extraClasses : ""}"></div>`;
    }
    const red = card.suit === "H" || card.suit === "D";
    const isWild = !!(card.isWild || card.bought || card.rank === "JOKER");
    const wildTag = isWild ? `<span class="wild-tag">W</span>` : "";
    return `<div class="card ${red ? "card-red" : "card-black"}${isWild ? " card-is-wild" : ""}${extraClasses ? " " + extraClasses : ""}">${Deck.cardFaceHtml(card)}${wildTag}</div>`;
  }

  function money(dollars) {
    return `$${Number(dollars || 0).toFixed(2)}`;
  }

  // ---- 3. Diff State Tracking ----
  let prevSnapshot = {
    gameId: null,
    potChips: 0,
    status: null,
    humanUpCount: 0,
    humanCardCount: 0,
    seatUpCounts: {},
    boardCardCount: 0,
  };

  function applyTheme(themeId) {
    currentTheme = themeId;
    localStorage.setItem(THEME_KEY, themeId);
    document.documentElement.setAttribute("data-table-theme", themeId);
  }

  function applyLayoutMode(layoutId) {
    currentLayout = layoutId;
    localStorage.setItem(LAYOUT_KEY, layoutId);
    document.documentElement.setAttribute("data-layout-mode", layoutId);
  }

  function applyUiScale(scaleVal) {
    currentScale = UI_SCALES.includes(scaleVal) ? scaleVal : 1;
    localStorage.setItem(SIZE_KEY, String(currentScale));
    document.documentElement.style.setProperty("--ui-scale", String(currentScale));
    document.documentElement.setAttribute("data-ui-scale", String(currentScale));
    const readout = document.getElementById("fx-size-readout");
    if (readout) {
      readout.textContent = `${Math.round(currentScale * 100)}%`;
    }
    const minusBtn = document.querySelector('[data-fx-size-step="-1"]');
    const plusBtn = document.querySelector('[data-fx-size-step="1"]');
    if (minusBtn) minusBtn.disabled = currentScale <= UI_SCALES[0];
    if (plusBtn) plusBtn.disabled = currentScale >= UI_SCALES[UI_SCALES.length - 1];
  }

  function stepUiScale(delta) {
    const idx = UI_SCALES.indexOf(currentScale);
    const nextIdx = Math.max(0, Math.min(UI_SCALES.length - 1, (idx === -1 ? 1 : idx) + delta));
    applyUiScale(UI_SCALES[nextIdx]);
    Sound.chipClink();
  }

  function applySpeed(speedId) {
    currentSpeed = speedId;
    localStorage.setItem(SPEED_KEY, speedId);
  }

  function toggleSound() {
    soundMuted = !soundMuted;
    localStorage.setItem(SOUND_KEY, String(soundMuted));
    if (!soundMuted) Sound.chipClink();
    return soundMuted;
  }

  function ensureToolbarControls() {
    const statsBar = document.getElementById("game-bar-stats");
    if (!statsBar || document.getElementById("table-fx-controls")) return;

    // On mobile screens, collapse the bottom play-by-play log drawer by default to save vertical space
    const logDrawer = document.getElementById("log-drawer");
    if (logDrawer && typeof window !== "undefined" && window.innerWidth <= 768) {
      logDrawer.open = false;
    }

    const wrap = document.createElement("div");
    wrap.id = "table-fx-controls";
    wrap.className = "fx-toolbar";

    const themeOptions = THEMES.map(
      (t) => `<option value="${t.id}" ${t.id === currentTheme ? "selected" : ""}>${t.icon} ${t.label}</option>`
    ).join("");

    const layoutOptions = LAYOUT_MODES.map(
      (m) => `<option value="${m.id}" ${m.id === currentLayout ? "selected" : ""}>📱 ${m.label}</option>`
    ).join("");

    const speedBtns = SPEEDS.map(
      (s) =>
        `<button type="button" class="fx-speed-btn ${s.id === currentSpeed ? "fx-speed-active" : ""}" data-fx-speed="${s.id}" title="AI Turn Speed: ${s.label}">${s.id.toUpperCase()}</button>`
    ).join("");

    wrap.innerHTML = `
      <select id="fx-theme-select" class="fx-theme-select fx-desktop-only-select" title="Table Vibe & Lighting Theme" aria-label="Table Theme">
        ${themeOptions}
      </select>
      <select id="fx-layout-select" class="fx-theme-select fx-layout-select fx-desktop-only-select" title="Responsive Form Factor (Auto / Desktop / Phone Landscape / Phone Portrait)" aria-label="Layout Mode">
        ${layoutOptions}
      </select>
      <div class="fx-speed-group" role="group" aria-label="AI Turn Speed">
        ${speedBtns}
      </div>
      <button type="button" id="fx-sound-btn" class="fx-icon-btn" title="${soundMuted ? "Unmute Table Sounds" : "Mute Table Sounds"}" aria-label="Toggle Sound">
        ${soundMuted ? "🔇" : "🔊"}
      </button>
    `;

    statsBar.insertBefore(wrap, statsBar.firstChild);

    // Add Card & UI Size (- Size / + Size) and Table Vibe controls inside #more-menu
    const moreMenu = document.getElementById("more-menu");
    if (moreMenu && !moreMenu.querySelector(".fx-menu-settings")) {
      const menuSettings = document.createElement("div");
      menuSettings.className = "fx-menu-settings";
      menuSettings.innerHTML = `
        <div class="fx-menu-setting-lbl">Card &amp; Table Size</div>
        <div class="fx-menu-size-row">
          <button type="button" class="fx-size-btn" data-fx-size-step="-1" title="Decrease card &amp; text size">&minus; Size</button>
          <button type="button" id="fx-size-readout" class="fx-size-readout" data-fx-size-reset title="Tap to reset size to 100%">${Math.round(currentScale * 100)}%</button>
          <button type="button" class="fx-size-btn" data-fx-size-step="1" title="Increase card &amp; text size">+ Size</button>
        </div>
        <label class="fx-menu-setting-lbl">Table Vibe
          <select id="fx-menu-theme-select" class="fx-theme-select">${themeOptions}</select>
        </label>
      `;
      moreMenu.appendChild(menuSettings);
      applyUiScale(currentScale);
      menuSettings.addEventListener("click", (e) => {
        const sizeStepBtn = e.target.closest("[data-fx-size-step]");
        if (sizeStepBtn) {
          stepUiScale(Number(sizeStepBtn.getAttribute("data-fx-size-step")));
          return;
        }
        const resetBtn = e.target.closest("[data-fx-size-reset]");
        if (resetBtn) {
          applyUiScale(1);
          Sound.chipClink();
        }
      });
      const menuThemeSelect = menuSettings.querySelector("#fx-menu-theme-select");
      menuThemeSelect.addEventListener("change", () => {
        applyTheme(menuThemeSelect.value);
        const topSelect = wrap.querySelector("#fx-theme-select");
        if (topSelect) topSelect.value = menuThemeSelect.value;
        Sound.chipClink();
      });
    }

    const themeSelect = wrap.querySelector("#fx-theme-select");
    themeSelect.addEventListener("change", () => {
      applyTheme(themeSelect.value);
      const menuSelect = document.getElementById("fx-menu-theme-select");
      if (menuSelect) menuSelect.value = themeSelect.value;
      Sound.chipClink();
    });

    const layoutSelect = wrap.querySelector("#fx-layout-select");
    layoutSelect.addEventListener("change", () => {
      applyLayoutMode(layoutSelect.value);
      Sound.cardFlip();
    });

    wrap.addEventListener("click", (e) => {
      const speedBtn = e.target.closest("[data-fx-speed]");
      if (speedBtn) {
        applySpeed(speedBtn.dataset.fxSpeed);
        wrap.querySelectorAll(".fx-speed-btn").forEach((b) => b.classList.toggle("fx-speed-active", b === speedBtn));
        Sound.cardFlip();
        return;
      }
      const soundBtn = e.target.closest("#fx-sound-btn");
      if (soundBtn) {
        const muted = toggleSound();
        soundBtn.textContent = muted ? "🔇" : "🔊";
        soundBtn.title = muted ? "Unmute Table Sounds" : "Mute Table Sounds";
      }
    });
  }

  // ---- 4. Live Human Hand Evaluation Pill ----
  function describeHumanHandLive(vs, gvs) {
    if (!gvs || !gvs.state) return "";
    const human = gvs.players.find((p) => p.id === vs.humanId);
    if (!human || !human.hand || !human.hand.length) return "";
    const foldPrefix = human.folded ? `<span class="human-folded-pill">FOLDED</span> &middot; ` : "";

    const gameId = vs.activeGameId;
    try {
      if ((gameId === "fiveFiveTwentyOne" || gameId === "sevenTwentySeven") && typeof PressYourLuckRules !== "undefined") {
        const cfg = gvs.state.gameConfig;
        const low = PressYourLuckRules.handSumResult(gvs.state, human, cfg.lowTarget);
        const high = PressYourLuckRules.handSumResult(gvs.state, human, cfg.highTarget);
        return `${foldPrefix}Low (${cfg.lowTarget}): <strong>${low.busted ? "Busted" : low.value}</strong> &middot; High (${cfg.highTarget}): <strong>${high.busted ? "Busted" : high.value}</strong>`;
      }
      if (gameId === "threeThirtyThree" && typeof Rules333 !== "undefined") {
        const low = Rules333.handSumResult(gvs.state, human, Rules333.LOW_TARGET);
        const high = Rules333.handSumResult(gvs.state, human, Rules333.HIGH_TARGET);
        return `${foldPrefix}Low (3): <strong>${low.value}</strong> &middot; High (33): <strong>${high.value}</strong>`;
      }
      if (gameId === "blindMansBluff") {
        return (gvs.state.status === "complete" || human.folded) && human.hand[0]
          ? `${foldPrefix}Your Forehead Card: <strong>${Deck.cardLabel(human.hand[0])}</strong>`
          : `Forehead Card: <strong>Hidden (?)</strong> — Judge by opponents' cards!`;
      }
      if (gameId === "midnightBaseball" && typeof MidnightBaseball !== "undefined") {
        const showing = MidnightBaseball.evaluateShowingHand(gvs.state, human.id);
        if (showing && showing.category >= 0) {
          return `${foldPrefix}Your Showing Hand: <strong>${HandEvaluator.describe(showing)}</strong>`;
        }
        return human.folded ? `${foldPrefix}Your Hand (Out of Play)` : `Tap face-down cards to flip &amp; beat the board`;
      }
      if (gameId === "mexicanSweat" && typeof MexicanSweatRules !== "undefined") {
        const showing = MexicanSweatRules.evaluateShowingHand(gvs.state, human.id);
        if (showing && showing.category >= 0) {
          return `${foldPrefix}Your Showing Hand: <strong>${HandEvaluator.describe(showing)}</strong>`;
        }
        return human.folded ? `${foldPrefix}Your Hand (Out of Play)` : `Waiting for simultaneous flip...`;
      }
      if (typeof StudRules !== "undefined" && gvs.state.gameConfig && gvs.state.gameConfig.streets) {
        const allEvaluated =
          gvs.state.gameConfig.selfDeterminedWild && typeof HandEvaluator.bestHandWithSumWild === "function"
            ? HandEvaluator.bestHandWithSumWild(
                human.hand,
                gvs.state.gameConfig.selfDeterminedWild.targetSum,
                gvs.state.gameConfig.selfDeterminedWild.rankValue
              )
            : HandEvaluator.evaluatePartial(
                human.hand.map((c) => ({ ...c, isWild: StudRules.isCardWild(gvs.state, c) }))
              );
        if (allEvaluated && allEvaluated.category >= 0) {
          return `${foldPrefix}Your Best Hand: <strong>${HandEvaluator.describe(allEvaluated)}</strong>`;
        }
      }
      if ((gameId === "cincinnati" || gameId === "crissCross") && typeof CommunityStudRules !== "undefined") {
        const best = CommunityStudRules.evaluateBestHand(gvs.state, human);
        if (best && best.category >= 0) return `${foldPrefix}Your Best Hand: <strong>${HandEvaluator.describe(best)}</strong>`;
      }
      if ((gameId === "omaha" || gameId === "seattle" || gameId === "boise" || gameId === "jerseyHoldem") && typeof HoldemRules !== "undefined") {
        const best = HoldemRules.bestHighHand(gvs.state, human);
        if (best && best.category >= 0) return `${foldPrefix}Your Best High: <strong>${HandEvaluator.describe(best)}</strong>`;
        const holeEval = HandEvaluator.evaluatePartial(human.hand);
        return holeEval && holeEval.category >= 0 ? `${foldPrefix}Hole Cards: <strong>${HandEvaluator.describe(holeEval)}</strong>` : "";
      }
      if ((gameId === "deepOrDoubleScrew" || gameId === "threeBuyFive" || gameId === "fourTwoTwo") && typeof GutsRules !== "undefined") {
        const best = GutsRules.evaluateHand(gvs.state, human);
        if (best && best.category >= 0) return `${foldPrefix}Your Hand: <strong>${HandEvaluator.describe(best)}</strong>`;
      }
      if (gameId === "wildInYourHand" && typeof WildInYourHandRules !== "undefined") {
        const best = WildInYourHandRules.evaluateHand(gvs.state, human);
        if (best && best.category >= 0) return `${foldPrefix}Your Hand: <strong>${HandEvaluator.describe(best)}</strong>`;
      }
      if (typeof HandEvaluator !== "undefined" && human.hand.length > 0) {
        const mapped = human.hand.map((c) => ({
          rank: c.rank,
          suit: c.suit,
          isWild: !!(c.isWild || c.bought || c.rank === "JOKER" || (gvs.state.wildRank && c.rank === gvs.state.wildRank)),
        }));
        const evalHand = HandEvaluator.evaluatePartial(mapped);
        if (evalHand && evalHand.category >= 0) {
          return `${foldPrefix}Your Hand: <strong>${HandEvaluator.describe(evalHand)}</strong>`;
        }
      }
    } catch (e) {}
    return human.folded ? `${foldPrefix}Your Hand (Out of Play)` : "";
  }

  // ---- 5. Concept 3: Bespoke Interactive Tabletop Boards (#board-hand) ----
  function renderAnalogGaugeSvg(label, currentVal, targetVal, busted, isLow, extraSub) {
    // Needle angle from -115deg (0) to +95deg (targetVal), or +125deg (busted)
    let ratio = targetVal > 0 ? Number(currentVal || 0) / targetVal : 0;
    if (ratio < 0) ratio = 0;
    const deg = busted ? 122 : Math.min(115, -115 + Math.min(1.08, ratio) * 210);
    const valText = busted ? "BUST!" : Number(currentVal || 0).toFixed(Number.isInteger(currentVal) ? 0 : 1);
    const targetText = Number(targetVal).toFixed(Number.isInteger(targetVal) ? 0 : 1);
    const glowClass = busted ? "dial-bezel-busted" : isLow ? "dial-bezel-low" : "dial-bezel-high";

    return `
      <div class="brass-dial-unit ${glowClass}">
        <div class="brass-dial-bezel">
          <svg class="brass-dial-svg" viewBox="0 0 120 120" aria-hidden="true">
            <defs>
              <radialGradient id="dialFaceGrad" cx="50%" cy="45%" r="50%">
                <stop offset="0%" stop-color="#f4ecd8" />
                <stop offset="75%" stop-color="#cbbba0" />
                <stop offset="100%" stop-color="#7d6b52" />
              </radialGradient>
            </defs>
            <!-- Outer Brass Ring with Rivets -->
            <circle cx="60" cy="60" r="56" fill="#3d2b18" stroke="#d4af37" stroke-width="3" />
            <circle cx="60" cy="10" r="2.2" fill="#f1d77e" />
            <circle cx="103" cy="35" r="2.2" fill="#f1d77e" />
            <circle cx="103" cy="85" r="2.2" fill="#f1d77e" />
            <circle cx="60" cy="110" r="2.2" fill="#f1d77e" />
            <circle cx="17" cy="85" r="2.2" fill="#f1d77e" />
            <circle cx="17" cy="35" r="2.2" fill="#f1d77e" />
            <!-- Aged Parchment Dial Face -->
            <circle cx="60" cy="60" r="46" fill="url(#dialFaceGrad)" stroke="#2c1d0e" stroke-width="2" />
            <!-- Scale Arc & Danger Red Zone -->
            <path d="M 24 82 A 42 42 0 1 1 92 86" fill="none" stroke="#2c1d0e" stroke-width="3" stroke-dasharray="3 5.5" />
            <path d="M 88 32 A 42 42 0 0 1 96 82" fill="none" stroke="#c92a2a" stroke-width="4" opacity="0.75" />
            <!-- Dial Numbers -->
            <text x="28" y="88" font-size="8" font-weight="800" fill="#2c1d0e">0</text>
            <text x="92" y="88" font-size="8" font-weight="800" fill="#9c1c1c">${targetText}</text>
            <!-- Cracked Vintage Glass Lines -->
            <path d="M 42 36 L 52 50 L 38 58 M 52 50 L 63 43" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="0.9" />
            <!-- Pivoting Needle -->
            <g transform="translate(60, 62) rotate(${deg.toFixed(1)})">
              <polygon points="-2.5,8 0,-38 2.5,8" fill="${busted ? "#e03131" : "#18181b"}" />
              <circle cx="0" cy="0" r="6" fill="#8c6d23" stroke="#2c1d0e" stroke-width="1.5" />
            </g>
          </svg>
        </div>
        <div class="brass-dial-caption ${isLow ? "caption-low" : "caption-high"}">
          ${label}: <strong>${valText} / ${targetText}</strong>${extraSub ? ` <span class="dial-sub">${extraSub}</span>` : ""}
        </div>
      </div>
    `;
  }

  function renderCustomGameBoard(boardEl, vs, gvs) {
    if (!boardEl || !gvs || !gvs.state) return false;
    const gameId = vs.activeGameId;
    const state = gvs.state;
    const stadium = document.getElementById("poker-table-stadium");
    if (stadium) {
      stadium.classList.toggle("table-rained-out", !!(state && state.rainedOut));
    }

    // ---- A. FREE ENTERPRISE: 3 Brass Market Stalls + Embossed Wipe Coin + Free Deck ----
    if (gameId === "freeEnterprise" && typeof StudRules !== "undefined") {
      const best = StudRules.currentBestShowingHand(state);
      const holder = best.holderId ? StudRules.getPlayer(state, best.holderId) : null;
      const isFinal = StudRules.streetsRemaining(state) === 0;
      const human = gvs.players.find((p) => p.id === vs.humanId);
      const humanChips = human && human.wallet ? human.wallet.chips : 0;
      const canBuyNow =
        gvs.pending && (gvs.pending.kind === "enterprisePile" || gvs.pending.kind === "enterprisePileAfterWipe");
      const canWipeNow =
        gvs.pending && gvs.pending.kind === "enterprisePile" && humanChips >= ChipEconomy.dollarsToChips(1);
      const pile = state.enterprisePile || [];

      const stallsHtml = [0, 1, 2]
        .map((slotIdx) => {
          const card = pile[slotIdx];
          const priceDollars = StudRules.currentEnterprisePriceDollars(state, slotIdx);
          const canAffordSlot = humanChips >= ChipEconomy.dollarsToChips(priceDollars);
          const slotInteractive = canBuyNow && card && canAffordSlot;
          const cardHtml = card ? fxCardHtml(card, false) : fxCardHtml(null, true);
          return `
            <button type="button" class="fe-market-stall ${slotInteractive ? "fe-stall-interactive" : ""}"
              ${slotInteractive ? `data-fx-enterprise-buy="${slotIdx}"` : "disabled"}
              title="${slotInteractive ? `Click to buy ${Deck.cardLabel(card)} for ${money(priceDollars)}` : `Slot ${slotIdx + 1}: ${money(priceDollars)}${canBuyNow && !canAffordSlot ? " (need more chips)" : ""}`}">
              <div class="fe-stall-awning">
                <span></span><span></span><span></span><span></span><span></span>
              </div>
              <div class="fe-stall-booth">
                <div class="fe-stall-fan-bg" aria-hidden="true"></div>
                <div class="fe-stall-card-wrap">${cardHtml}</div>
                ${slotInteractive ? `<span class="fe-stall-buy-pill">BUY ${Deck.cardLabel(card)}</span>` : ""}
              </div>
              <div class="fe-stall-counter">
                <span class="fe-stall-price">${money(priceDollars)} SLOT</span>
              </div>
            </button>
          `;
        })
        .join("");

      boardEl.innerHTML = `
        <div class="concept3-board board-free-enterprise">
          <div class="c3-board-top-row">
            <div class="c3-board-title">🏪 FREE ENTERPRISE MARKET ${isFinal ? '<span class="c3-hot-badge">2× FINAL STREET!</span>' : ""}</div>
            <div class="c3-leader-pill">
              👑 Best Showing: <strong>${holder ? `${HandEvaluator.describe(best.hand)} (${holder.name})` : "None yet"}</strong>
            </div>
          </div>
          <div class="fe-market-row">
            <div class="fe-stalls-group">
              ${stallsHtml}
            </div>
            <div class="fe-side-actions">
              <button type="button" class="fe-brass-wipe-coin ${canWipeNow ? "fe-coin-interactive" : ""}"
                ${canWipeNow ? "data-fx-enterprise-wipe" : "disabled"}
                title="Pay $1.00 to wipe all 3 stalls and deal a fresh pile">
                <span class="fe-coin-inner">
                  <span class="fe-coin-top">WIPE PILE</span>
                  <span class="fe-coin-price">$1.00</span>
                  <span class="fe-coin-sub">FRESH 3</span>
                </span>
              </button>
              <button type="button" class="fe-free-deck-slot ${canBuyNow ? "fe-deck-interactive" : ""}"
                ${canBuyNow ? "data-fx-enterprise-free" : "disabled"}
                title="Draw 1 card face-down from the deck for free">
                ${fxCardHtml(null, true, "fe-deck-card")}
                <span class="fe-deck-label">FREE DOWN CARD</span>
              </button>
            </div>
          </div>
        </div>
      `;
      return true;
    }

    // ---- B. BASEBALL FAMILY (Midnight, Daytime, Rainy Day): Chalkboard Plaque + Leader Podium + Red Queen Rain-Out ----
    if (gameId === "midnightBaseball" || gameId === "daytimeBaseball" || gameId === "rainyDayBaseball") {
      let leaderDesc = "None yet";
      let beatCardHtml = "";
      if (gameId === "midnightBaseball" && typeof MidnightBaseball !== "undefined") {
        const best = MidnightBaseball.currentBestHand(state);
        const holder = best.holderId ? MidnightBaseball.getPlayer(state, best.holderId) : null;
        leaderDesc = `${HandEvaluator.describe(best.hand)}${holder ? ` (${holder.name})` : ""}`;
        if (state.referenceCard) {
          beatCardHtml = `
            <div class="bb-beat-card-showcase">
              <span class="bb-showcase-label">BEAT CARD</span>
              ${fxCardHtml(state.referenceCard, false, holder ? "card-beaten" : "")}
            </div>
          `;
        }
      } else if (typeof StudRules !== "undefined") {
        const best = StudRules.currentBestShowingHand(state);
        const holder = best.holderId ? StudRules.getPlayer(state, best.holderId) : null;
        leaderDesc = holder ? `${HandEvaluator.describe(best.hand)} (${holder.name})` : "None yet";
      }

      const showQueenProp = gameId === "rainyDayBaseball" || state.rainedOut;
      const queenPropHtml = showQueenProp
        ? `
          <div class="bb-rainout-prop ${state.rainedOut ? "bb-rainout-active" : ""}">
            <div class="bb-queen-card-tilt">
              ${fxCardHtml({ rank: "Q", suit: "H" }, false)}
              <div class="bb-rainout-stamp">${state.rainedOut ? "RAIN-OUT!" : "Q♥/Q♦ = RAIN"}</div>
            </div>
          </div>
        `
        : "";

      boardEl.innerHTML = `
        <div class="concept3-board board-baseball-family">
          <div class="bb-chalkboard-plaque">
            <div class="bb-chalkboard-inner">
              <div class="bb-chalk-line1">3s ($3) &amp; 9s ($2) Wild |</div>
              <div class="bb-chalk-line2">4s ($1) = Bonus Card</div>
            </div>
          </div>
          <div class="bb-center-podium">
            ${beatCardHtml}
            <div class="bb-leader-box">
              <div class="bb-leader-eyebrow">⚾ HAND TO BEAT</div>
              <div class="bb-leader-val">${leaderDesc}</div>
              ${state.rainedOut ? `<div class="bb-rainout-alert">⛈️ RAINED OUT! Pot carries forward!</div>` : ""}
            </div>
          </div>
          ${queenPropHtml}
        </div>
      `;
      return true;
    }

    // ---- C. TARGET-SUM FAMILY (5.5-21, 7-27, 3-33): Twin Vintage Brass Analog Dial Gauges ----
    if (gameId === "fiveFiveTwentyOne" || gameId === "sevenTwentySeven") {
      const cfg = state.gameConfig;
      const human = gvs.players.find((p) => p.id === vs.humanId);
      const lowRes =
        human && !human.folded && typeof PressYourLuckRules !== "undefined"
          ? PressYourLuckRules.handSumResult(state, human, cfg.lowTarget)
          : { value: 0, busted: false };
      const highRes =
        human && !human.folded && typeof PressYourLuckRules !== "undefined"
          ? PressYourLuckRules.handSumResult(state, human, cfg.highTarget)
          : { value: 0, busted: false };

      let showdownHtml = "";
      const potDisplay = state.status === "complete" ? state.potAtShowdown : state.pot;
      if (state.outrightWinnerIds && state.outrightWinnerIds.length) {
        const names = state.outrightWinnerIds.map((id) => PressYourLuckRules.getPlayer(state, id).name);
        showdownHtml = `<div class="c3-showdown-banner">🏆 <strong>${names.join(", ")}</strong> wins uncontested (${money(ChipEconomy.chipsToDollars(potDisplay))})!</div>`;
      } else if (state.results) {
        if (state.results.kitchenSink) {
          const names = state.results.winnerIds.map((id) => PressYourLuckRules.getPlayer(state, id).name).join(", ");
          showdownHtml = `<div class="c3-showdown-banner">🏆 <strong>KITCHEN SINK!</strong> ${names} sweeps both Low &amp; High (${money(ChipEconomy.chipsToDollars(potDisplay))})!</div>`;
        } else {
          const lowNames = state.results.lowWinners.map((id) => PressYourLuckRules.getPlayer(state, id).name).join(", ") || "Carries Forward";
          const highNames = state.results.highWinners.map((id) => PressYourLuckRules.getPlayer(state, id).name).join(", ") || "Carries Forward";
          showdownHtml = `<div class="c3-showdown-banner">⚖️ Low Winner: <strong>${lowNames}</strong> &middot; High Winner: <strong>${highNames}</strong></div>`;
        }
      }

      boardEl.innerHTML = `
        <div class="concept3-board board-target-sum">
          <div class="brass-dials-pair">
            ${renderAnalogGaugeSvg("LOW TARGET", lowRes.value, cfg.lowTarget, lowRes.busted, true)}
            ${renderAnalogGaugeSvg("HIGH TARGET", highRes.value, cfg.highTarget, highRes.busted, false)}
          </div>
          ${showdownHtml}
        </div>
      `;
      return true;
    }

    if (gameId === "threeThirtyThree" && typeof Rules333 !== "undefined") {
      const human = gvs.players.find((p) => p.id === vs.humanId);
      const lowRes =
        human && !human.folded ? Rules333.handSumResult(state, human, Rules333.LOW_TARGET) : { value: 0, distance: 3 };
      const highRes =
        human && !human.folded ? Rules333.handSumResult(state, human, Rules333.HIGH_TARGET) : { value: 0, distance: 33 };

      const commSlots = Array.from({ length: Rules333.TOTAL_ROUNDS })
        .map((_, idx) => {
          const c = state.communityCards[idx];
          return `
            <div class="c3-card-well">
              <span class="c3-well-label">R${idx + 1}</span>
              ${c ? fxCardHtml(c, false) : `<div class="c3-well-empty"></div>`}
            </div>
          `;
        })
        .join("");

      let resultHtml = "";
      const potDisplay = state.status === "complete" ? state.potAtShowdown : state.pot;
      if (state.outrightWinnerIds) {
        resultHtml = `<div class="c3-showdown-banner">🏆 Outright Winner: <strong>${state.outrightWinnerIds.map((id) => Rules333.getPlayer(state, id).name).join(", ")}</strong> (${money(ChipEconomy.chipsToDollars(potDisplay))})</div>`;
      } else if (state.results) {
        const lowNames = state.results.lowWinners.map((id) => Rules333.getPlayer(state, id).name).join(", ") || "Carries";
        const highNames = state.results.highWinners.map((id) => Rules333.getPlayer(state, id).name).join(", ") || "Carries";
        resultHtml = `<div class="c3-showdown-banner">⚖️ Low (3): <strong>${lowNames}</strong> &middot; High (33): <strong>${highNames}</strong></div>`;
      }

      boardEl.innerHTML = `
        <div class="concept3-board board-target-sum">
          <div class="brass-dials-pair">
            ${renderAnalogGaugeSvg("LOW TARGET", lowRes.value, Rules333.LOW_TARGET, false, true, `(Δ ${lowRes.distance})`)}
            ${renderAnalogGaugeSvg("HIGH TARGET", highRes.value, Rules333.HIGH_TARGET, false, false, `(Δ ${highRes.distance})`)}
          </div>
          <div class="c3-wells-row">${commSlots}</div>
          ${resultHtml}
        </div>
      `;
      return true;
    }

    // ---- D. GUTS FAMILY (3-5-7 Guts, Deep or Double Screw, 3 Buy 5, Four-Two-Two): 3D Embossed IN! / OUT Medallions ----
    if (gameId === "threeFiveSeven" || gameId === "deepOrDoubleScrew" || gameId === "threeBuyFive" || gameId === "fourTwoTwo") {
      const canDeclareNow = gvs.pending && gvs.pending.kind === "stayDecision" && gvs.pending.playerId == null;
      const humanDecision = state.stayDecisions ? state.stayDecisions[vs.humanId] : null;
      const wildDesc =
        state.wildRanks && state.wildRanks.length
          ? `${state.wildRanks.join(", ")}s WILD`
          : state.gameConfig && state.gameConfig.lowestCardWild
          ? "LOWEST HOLE CARD WILD"
          : "NO WILDS";

      let dummyHtml = "";
      if (state.dummyHand) {
        const revealed = state.status === "complete";
        const dummyCards = state.dummyHand.hand
          .map((c) =>
            revealed
              ? fxCardHtml({ ...c, isWild: GutsRules.isCardWild(state, c, state.dummyHand) }, false)
              : fxCardHtml(null, true)
          )
          .join("");
        dummyHtml = `
          <div class="guts-dummy-box">
            <div class="guts-dummy-title">🛡️ DUMMY HAND TO BEAT</div>
            <div class="guts-dummy-cards">${dummyCards}</div>
          </div>
        `;
      }

      boardEl.innerHTML = `
        <div class="concept3-board board-guts-arena">
          <div class="c3-board-top-row">
            <span class="c3-wild-pill">★ ${wildDesc}</span>
            <span class="c3-leader-pill">🔥 Losers Match the Pot!</span>
          </div>
          <div class="guts-medallions-stage">
            <button type="button" class="guts-3d-medallion medallion-gold-in ${canDeclareNow ? "medallion-clickable" : ""} ${humanDecision === true ? "medallion-chosen" : ""}"
              ${canDeclareNow ? 'data-fx-stay="yes"' : "disabled"}
              title="${canDeclareNow ? "Click to STAY IN and clash for the pot!" : "Guts IN Medallion"}">
              <span class="medallion-rim">
                <span class="medallion-text">IN!</span>
                <span class="medallion-sub">${canDeclareNow ? "TAP TO STAY" : "CLASH"}</span>
              </span>
            </button>
            ${dummyHtml}
            <button type="button" class="guts-3d-medallion medallion-slate-out ${canDeclareNow ? "medallion-clickable" : ""} ${humanDecision === false ? "medallion-chosen" : ""}"
              ${canDeclareNow ? 'data-fx-stay="no"' : "disabled"}
              title="${canDeclareNow ? "Click to FOLD safely out of this clash" : "Guts OUT Medallion"}">
              <span class="medallion-rim">
                <span class="medallion-text">OUT</span>
                <span class="medallion-sub">${canDeclareNow ? "TAP TO FOLD" : "SAFE"}</span>
              </span>
            </button>
          </div>
        </div>
      `;
      return true;
    }

    // ---- E. STUD SPECIALTIES (Good/Bad/Ugly, Follow the Queen, Seven & What Makes It, Mexican Sweat) ----
    if (gameId === "goodBadUgly" || gameId === "followTheQueen" || gameId === "sevenAndWhatMakesIt") {
      const best = StudRules.currentBestShowingHand(state);
      const holder = best.holderId ? StudRules.getPlayer(state, best.holderId) : null;

      let pedestalsHtml = "";
      if (state.tableCards && state.tableCards.length) {
        pedestalsHtml = `
          <div class="c3-pedestals-row">
            ${state.tableCards
              .map((c, i) => {
                const label = state.gameConfig.tableReveals[i].label;
                const tone = i === 0 ? "pedestal-good" : i === 1 ? "pedestal-bad" : "pedestal-ugly";
                const sub =
                  i === 0 ? "RANK IS WILD" : i === 1 ? "RANK STRIPPED" : "MATCH = FOLD";
                return `
                  <div class="c3-card-pedestal ${tone}">
                    <div class="pedestal-header">${label}</div>
                    <div class="pedestal-card">${c.revealed ? fxCardHtml(c, false) : fxCardHtml(null, true)}</div>
                    <div class="pedestal-sub">${sub}</div>
                  </div>
                `;
              })
              .join("")}
          </div>
        `;
      } else if (gameId === "followTheQueen") {
        pedestalsHtml = `
          <div class="c3-special-plaque">
            👑 <strong>All Queens are WILD</strong> + Card Immediately Following the Last Exposed Queen${state.gameConfig.lowChicago ? " &middot; 🂡 <strong>Low Chicago (Down Spade Splits Pot)</strong>" : ""}
          </div>
        `;
      } else if (gameId === "sevenAndWhatMakesIt") {
        pedestalsHtml = `
          <div class="c3-special-plaque">
            🎲 <strong>7s are Always WILD</strong> + Any Disjoint Group of Your Cards Summing to 7 Becomes WILD!
          </div>
        `;
      }

      boardEl.innerHTML = `
        <div class="concept3-board board-stud-special">
          <div class="c3-board-top-row">
            <div class="c3-leader-pill">👑 Best Showing: <strong>${holder ? `${HandEvaluator.describe(best.hand)} (${holder.name})` : "None yet"}</strong></div>
          </div>
          ${pedestalsHtml}
        </div>
      `;
      return true;
    }

    if (gameId === "mexicanSweat" && typeof MexicanSweatRules !== "undefined") {
      const best = MexicanSweatRules.currentBestShowingHand(state);
      const holder = best.holderId ? MexicanSweatRules.getPlayer(state, best.holderId) : null;
      const roundsLeft = MexicanSweatRules.roundsRemaining(state);
      boardEl.innerHTML = `
        <div class="concept3-board board-stud-special">
          <div class="c3-board-top-row">
            <span class="c3-wild-pill">🌶️ ${state.wildRank ? `Flipped Wild: ${state.wildRank}s` : "Simultaneous No-Peek Flip"}</span>
            <span class="c3-leader-pill">👑 Best Showing: <strong>${holder ? `${HandEvaluator.describe(best.hand)} (${holder.name})` : "None yet"}</strong> &middot; ${roundsLeft} Flip(s) Left</span>
          </div>
        </div>
      `;
      return true;
    }

    // ---- F. COMMUNITY STUD (Cincinnati & Criss Cross) & HOLD'EM (Omaha, Seattle, Boise, Jersey) ----
    if (gameId === "cincinnati" || gameId === "crissCross") {
      const cards = state.communityCards.map((c) => {
        if (!c.revealed) return fxCardHtml(null, true);
        const isWild =
          typeof CommunityStudRules !== "undefined" && typeof CommunityStudRules.isCardWild === "function"
            ? CommunityStudRules.isCardWild(state, c)
            : !!(c.isWild || (state.wildRank && c.rank === state.wildRank));
        return fxCardHtml({ ...c, isWild }, false);
      });
      const centerWildActive = state.gameConfig.wildcardMode === "center";
      const layoutHtml = state.gameConfig.arms
        ? `
          <div class="c3-brass-cross" role="group" aria-label="Criss Cross 5-Card Cross Layout">
            <div class="c3-cross-axis-v" aria-hidden="true"><span class="c3-axis-tag c3-axis-tag-v">↕ VERTICAL BAR</span></div>
            <div class="c3-cross-axis-h" aria-hidden="true"><span class="c3-axis-tag c3-axis-tag-h">↔ HORIZONTAL BAR</span></div>
            <div class="cross-row cross-row-top">
              <div class="cross-slot" title="Top Vertical Arm">${cards[0]}</div>
            </div>
            <div class="cross-row cross-row-mid">
              <div class="cross-slot" title="Left Horizontal Arm">${cards[1]}</div>
              <div class="cross-center-pivot" title="Shared Center Card${centerWildActive ? " (Wild Rank!)" : ""}">
                <span class="cross-pivot-label">${centerWildActive ? "★ WILD CENTER" : "✚SHARED CENTER"}</span>
                ${cards[2]}
              </div>
              <div class="cross-slot" title="Right Horizontal Arm">${cards[3]}</div>
            </div>
            <div class="cross-row cross-row-bot">
              <div class="cross-slot" title="Bottom Vertical Arm">${cards[4]}</div>
            </div>
          </div>
        `
        : `<div class="c3-wells-row">${cards.map((c, i) => `<div class="c3-card-well"><span class="c3-well-label">#${i + 1}</span>${c}</div>`).join("")}</div>`;

      boardEl.innerHTML = `
        <div class="concept3-board board-community-stud">
          <div class="c3-board-top-row">
            <span class="c3-wild-pill">${gameId === "crissCross" ? "✚ Use 2–4 Hole + 1–3 From ONE Cross Bar" : "🃏 Build Best 5 From 5 Hole + 5 Community"}${state.wildRank ? ` &middot; ★ ${state.wildRank}s WILD` : ""}</span>
            ${state.gameConfig.hiLo ? `<span class="c3-leader-pill">⚖️ Hi-Lo Split Active</span>` : ""}
          </div>
          ${layoutHtml}
        </div>
      `;
      return true;
    }

    if (gameId === "omaha" || gameId === "seattle" || gameId === "boise" || gameId === "jerseyHoldem") {
      const labels = ["FLOP 1", "FLOP 2", "FLOP 3", "TURN", "RIVER"];
      const wellsHtml = labels
        .map((lbl, idx) => {
          const c = state.communityCards[idx];
          return `
            <div class="c3-card-well">
              <span class="c3-well-label">${lbl}</span>
              ${c ? fxCardHtml(c, false) : `<div class="c3-well-empty"></div>`}
            </div>
          `;
        })
        .join("");
      const ruleBadge =
        gameId === "omaha"
          ? "🐂 OMAHA: Must Use Exactly 2 Hole + 3 Board"
          : gameId === "seattle"
          ? "🌲 SEATTLE: Must Use Exactly 3 Hole + 2 Board"
          : "🏔️ FLEX HOLD'EM: Use (2 Hole + 3 Board) OR (3 Hole + 2 Board)";

      boardEl.innerHTML = `
        <div class="concept3-board board-holdem">
          <div class="c3-board-top-row">
            <span class="c3-wild-pill">${ruleBadge}</span>
            ${state.gameConfig && state.gameConfig.hiLo ? `<span class="c3-leader-pill">⚖️ 8-or-Better Hi-Lo</span>` : ""}
          </div>
          <div class="c3-wells-row">${wellsHtml}</div>
        </div>
      `;
      return true;
    }

    // ---- G. ACEY DUCEY: Brass Goalposts Arena ----
    if (gameId === "aceyDucey" && typeof AceyDuceyRules !== "undefined") {
      const post1 = state.shownCards && state.shownCards[0] ? fxCardHtml(state.shownCards[0], false) : fxCardHtml(null, true);
      const post2 = state.shownCards && state.shownCards[1] ? fxCardHtml(state.shownCards[1], false) : fxCardHtml(null, true);
      const third = state.thirdCard ? fxCardHtml(state.thirdCard, false, "card-just-flipped") : `<div class="c3-well-empty">?</div>`;
      const gap = state.shownCards ? AceyDuceyRules.gapInfo(state.shownCards).gap : 0;

      boardEl.innerHTML = `
        <div class="concept3-board board-acey-ducey">
          <div class="acey-goalposts-stage">
            <div class="acey-post">
              <div class="acey-upright"></div>
              <span class="acey-post-label">LEFT POST</span>
              ${post1}
            </div>
            <div class="acey-mid-turf">
              <div class="acey-spread-badge">${gap > 0 ? `🎯 ${gap} Winning Rank(s) Between Posts` : "⚠️ 0 Spread (Post Risk!)"}</div>
              <div class="acey-drawn-slot">${third}</div>
              <div class="acey-post-warn">⚡ Hit Either Post = Pay DOUBLE!</div>
            </div>
            <div class="acey-post">
              <div class="acey-upright"></div>
              <span class="acey-post-label">RIGHT POST</span>
              ${post2}
            </div>
          </div>
        </div>
      `;
      return true;
    }

    // ---- H. GAME OF LIFE: Emerald Sanctuary Row vs Crimson Poison Row ----
    if (gameId === "gameOfLife") {
      const goodCards = state.goodRow
        .map((c) => {
          if (!c.flipped) return `<div class="gol-card-slot">${fxCardHtml(null, true)}</div>`;
          const isPoisoned = c.poisoned || state.poisonedRanks.includes(c.rank);
          const cardMarkup = fxCardHtml(c, false, isPoisoned ? "card-gol-poisoned" : "");
          const subTag = isPoisoned
            ? `<span class="gol-card-tag gol-tag-poisoned">☠️ Poisoned</span>`
            : c.claimedBy
            ? `<span class="gol-card-tag gol-tag-claimed">&rarr; ${c.claimedBy.split(" ")[0]}</span>`
            : "";
          return `<div class="gol-card-slot ${isPoisoned ? "gol-slot-poisoned" : ""}">${cardMarkup}${subTag}</div>`;
        })
        .join("");
      const badCards = state.badRow
        .map((c) => `<div class="gol-card-slot">${c.flipped ? fxCardHtml(c, false) : fxCardHtml(null, true)}</div>`)
        .join("");
      const poisons = state.poisonedRanks.length
        ? state.poisonedRanks.map((r) => `<span class="poison-vial-badge">☠️ ${r}s Stripped</span>`).join("")
        : `<span class="c3-leader-pill">No ranks poisoned yet</span>`;

      boardEl.innerHTML = `
        <div class="concept3-board board-game-of-life">
          <div class="gol-lanes">
            <div class="gol-lane gol-lane-good">
              <div class="gol-lane-title">🌿 GOOD ROW (Claimed Into Flipper's Hand)</div>
              <div class="gol-lane-cards">${goodCards}</div>
            </div>
            <div class="gol-lane gol-lane-bad">
              <div class="gol-lane-title">☠️ BAD ROW (Poisons &amp; Strips Rank From ALL Hands)</div>
              <div class="gol-lane-cards">${badCards}</div>
            </div>
          </div>
          <div class="gol-poison-bar">${poisons}</div>
        </div>
      `;
      return true;
    }

    // ---- I. WILD IN YOUR HAND: 3-2-1 Golden Stepped Pyramid ----
    if (gameId === "wildInYourHand" && typeof WildInYourHandRules !== "undefined") {
      const rowsHtml = state.pyramid
        .map((row, idx) => {
          const revealed = state.pyramidRevealed[idx];
          const cards = row
            .map((c) =>
              revealed ? fxCardHtml({ ...c, isWild: WildInYourHandRules.isCardWild(state, c) }, false) : fxCardHtml(null, true)
            )
            .join("");
          return `
            <div class="c3-pyramid-tier">
              <span class="c3-pyramid-label">ROW ${idx + 1} ($0.50)</span>
              <div class="c3-pyramid-cards">${cards}</div>
            </div>
          `;
        })
        .join("");

      boardEl.innerHTML = `
        <div class="concept3-board board-pyramid">
          <div class="c3-board-top-row">
            <span class="c3-wild-pill">🔺 Lowest Hole Card Wild ${state.wildRanks.length ? `· Board Wilds: ${state.wildRanks.join(", ")}s` : ""}</span>
          </div>
          <div class="c3-pyramid-stack">${rowsHtml}</div>
        </div>
      `;
      return true;
    }

    // ---- J. ANACONDA, PAIR OF JACKS & BLIND MAN'S BLUFF ----
    if (gameId === "anaconda") {
      const stages = [
        { key: "discard1", label: "1. Pass 3 Left ↺" },
        { key: "discard2", label: "2. Discard 2 🗑️" },
        { key: "revealing", label: `3. Roll Your Own (${state.revealsDone || 0}/5) 🎴` },
        { key: "complete", label: "4. Showdown 🏆" },
      ];
      const activeStage =
        state.status === "discard1" || state.status === "betting1"
          ? "discard1"
          : state.status === "discard2" || state.status === "betting2"
          ? "discard2"
          : state.status === "complete"
          ? "complete"
          : "revealing";

      boardEl.innerHTML = `
        <div class="concept3-board board-anaconda">
          <div class="anaconda-track">
            ${stages
              .map((s) => `<div class="anaconda-step ${s.key === activeStage ? "anaconda-step-active" : ""}">${s.label}</div>`)
              .join('<span class="anaconda-arrow">&rarr;</span>')}
          </div>
        </div>
      `;
      return true;
    }

    if (gameId === "pairOfJacksTripsToWin" && typeof RulesDrawPoker !== "undefined") {
      const human = gvs.players.find((p) => p.id === vs.humanId);
      const hand = human && human.hand && human.hand.length ? RulesDrawPoker.evaluateHand(human.hand) : null;
      const hasJacks = hand ? RulesDrawPoker.qualifiesToOpen(hand) : false;
      const hasTrips = hand ? hand.category >= 3 : false;

      boardEl.innerHTML = `
        <div class="concept3-board board-draw-qualifiers">
          <div class="draw-medallion ${hasJacks ? "draw-medallion-met" : ""}">
            <div class="draw-med-title">👑 JACKS OR BETTER</div>
            <div class="draw-med-sub">Required to Open Betting ${hasJacks ? "✓ (You Qualify!)" : ""}</div>
          </div>
          <div class="draw-medallion ${hasTrips ? "draw-medallion-met" : ""}">
            <div class="draw-med-title">🔥 TRIPS OR BETTER</div>
            <div class="draw-med-sub">Required to Win Showdown ${hasTrips ? "✓ (You Qualify!)" : "(Else Pot Carries)"}</div>
          </div>
        </div>
      `;
      return true;
    }

    if (gameId === "blindMansBluff") {
      const visibleCards = gvs.players
        .filter((p) => !p.isHuman && !p.folded && p.hand && p.hand[0])
        .map((p) => `<span class="bmb-opp-pill">${p.name}: <strong>${Deck.cardLabel(p.hand[0])}</strong></span>`)
        .join("");
      boardEl.innerHTML = `
        <div class="concept3-board board-blind-mans-bluff">
          <div class="c3-wild-pill">🎭 Your Card is on Your Forehead — Judge by Opponents' Cards!</div>
          <div class="bmb-visible-strip">${visibleCards}</div>
        </div>
      `;
      return true;
    }

    return false;
  }

  // Classifies action-panel buttons by intent
  function enhanceActionButtons(actionPanelEl) {
    if (!actionPanelEl) return;
    const buttons = actionPanelEl.querySelectorAll("button");
    buttons.forEach((btn) => {
      const text = (btn.textContent || "").trim().toLowerCase();
      if (
        btn.hasAttribute("data-bet-fold") ||
        btn.hasAttribute("data-concede") ||
        btn.hasAttribute("data-stay-no") ||
        btn.hasAttribute("data-row-fold") ||
        btn.hasAttribute("data-buy-no") ||
        text === "fold" ||
        text === "concede"
      ) {
        btn.classList.add("btn-action-fold");
      } else if (
        btn.hasAttribute("data-bet-raise") ||
        btn.hasAttribute("data-buy-yes") ||
        btn.hasAttribute("data-enterprise-buy") ||
        btn.hasAttribute("data-stay-yes") ||
        btn.hasAttribute("data-hit") ||
        text.startsWith("raise") ||
        text.startsWith("buy ")
      ) {
        btn.classList.add("btn-action-raise");
      } else if (
        btn.hasAttribute("data-bet-call") ||
        btn.hasAttribute("data-stand") ||
        btn.hasAttribute("data-exchange-skip") ||
        text.startsWith("call") ||
        text === "check" ||
        text === "stand"
      ) {
        btn.classList.add("btn-action-call");
      } else if (
        btn.id === "deal-first-hand-btn" ||
        btn.id === "deal-next-hand-btn" ||
        btn.hasAttribute("data-pick-next-game") ||
        btn.hasAttribute("data-reveal-next")
      ) {
        btn.classList.add("btn-action-deal");
      }
    });
  }

  // Signature rule hooks for Concept 3 Game Selection cards
  const GAME_SIGNATURES = {
    midnightBaseball: "No-Peek 7-Card Flip · 3s ($3) & 9s ($2) Wild · 4s ($1) Bonus",
    daytimeBaseball: "7-Card Stud · 3s ($3 Must Buy/Fold) & 9s ($2) Wild · 4s Bonus",
    rainyDayBaseball: "Baseball Rules + Red Queen (Q♥/Q♦) Triggers Rain-Out!",
    freeEnterprise: "Buy Face-Up From 3-Card Market ($1/$2/$3) or Draw Free Down",
    followTheQueen: "Queens Wild + Card Following Last Exposed Queen is Wild",
    sevenAndWhatMakesIt: "Disjoint Groups Summing to 7 Become Wild · 7s Wild",
    goodBadUgly: "1st Card Wild · 2nd Rank Stripped · 3rd Match = Fold",
    mexicanSweat: "7 Down Cards · Simultaneous Flip & Bet Each Street",
    cincinnati: "5 Hole Cards + 5 Community Cards · Build Best 5",
    crissCross: "4–5 Hole Cards + 5-Card Cross · Use 1 Cross Arm Only",
    deepOrDoubleScrew: "Lowest Hole Card Wild · Simultaneous In/Out · Losers Match Pot",
    threeBuyFive: "3 Cards (5s Wild) · $1 Card Exchange · Losers Match Pot",
    fourTwoTwo: "4 Cards (2s Wild) · Stayers Draw 2 Bonus · Losers Match Pot",
    threeFiveSeven: "3 Escalating Rounds (3 Cards/3s → 5 Cards/5s → 7 Cards/7s)",
    wildInYourHand: "Lowest Card Wild · 3-2-1 Pyramid Board · Row Bets",
    omaha: "4 Hole Cards · Must Use 2 Hole + 3 Board · Optional Hi-Lo",
    seattle: "4 Hole Cards · Must Use 3 Hole + 2 Board · Optional Hi-Lo",
    boise: "5 Hole Cards · Use (2 Hole + 3 Board) or (3 Hole + 2 Board)",
    jerseyHoldem: "5 Hole Cards · Flexible 2+3 or 3+2 Combo · Optional Hi-Lo",
    fiveFiveTwentyOne: "Press Your Luck · Dual Targets: 5.5 Low & 21 High",
    sevenTwentySeven: "Press Your Luck · Dual Targets: 7 Low & 27 High",
    threeThirtyThree: "Fixed 5-Card Stud · Closest to 3 Low & 33 High Splits Pot",
    aceyDucey: "2 Goalpost Cards · Bet Pot That 3rd Lands Between (Posts = 2x)",
    blindMansBluff: "1 Forehead Card · See Everyone Else's Card Except Your Own!",
    gameOfLife: "5 Hole Cards + Good Row (Claim) & Bad Row (Poison Rank)",
    pairOfJacksTripsToWin: "5-Card Draw · Jacks to Open · Trips to Win or Pot Carries",
    anaconda: "7 Cards · Pass 3 Left · Discard 2 · Roll Your Own Reveal",
  };

  // Core game family mapping for unique table felt & background styling
  function getGameFamily(gameId) {
    if (gameId === "freeEnterprise") return "enterprise";
    if (gameId === "midnightBaseball" || gameId === "daytimeBaseball" || gameId === "rainyDayBaseball") return "baseball";
    if (gameId === "fiveFiveTwentyOne" || gameId === "sevenTwentySeven" || gameId === "threeThirtyThree") return "targetSum";
    if (gameId === "threeFiveSeven" || gameId === "deepOrDoubleScrew" || gameId === "threeBuyFive" || gameId === "fourTwoTwo") return "guts";
    if (gameId === "omaha" || gameId === "seattle" || gameId === "boise" || gameId === "jerseyHoldem") return "holdem";
    if (
      gameId === "followTheQueen" ||
      gameId === "sevenAndWhatMakesIt" ||
      gameId === "goodBadUgly" ||
      gameId === "mexicanSweat" ||
      gameId === "cincinnati" ||
      gameId === "crissCross"
    ) {
      return "stud";
    }
    return "specials";
  }

  // 27 Bespoke Illustrated SVG Game Emblems (Replaces plain text/emoji icons in Picker & Top Banner)
  function getGameEmblemSvg(gameId, size) {
    const px = size || 58;
    const defs = `
      <defs>
        <linearGradient id="embGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fff3bf"/>
          <stop offset="50%" stop-color="#d4af37"/>
          <stop offset="100%" stop-color="#7a5812"/>
        </linearGradient>
        <radialGradient id="embEmerald" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#2b8a3e"/>
          <stop offset="100%" stop-color="#0b2e13"/>
        </radialGradient>
        <radialGradient id="embCrimson" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#e03131"/>
          <stop offset="100%" stop-color="#5c0b0b"/>
        </radialGradient>
        <radialGradient id="embNavy" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#1c7ed6"/>
          <stop offset="100%" stop-color="#0b2545"/>
        </radialGradient>
        <radialGradient id="embAmber" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#f59f00"/>
          <stop offset="100%" stop-color="#5c3200"/>
        </radialGradient>
        <radialGradient id="embPurple" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#9c36b5"/>
          <stop offset="100%" stop-color="#2b0938"/>
        </radialGradient>
      </defs>
    `;

    let bgFill = "url(#embEmerald)";
    let innerArt = "";

    switch (gameId) {
      case "midnightBaseball":
        bgFill = "url(#embNavy)";
        innerArt = `
          <polygon points="32,10 52,32 32,54 12,32" fill="#183153" stroke="url(#embGold)" stroke-width="2"/>
          <circle cx="44" cy="18" r="6" fill="#ffe066"/>
          <circle cx="46" cy="16" r="5" fill="#183153"/>
          <circle cx="28" cy="34" r="9" fill="#fbf6e8" stroke="#c92a2a" stroke-width="1.5"/>
          <path d="M22,29 Q28,34 22,39 M34,29 Q28,34 34,39" fill="none" stroke="#c92a2a" stroke-width="1.4" stroke-dasharray="2 1.5"/>
          <text x="32" y="53" text-anchor="middle" font-size="8.5" font-weight="900" fill="#ffe066">3·9·4</text>
        `;
        break;
      case "daytimeBaseball":
        bgFill = "url(#embEmerald)";
        innerArt = `
          <polygon points="32,9 53,32 32,53 11,32" fill="#2b8a3e" stroke="#fff3bf" stroke-width="2"/>
          <line x1="16" y1="46" x2="46" y2="16" stroke="#e9c46a" stroke-width="3.5" stroke-linecap="round"/>
          <line x1="48" y1="46" x2="18" y2="16" stroke="#e9c46a" stroke-width="3.5" stroke-linecap="round"/>
          <circle cx="32" cy="31" r="8.5" fill="#ffffff" stroke="#e03131" stroke-width="1.5"/>
          <path d="M26,27 Q32,31 26,35 M38,27 Q32,31 38,35" fill="none" stroke="#e03131" stroke-width="1.3"/>
        `;
        break;
      case "rainyDayBaseball":
        bgFill = "url(#embNavy)";
        innerArt = `
          <path d="M18,28 A8,8 0 0,1 32,20 A9,9 0 0,1 47,27 A6,6 0 0,1 46,38 L18,38 A6,6 0 0,1 18,28 Z" fill="#74c0fc" stroke="#ffffff" stroke-width="1.2"/>
          <polygon points="33,34 27,44 33,44 29,54 39,41 33,41" fill="#ffe066"/>
          <line x1="21" y1="41" x2="18" y2="49" stroke="#74c0fc" stroke-width="2" stroke-linecap="round"/>
          <line x1="43" y1="41" x2="40" y2="49" stroke="#74c0fc" stroke-width="2" stroke-linecap="round"/>
          <text x="46" y="22" text-anchor="middle" font-size="9" font-weight="900" fill="#ff6b6b">Q♥</text>
        `;
        break;
      case "freeEnterprise":
        bgFill = "url(#embAmber)";
        innerArt = `
          <rect x="13" y="24" width="38" height="24" rx="3" fill="#2c160c" stroke="url(#embGold)" stroke-width="1.8"/>
          <path d="M11,16 L53,16 L49,26 L15,26 Z" fill="#e03131" stroke="#fff3bf" stroke-width="1.2"/>
          <rect x="20" y="16" width="6" height="10" fill="#fbf6e8"/>
          <rect x="32" y="16" width="6" height="10" fill="#fbf6e8"/>
          <rect x="44" y="16" width="5" height="10" fill="#fbf6e8"/>
          <circle cx="32" cy="37" r="8" fill="url(#embGold)" stroke="#2c160c" stroke-width="1.2"/>
          <text x="32" y="40.5" text-anchor="middle" font-size="9.5" font-weight="900" fill="#18181b">$1·$3</text>
        `;
        break;
      case "followTheQueen":
        bgFill = "url(#embPurple)";
        innerArt = `
          <path d="M14,42 L18,20 L26,30 L32,16 L38,30 L46,20 L50,42 Z" fill="url(#embGold)" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round"/>
          <rect x="14" y="43" width="36" height="6" rx="2" fill="url(#embGold)"/>
          <circle cx="18" cy="18" r="2.3" fill="#ff6b6b"/>
          <circle cx="32" cy="14" r="2.8" fill="#74c0fc"/>
          <circle cx="46" cy="18" r="2.3" fill="#ff6b6b"/>
          <text x="32" y="39" text-anchor="middle" font-size="10" font-weight="900" fill="#2b0938">Q★</text>
        `;
        break;
      case "sevenAndWhatMakesIt":
        bgFill = "url(#embCrimson)";
        innerArt = `
          <rect x="14" y="16" width="18" height="18" rx="3" fill="#fbf6e8" stroke="url(#embGold)" stroke-width="1.5"/>
          <circle cx="19" cy="21" r="1.8" fill="#18181b"/>
          <circle cx="27" cy="29" r="1.8" fill="#18181b"/>
          <circle cx="23" cy="25" r="1.8" fill="#e03131"/>
          <text x="41" y="47" text-anchor="middle" font-size="28" font-weight="900" fill="url(#embGold)" stroke="#18181b" stroke-width="1">7</text>
        `;
        break;
      case "goodBadUgly":
        bgFill = "url(#embAmber)";
        innerArt = `
          <rect x="11" y="18" width="13" height="28" rx="2" fill="#2fb364" stroke="#fff3bf" stroke-width="1.2"/>
          <rect x="25.5" y="15" width="13" height="28" rx="2" fill="#e67700" stroke="#fff3bf" stroke-width="1.2"/>
          <rect x="40" y="18" width="13" height="28" rx="2" fill="#c92a2a" stroke="#fff3bf" stroke-width="1.2"/>
          <text x="17.5" y="36" text-anchor="middle" font-size="11" font-weight="900" fill="#ffffff">★</text>
          <text x="32" y="33" text-anchor="middle" font-size="11" font-weight="900" fill="#ffffff">✖</text>
          <text x="46.5" y="36" text-anchor="middle" font-size="11" font-weight="900" fill="#ffffff">☠</text>
        `;
        break;
      case "mexicanSweat":
        bgFill = "url(#embCrimson)";
        innerArt = `
          <path d="M20,44 C28,46 44,36 46,18 C41,18 36,24 32,30 C26,38 20,38 20,44 Z" fill="#ff3b30" stroke="#ffe066" stroke-width="1.5"/>
          <path d="M45,18 Q48,12 42,11" fill="none" stroke="#51cf66" stroke-width="3" stroke-linecap="round"/>
          <circle cx="22" cy="22" r="4" fill="#74c0fc"/>
          <text x="32" y="53" text-anchor="middle" font-size="8.5" font-weight="900" fill="#ffe066">7 FLIPS</text>
        `;
        break;
      case "cincinnati":
        bgFill = "url(#embNavy)";
        innerArt = `
          <circle cx="32" cy="32" r="16" fill="none" stroke="url(#embGold)" stroke-width="3"/>
          <circle cx="32" cy="32" r="6" fill="url(#embGold)"/>
          <line x1="32" y1="11" x2="32" y2="53" stroke="url(#embGold)" stroke-width="2.2"/>
          <line x1="11" y1="32" x2="53" y2="32" stroke="url(#embGold)" stroke-width="2.2"/>
          <line x1="17" y1="17" x2="47" y2="47" stroke="url(#embGold)" stroke-width="2.2"/>
          <line x1="47" y1="17" x2="17" y2="47" stroke="url(#embGold)" stroke-width="2.2"/>
        `;
        break;
      case "crissCross":
        bgFill = "url(#embEmerald)";
        innerArt = `
          <rect x="26" y="10" width="12" height="44" rx="2" fill="#fbf6e8" stroke="url(#embGold)" stroke-width="1.8"/>
          <rect x="10" y="26" width="44" height="12" rx="2" fill="#fbf6e8" stroke="url(#embGold)" stroke-width="1.8"/>
          <rect x="25" y="25" width="14" height="14" rx="2" fill="url(#embGold)" stroke="#18181b" stroke-width="1.2"/>
          <text x="32" y="35.5" text-anchor="middle" font-size="10" font-weight="900" fill="#18181b">★</text>
        `;
        break;
      case "deepOrDoubleScrew":
        bgFill = "url(#embCrimson)";
        innerArt = `
          <path d="M16,16 L48,48 M48,16 L16,48" stroke="url(#embGold)" stroke-width="5" stroke-linecap="round"/>
          <circle cx="32" cy="32" r="9" fill="#18181b" stroke="url(#embGold)" stroke-width="2"/>
          <text x="32" y="35.5" text-anchor="middle" font-size="9" font-weight="900" fill="#ffe066">2×</text>
        `;
        break;
      case "threeBuyFive":
        bgFill = "url(#embAmber)";
        innerArt = `
          <rect x="13" y="16" width="18" height="26" rx="3" fill="#fbf6e8" stroke="#18181b" stroke-width="1.4"/>
          <rect x="33" y="20" width="18" height="26" rx="3" fill="url(#embGold)" stroke="#18181b" stroke-width="1.4"/>
          <text x="22" y="34" text-anchor="middle" font-size="14" font-weight="900" fill="#18181b">3</text>
          <text x="42" y="38" text-anchor="middle" font-size="14" font-weight="900" fill="#c92a2a">5★</text>
        `;
        break;
      case "fourTwoTwo":
        bgFill = "url(#embCrimson)";
        innerArt = `
          <rect x="12" y="17" width="40" height="30" rx="5" fill="#18181b" stroke="url(#embGold)" stroke-width="2"/>
          <text x="32" y="37" text-anchor="middle" font-size="14" font-weight="900" fill="#ffe066">4·2·2</text>
        `;
        break;
      case "threeFiveSeven":
        bgFill = "url(#embCrimson)";
        innerArt = `
          <polygon points="32,9 51,18 47,43 32,54 17,43 13,18" fill="#2b0909" stroke="url(#embGold)" stroke-width="2.2"/>
          <text x="32" y="28" text-anchor="middle" font-size="11" font-weight="900" fill="#ffe066">3·5·7</text>
          <text x="32" y="42" text-anchor="middle" font-size="9.5" font-weight="900" fill="#ff6b6b">GUTS</text>
        `;
        break;
      case "wildInYourHand":
        bgFill = "url(#embAmber)";
        innerArt = `
          <polygon points="32,11 52,47 12,47" fill="url(#embGold)" stroke="#18181b" stroke-width="1.8"/>
          <line x1="25" y1="24" x2="39" y2="24" stroke="#18181b" stroke-width="1.6"/>
          <line x1="19" y1="35" x2="45" y2="35" stroke="#18181b" stroke-width="1.6"/>
          <circle cx="32" cy="19" r="2.2" fill="#c92a2a"/>
        `;
        break;
      case "omaha":
        bgFill = "url(#embEmerald)";
        innerArt = `
          <path d="M12,20 Q20,10 26,24 L38,24 Q44,10 52,20 Q46,32 38,30 L26,30 Q18,32 12,20 Z" fill="url(#embGold)" stroke="#18181b" stroke-width="1.4"/>
          <rect x="18" y="34" width="28" height="14" rx="4" fill="#18181b" stroke="url(#embGold)" stroke-width="1.4"/>
          <text x="32" y="44" text-anchor="middle" font-size="9.5" font-weight="900" fill="#ffe066">2 + 3</text>
        `;
        break;
      case "seattle":
        bgFill = "url(#embEmerald)";
        innerArt = `
          <polygon points="32,10 46,30 38,30 48,44 16,44 26,30 18,30" fill="#40c057" stroke="url(#embGold)" stroke-width="1.5"/>
          <text x="32" y="54" text-anchor="middle" font-size="9" font-weight="900" fill="#ffe066">3 + 2</text>
        `;
        break;
      case "boise":
        bgFill = "url(#embNavy)";
        innerArt = `
          <polygon points="12,44 25,18 36,36 43,24 52,44" fill="#74c0fc" stroke="url(#embGold)" stroke-width="1.6"/>
          <text x="32" y="54" text-anchor="middle" font-size="8.5" font-weight="900" fill="#ffe066">5 HOLE</text>
        `;
        break;
      case "jerseyHoldem":
        bgFill = "url(#embPurple)";
        innerArt = `
          <polygon points="32,10 50,32 32,54 14,32" fill="url(#embGold)" stroke="#ffffff" stroke-width="1.4"/>
          <text x="32" y="36" text-anchor="middle" font-size="13" font-weight="900" fill="#18181b">NJ</text>
        `;
        break;
      case "fiveFiveTwentyOne":
      case "sevenTwentySeven":
      case "threeThirtyThree": {
        bgFill = "url(#embAmber)";
        const lbl = gameId === "fiveFiveTwentyOne" ? "5.5·21" : gameId === "sevenTwentySeven" ? "7·27" : "3·33";
        innerArt = `
          <circle cx="32" cy="30" r="18" fill="#fbf6e8" stroke="url(#embGold)" stroke-width="3"/>
          <path d="M20,37 A13,13 0 1,1 44,37" fill="none" stroke="#18181b" stroke-width="2" stroke-dasharray="2 3"/>
          <line x1="32" y1="30" x2="41" y2="20" stroke="#c92a2a" stroke-width="2.5" stroke-linecap="round"/>
          <circle cx="32" cy="30" r="3" fill="#18181b"/>
          <rect x="12" y="43" width="40" height="12" rx="4" fill="#18181b" stroke="url(#embGold)" stroke-width="1.2"/>
          <text x="32" y="52" text-anchor="middle" font-size="8.5" font-weight="900" fill="#ffe066">${lbl}</text>
        `;
        break;
      }
      case "aceyDucey":
        bgFill = "url(#embEmerald)";
        innerArt = `
          <path d="M18,14 L18,38 L46,38 L46,14 M32,38 L32,52" fill="none" stroke="url(#embGold)" stroke-width="3.5" stroke-linecap="round"/>
          <circle cx="32" cy="25" r="6" fill="#ff922b" stroke="#ffffff" stroke-width="1.4"/>
        `;
        break;
      case "blindMansBluff":
        bgFill = "url(#embPurple)";
        innerArt = `
          <rect x="22" y="11" width="20" height="27" rx="3" fill="#fbf6e8" stroke="url(#embGold)" stroke-width="1.6"/>
          <text x="32" y="29" text-anchor="middle" font-size="14" font-weight="900" fill="#c92a2a">?</text>
          <path d="M14,42 Q22,36 32,42 Q42,36 50,42 Q44,51 32,47 Q20,51 14,42 Z" fill="url(#embGold)"/>
        `;
        break;
      case "gameOfLife":
        bgFill = "url(#embEmerald)";
        innerArt = `
          <path d="M14,32 A18,18 0 0,1 32,14 L32,50 A18,18 0 0,1 14,32 Z" fill="#2fb364"/>
          <path d="M50,32 A18,18 0 0,0 32,14 L32,50 A18,18 0 0,0 50,32 Z" fill="#c92a2a"/>
          <circle cx="32" cy="32" r="18" fill="none" stroke="url(#embGold)" stroke-width="2.2"/>
          <text x="23" y="36" text-anchor="middle" font-size="11" fill="#ffffff">🌿</text>
          <text x="41" y="36" text-anchor="middle" font-size="11" fill="#ffffff">☠</text>
        `;
        break;
      case "pairOfJacksTripsToWin":
        bgFill = "url(#embNavy)";
        innerArt = `
          <rect x="14" y="15" width="18" height="26" rx="2.5" transform="rotate(-10 23 28)" fill="#fbf6e8" stroke="url(#embGold)" stroke-width="1.5"/>
          <rect x="30" y="15" width="18" height="26" rx="2.5" transform="rotate(10 39 28)" fill="#fbf6e8" stroke="url(#embGold)" stroke-width="1.5"/>
          <text x="23" y="32" text-anchor="middle" font-size="12" font-weight="900" fill="#18181b">J♠</text>
          <text x="39" y="32" text-anchor="middle" font-size="12" font-weight="900" fill="#c92a2a">J♥</text>
          <rect x="13" y="42" width="38" height="11" rx="3" fill="url(#embGold)"/>
          <text x="32" y="50" text-anchor="middle" font-size="7.5" font-weight="900" fill="#18181b">JJ+ / 3×</text>
        `;
        break;
      case "anaconda":
      default:
        bgFill = "url(#embEmerald)";
        innerArt = `
          <path d="M18,44 C14,32 28,30 28,22 C28,15 44,15 44,25 C44,35 34,37 46,46" fill="none" stroke="#51cf66" stroke-width="5.5" stroke-linecap="round"/>
          <circle cx="44" cy="20" r="2" fill="#ff3b30"/>
          <text x="32" y="54" text-anchor="middle" font-size="8" font-weight="900" fill="#ffe066">PASS 3</text>
        `;
        break;
    }

    return `
      <svg class="game-emblem-svg" width="${px}" height="${px}" viewBox="0 0 64 64" aria-hidden="true">
        ${defs}
        <circle cx="32" cy="32" r="30" fill="${bgFill}" stroke="url(#embGold)" stroke-width="2.5"/>
        <circle cx="32" cy="32" r="26.5" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1" stroke-dasharray="3 2"/>
        ${innerArt}
      </svg>
    `;
  }

  // ---- 5B. Multi-Model Game Selector Architecture (4 Interactive Selection Models) ----
  //   1. "spotlight" — Clubhouse Games / Arcade Master-Detail Stage with Live Mini-Board & Inline Variants
  //   2. "draft"     — Balatro Booster Pack / Slay the Spire 3-Card Holographic Dealer's Draft
  //   3. "carousel"  — Poker Night / Hearthstone 3D Jukebox Coverflow Wheel
  //   4. "bento"     — Jackbox / Steam Deck Categorized Bento Vault Shelves
  const PICKER_MODE_KEY = "cardnight.table.pickerMode.v2";
  let savedPickerMode = localStorage.getItem(PICKER_MODE_KEY);
  let pickerViewMode = savedPickerMode === "carousel" ? "carousel" : "spotlight";
  let activePickerCategory = "all";
  let pickerSearchQuery = "";
  let spotlightGameId = "freeEnterprise";
  let carouselIndex = 0;
  let draftTripletIds = null;
  const inlineVariantsByGame = {};

  const GAME_TELEMETRY = {
    midnightBaseball: { shelf: "baseball", cards: "7 Hole (No-Peek)", wilds: 5, wildTxt: "3s ($3) & 9s ($2) Wild", vol: 3, volTxt: "High Action" },
    daytimeBaseball: { shelf: "baseball", cards: "7-Card Stud (3d/4u)", wilds: 5, wildTxt: "3s ($3 Force) & 9s ($2)", vol: 3, volTxt: "Forced 3-Tax" },
    rainyDayBaseball: { shelf: "baseball", cards: "7-Card Stud + Rain", wilds: 5, wildTxt: "3s & 9s + Q♥/Q♦ Storm", vol: 3, volTxt: "Rain-Out Pot" },
    freeEnterprise: { shelf: "stud", cards: "7 Cards + 3 Stalls", wilds: 4, wildTxt: "All Bought Cards Wild", vol: 3, volTxt: "Market Bidding" },
    followTheQueen: { shelf: "stud", cards: "7-Card Stud (3d/4u)", wilds: 4, wildTxt: "Queens + Following Card", vol: 2, volTxt: "Shifting Wilds" },
    sevenAndWhatMakesIt: { shelf: "stud", cards: "7-Card Stud (3d/4u)", wilds: 5, wildTxt: "7s + Sum-to-7 Combos", vol: 3, volTxt: "Wild Alchemy" },
    goodBadUgly: { shelf: "stud", cards: "7 Stud + 3 Table Cards", wilds: 4, wildTxt: "Good=Wild / Bad=Strip / Ugly=Fold", vol: 3, volTxt: "Sudden Elimination" },
    mexicanSweat: { shelf: "stud", cards: "7 No-Peek Simultaneous", wilds: 3, wildTxt: "Optional Flipped Wild", vol: 2, volTxt: "7 Street Bets" },
    cincinnati: { shelf: "holdem", cards: "5 Hole + 5 Board", wilds: 2, wildTxt: "Optional Last Card Wild", vol: 2, volTxt: "Deep 10-Card Pool" },
    crissCross: { shelf: "holdem", cards: "4–5 Hole + 5 Iron Cross", wilds: 3, wildTxt: "Optional Center Wild", vol: 3, volTxt: "Single-Bar Lock" },
    deepOrDoubleScrew: { shelf: "guts", cards: "3–5 Cards (In/Out)", wilds: 4, wildTxt: "Lowest Hole Card Wild", vol: 3, volTxt: "Losers Match Pot!" },
    threeBuyFive: { shelf: "guts", cards: "3 Cards + $1 Buy", wilds: 3, wildTxt: "All 5s Wild", vol: 3, volTxt: "Losers Match Pot!" },
    fourTwoTwo: { shelf: "guts", cards: "4 Cards (+2 Bonus)", wilds: 4, wildTxt: "All 2s Wild", vol: 3, volTxt: "Losers Match Pot!" },
    threeFiveSeven: { shelf: "guts", cards: "3 → 5 → 7 Escalation", wilds: 5, wildTxt: "3s → 5s → 7s Wild", vol: 3, volTxt: "3-Stage Match Pot" },
    wildInYourHand: { shelf: "guts", cards: "5 Hole + 6 Pyramid", wilds: 5, wildTxt: "Lowest Hole + Board Wilds", vol: 3, volTxt: "Row Challenges" },
    omaha: { shelf: "holdem", cards: "4 Hole + 5 Board", wilds: 1, wildTxt: "Pure 2+3 Hold'em", vol: 2, volTxt: "Hi-Lo Split Option" },
    seattle: { shelf: "holdem", cards: "4 Hole + 5 Board", wilds: 1, wildTxt: "Pure 3+2 Hold'em", vol: 2, volTxt: "Hi-Lo Split Option" },
    boise: { shelf: "holdem", cards: "5 Hole + 5 Board", wilds: 1, wildTxt: "Flex 2+3 or 3+2", vol: 2, volTxt: "Big Hand Combos" },
    jerseyHoldem: { shelf: "holdem", cards: "5 Hole + 5 Board", wilds: 1, wildTxt: "Flex 2+3 or 3+2", vol: 2, volTxt: "Hi-Lo Split Option" },
    fiveFiveTwentyOne: { shelf: "target", cards: "Press-Your-Luck Hit/Stand", wilds: 1, wildTxt: "Face=0.5 · Ace=1 or 11", vol: 2, volTxt: "5.5 Low / 21 High" },
    sevenTwentySeven: { shelf: "target", cards: "Press-Your-Luck Hit/Stand", wilds: 1, wildTxt: "Face=0.5 · Ace=1 or 11", vol: 2, volTxt: "7 Low / 27 High" },
    threeThirtyThree: { shelf: "target", cards: "5 Hole + 5 Community", wilds: 1, wildTxt: "Face=0.5 · Ace=1 or 11", vol: 2, volTxt: "3 Low / 33 High" },
    aceyDucey: { shelf: "specials", cards: "2 Posts + 1 Mid Draw", wilds: 1, wildTxt: "Post Hit = Pay 2× Pot!", vol: 3, volTxt: "Pot-Limit Spread" },
    blindMansBluff: { shelf: "specials", cards: "1 Forehead Card", wilds: 1, wildTxt: "See Opponents' Cards Only", vol: 2, volTxt: "Pure Bluff Showdown" },
    gameOfLife: { shelf: "specials", cards: "5 Hole + 10 Good/Bad", wilds: 2, wildTxt: "Good=Claim / Bad=Poison", vol: 3, volTxt: "Rank Stripping" },
    pairOfJacksTripsToWin: { shelf: "specials", cards: "5-Card Draw (Up to 3)", wilds: 2, wildTxt: "Optional Jokers", vol: 2, volTxt: "JJ+ Open / Trips Win" },
    anaconda: { shelf: "specials", cards: "7 Dealt → Pass 3 →Trash 2", wilds: 2, wildTxt: "Optional Jokers", vol: 2, volTxt: "4 Betting Streets" },
  };

  function renderMiniBoardDiagram(gameId) {
    if (gameId === "freeEnterprise") {
      return `
        <div class="mini-board-preview mini-fe">
          <div class="mini-fe-stall"><span>$1</span><b>K♠</b></div>
          <div class="mini-fe-stall"><span>$2</span><b>7♥</b></div>
          <div class="mini-fe-stall"><span>$3</span><b>A♦</b></div>
          <div class="mini-fe-coin">WIPE<br/>$1</div>
        </div>
      `;
    }
    if (gameId === "midnightBaseball" || gameId === "daytimeBaseball" || gameId === "rainyDayBaseball") {
      return `
        <div class="mini-board-preview mini-bb">
          <div class="mini-bb-chalk">3s ($3) &amp; 9s ($2) WILD · 4s ($1) BONUS</div>
          ${gameId === "rainyDayBaseball" ? `<div class="mini-bb-queen">Q♥ RAIN-OUT!</div>` : `<div class="mini-bb-beat">⚾ Beat the Board</div>`}
        </div>
      `;
    }
    if (gameId === "fiveFiveTwentyOne" || gameId === "sevenTwentySeven" || gameId === "threeThirtyThree") {
      const low = gameId === "fiveFiveTwentyOne" ? "5.5" : gameId === "sevenTwentySeven" ? "7.0" : "3.0";
      const high = gameId === "fiveFiveTwentyOne" ? "21" : gameId === "sevenTwentySeven" ? "27" : "33";
      return `
        <div class="mini-board-preview mini-dials">
          <div class="mini-dial mini-dial-low"><span>LOW DIAL</span><strong>${low}</strong></div>
          <div class="mini-dial mini-dial-high"><span>HIGH DIAL</span><strong>${high}</strong></div>
        </div>
      `;
    }
    if (gameId === "crissCross") {
      return `
        <div class="mini-board-preview mini-cross">
          <div class="mini-cross-grid">
            <span></span><b class="mc-card">K♣</b><span></span>
            <b class="mc-card">9♦</b><b class="mc-card mc-center">★</b><b class="mc-card">Q♠</b>
            <span></span><b class="mc-card">A♥</b><span></span>
          </div>
        </div>
      `;
    }
    if (gameId === "threeFiveSeven" || gameId === "deepOrDoubleScrew" || gameId === "threeBuyFive" || gameId === "fourTwoTwo") {
      return `
        <div class="mini-board-preview mini-guts">
          <div class="mini-medallion mini-med-in">🔥 IN!</div>
          <div class="mini-guts-vs">CLASH OR FOLD</div>
          <div class="mini-medallion mini-med-out">OUT</div>
        </div>
      `;
    }
    if (gameId === "wildInYourHand") {
      return `
        <div class="mini-board-preview mini-pyramid">
          <div class="mp-row"><b class="mc-card">?</b><b class="mc-card">?</b><b class="mc-card">?</b></div>
          <div class="mp-row"><b class="mc-card">?</b><b class="mc-card">?</b></div>
          <div class="mp-row"><b class="mc-card mc-center">★</b></div>
        </div>
      `;
    }
    if (gameId === "aceyDucey") {
      return `
        <div class="mini-board-preview mini-acey">
          <b class="mc-card">3♣</b>
          <span class="mini-acey-mid">🎯 HIT BETWEEN</span>
          <b class="mc-card">K♦</b>
        </div>
      `;
    }
    if (gameId === "gameOfLife") {
      return `
        <div class="mini-board-preview mini-gol">
          <div class="mini-gol-good">🌿 GOOD ROW: Claim Card</div>
          <div class="mini-gol-bad">☠️ BAD ROW: Poison Rank</div>
        </div>
      `;
    }
    return `
      <div class="mini-board-preview mini-stud">
        <b class="mc-card">A♠</b><b class="mc-card mc-center">★W</b><b class="mc-card">K♥</b><b class="mc-card">Q♦</b><b class="mc-card">J♣</b>
      </div>
    `;
  }

  function ensureInlineVariants(entry) {
    if (!entry) return {};
    if (!inlineVariantsByGame[entry.id]) {
      inlineVariantsByGame[entry.id] = GameRegistry.defaultVariantChoices(entry);
    }
    return inlineVariantsByGame[entry.id];
  }

  function renderInlineVariantPills(entry) {
    if (!entry || !entry.variantOptions || !entry.variantOptions.length) {
      return `<div class="pv-no-variants">✓ Standard House Rules — Ready to Deal Immediately</div>`;
    }
    const current = ensureInlineVariants(entry);
    return `
      <div class="pv-variants-box">
        <div class="pv-variants-title">⚙️ DEALER'S CHOICE VARIANT OPTIONS</div>
        ${entry.variantOptions
          .map((opt) => {
            const pills = opt.choices
              .map((c, idx) => {
                const active = current[opt.key] === c.value;
                return `<button type="button" class="pv-var-pill ${active ? "pv-var-pill-active" : ""}" data-fx-var-game="${entry.id}" data-fx-var-key="${opt.key}" data-fx-var-idx="${idx}">${c.label}</button>`;
              })
              .join("");
            return `
              <div class="pv-var-group">
                <div class="pv-var-label">${opt.label}</div>
                <div class="pv-var-pills">${pills}</div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function pickDraftTriplet(gameList) {
    const g1 = gameList.filter((g) => {
      const s = (GAME_TELEMETRY[g.id] || {}).shelf;
      return s === "baseball" || s === "stud";
    });
    const g2 = gameList.filter((g) => {
      const s = (GAME_TELEMETRY[g.id] || {}).shelf;
      return s === "guts" || s === "target";
    });
    const g3 = gameList.filter((g) => {
      const s = (GAME_TELEMETRY[g.id] || {}).shelf;
      return s === "holdem" || s === "specials";
    });
    const p1 = g1[Math.floor(Math.random() * g1.length)] || gameList[0];
    const p2 = g2[Math.floor(Math.random() * g2.length)] || gameList[1];
    const p3 = g3[Math.floor(Math.random() * g3.length)] || gameList[2];
    draftTripletIds = [p1.id, p2.id, p3.id];
    return draftTripletIds;
  }

  let latestPickerCtx = null;
  let latestPickerVs = null;

  function renderRichPicker(el, vs, pickerCtx) {
    latestPickerCtx = pickerCtx;
    latestPickerVs = vs;
    const tabsWrap = document.getElementById("picker-category-tabs");

    // 1. If a game has been confirmed (e.g. AI dealer picked, or human confirmed), show the Cinematic Dealer's Call Stage
    if (pickerCtx.pendingConfirm) {
      if (tabsWrap) tabsWrap.hidden = true;
      const { entry, variantChoices, isAi } = pickerCtx.pendingConfirm;
      const data = pickerCtx.gameDataFor(entry.id);
      const telem = GAME_TELEMETRY[entry.id] || { cards: "5–7 Cards", wilds: 3, wildTxt: "House Rules", vol: 2, volTxt: "Standard" };
      const lines = pickerCtx.variantSummaryLines(entry, variantChoices);
      const dealer = vs.players.find((p) => p.id === vs.currentPickerSeatId) || vs.players[0];
      const dealerAvatar = dealer && dealer.avatarSpec ? Avatar.render(dealer.avatarSpec, 76) : "";

      el.pickerHeading.textContent = isAi ? `${dealer ? dealer.name : "The Dealer"} Calls the Game!` : `Dealer's Call Confirmed`;
      el.pickerMenu.innerHTML = `
        <div class="confirm-screen confirm-stage-v2">
          <div class="confirm-stage-top">
            ${
              isAi && dealerAvatar
                ? `<div class="confirm-dealer-badge">${dealerAvatar}<div class="confirm-dealer-speech">&ldquo;Tonight we play <strong>${entry.name}</strong>!&rdquo;</div></div>`
                : ""
            }
            <div class="confirm-game-hero-card">
              <div class="confirm-emblem-hero">${getGameEmblemSvg(entry.id, 88)}</div>
              <div class="confirm-hero-meta">
                <div class="confirm-eyebrow">${data ? data.category : "HOUSE CLASSIC"}</div>
                <h3 class="confirm-game-title">${entry.name}</h3>
                <div class="confirm-telem-strip">
                  <span class="pv-stat-pill">🃏 ${telem.cards}</span>
                  <span class="pv-stat-pill">★ ${telem.wildTxt}</span>
                  <span class="pv-stat-pill">${telem.volTxt}</span>
                </div>
              </div>
              ${renderMiniBoardDiagram(entry.id)}
            </div>
          </div>
          ${
            lines.length
              ? `<div class="confirm-variants-pillbox">${lines.map((l) => `<span class="confirm-var-chip">⚙️ ${l}</span>`).join("")}</div>`
              : ""
          }
          <div class="confirm-instructions">${pickerCtx.scriptHtml(data, entry.id)}</div>
          <div class="confirm-actions">
            ${
              isAi
                ? `
                  <button type="button" class="btn-action-call" data-confirm-ai-redraw>🎲 Dealer Redraw</button>
                  <button type="button" class="btn-action-call" data-confirm-override>🔄 Pick Game Myself</button>
                `
                : `<button type="button" class="btn-action-call" data-confirm-back>&larr; Back to Selector</button>`
            }
            <button type="button" class="btn-action-deal" data-confirm-continue>🃏 Sit &amp; Deal ${entry.name} &rarr;</button>
          </div>
        </div>
      `;
      return true;
    }

    // 2. If AI is currently deliberating (and human hasn't overridden to pick manually)
    const picker = vs.players.find((p) => p.id === vs.currentPickerSeatId);
    if ((!picker || !picker.isHuman) && !pickerCtx.humanOverridePick) {
      if (tabsWrap) tabsWrap.hidden = true;
      const name = picker ? picker.name : "Dealer";
      el.pickerHeading.textContent = `${name} is selecting from the vault...`;
      const avatarHtml = picker && picker.avatarSpec ? Avatar.render(picker.avatarSpec, 84) : "";
      el.pickerMenu.innerHTML = `
        <div class="picker-waiting-stage">
          ${avatarHtml}
          <div class="picker-waiting-title"><strong>${name}</strong> (${picker && picker.archetypeLabel ? picker.archetypeLabel : "Dealer"}) is eyeing the 27 house games&hellip;</div>
          <div class="picker-waiting-actions">
            <button type="button" class="btn-action-call" data-confirm-override>🔄 Override &amp; Pick Game Myself</button>
          </div>
        </div>
      `;
      return true;
    }

    // 3. Human Picker: Spotlight Stage is the main view, with top icon toggles for the 3D Wheel & Mystery Deal
    el.pickerHeading.textContent = "Call Tonight's Game";
    if (!spotlightGameId || !vs.gameList.some((g) => g.id === spotlightGameId)) {
      spotlightGameId = vs.gameList[0].id;
    }
    if (pickerViewMode !== "spotlight" && pickerViewMode !== "carousel") {
      pickerViewMode = "spotlight";
    }

    if (tabsWrap) {
      tabsWrap.hidden = false;
      const isWheel = pickerViewMode === "carousel";
      tabsWrap.innerHTML = `
        <div class="pv-top-toolbar" role="toolbar" aria-label="Game Selector Controls">
          <div class="pv-view-toggle-pill">
            <button type="button" class="pv-icon-btn ${!isWheel ? "pv-icon-btn-active" : ""}" data-fx-picker-mode="spotlight" title="Spotlight Stage (Master-Detail View)">
              <span class="pv-icon-glyph">🎬</span>
              <span class="pv-icon-txt">Spotlight Stage</span>
            </button>
            <button type="button" class="pv-icon-btn ${isWheel ? "pv-icon-btn-active" : ""}" data-fx-picker-mode="${isWheel ? "spotlight" : "carousel"}" title="${isWheel ? "Return to Spotlight Stage" : "Switch to 3D Jukebox Wheel"}">
              <span class="pv-icon-glyph">🎡</span>
              <span class="pv-icon-txt">3D Jukebox Wheel</span>
            </button>
          </div>
          <button type="button" class="pv-icon-btn pv-mystery-icon-btn" data-fx-random-deal title="Mystery Deal — Pick a random game from all 27!">
            <span class="pv-icon-glyph">🎲</span>
            <span class="pv-icon-txt">Mystery Deal</span>
          </button>
        </div>
      `;
    }

    // ---- RENDER MODEL 1: THE DEALER'S SPOTLIGHT STAGE (Master-Detail Arcade Cabinet) ----
    if (pickerViewMode === "spotlight") {
      const CATS = [
        { id: "all", label: "All (27)" },
        { id: "baseball", label: "⚾ Baseball" },
        { id: "stud", label: "👑 Stud" },
        { id: "guts", label: "🔥 Guts" },
        { id: "holdem", label: "🐂 Hold'em" },
        { id: "target", label: "🎯 Target" },
        { id: "specials", label: "🎭 Specials" },
      ];
      const filteredGames = vs.gameList.filter((g) => {
        const t = GAME_TELEMETRY[g.id] || {};
        if (activePickerCategory !== "all" && t.shelf !== activePickerCategory) return false;
        if (pickerSearchQuery) {
          const q = pickerSearchQuery.toLowerCase();
          const sig = (GAME_SIGNATURES[g.id] || "").toLowerCase();
          return g.name.toLowerCase().includes(q) || sig.includes(q);
        }
        return true;
      });
      const activeGameObj =
        filteredGames.find((g) => g.id === spotlightGameId) || filteredGames[0] || vs.gameList[0];
      spotlightGameId = activeGameObj.id;

      const entry = GameRegistry.get(activeGameObj.id);
      const data = pickerCtx.gameDataFor(activeGameObj.id);
      const telem = GAME_TELEMETRY[activeGameObj.id] || { cards: "5–7 Cards", wilds: 3, wildTxt: "Wilds", vol: 2, volTxt: "Standard" };
      const stars = "★".repeat(telem.wilds) + "☆".repeat(Math.max(0, 5 - telem.wilds));

      el.pickerMenu.innerHTML = `
        <div class="pv-spotlight-layout">
          <!-- Left: Cartridge Spine List -->
          <div class="pv-spotlight-sidebar">
            <div class="pv-sidebar-filter-chips">
              ${CATS.map(
                (c) =>
                  `<button type="button" class="pv-cat-chip ${c.id === activePickerCategory ? "pv-cat-chip-active" : ""}" data-fx-spot-cat="${c.id}">${c.label}</button>`
              ).join("")}
            </div>
            <div class="pv-cartridge-list">
              ${filteredGames
                .map((g) => {
                  const gt = GAME_TELEMETRY[g.id] || { wilds: 2, vol: 2, wildTxt: "" };
                  const isSel = g.id === spotlightGameId;
                  return `
                    <button type="button" class="pv-cartridge-item ${isSel ? "pv-cartridge-active" : ""}" data-fx-spotlight-select="${g.id}">
                      <span class="pv-cart-icon">${getGameEmblemSvg(g.id, 42)}</span>
                      <span class="pv-cart-body">
                        <span class="pv-cart-title">${g.name}</span>
                        <span class="pv-cart-sub">${gt.wildTxt}</span>
                      </span>
                    </button>
                  `;
                })
                .join("")}
            </div>
          </div>

          <!-- Right: Live Tabletop Spotlight Stage -->
          <div class="pv-spotlight-stage" data-cat-theme="${telem.shelf}">
            <div class="pv-stage-hero-header">
              <div class="pv-stage-emblem">${getGameEmblemSvg(entry.id, 92)}</div>
              <div class="pv-stage-title-block">
                <div class="pv-stage-category">${data ? data.category : "HOUSE GAME"}</div>
                <h3 class="pv-stage-title">${entry.name}</h3>
                <p class="pv-stage-hook">${GAME_SIGNATURES[entry.id] || ""}</p>
              </div>
            </div>

            <!-- Telemetry Strip -->
            <div class="pv-telemetry-grid">
              <div class="pv-telem-box">
                <span class="pv-telem-lbl">CARDS &amp; FORMAT</span>
                <strong class="pv-telem-val">🃏 ${telem.cards}</strong>
              </div>
              <div class="pv-telem-box">
                <span class="pv-telem-lbl">WILD FACTOR (${stars})</span>
                <strong class="pv-telem-val">★ ${telem.wildTxt}</strong>
              </div>
              <div class="pv-telem-box">
                <span class="pv-telem-lbl">POT VOLATILITY</span>
                <strong class="pv-telem-val">${telem.volTxt}</strong>
              </div>
            </div>

            <!-- Live Mini-Board Diagram -->
            <div class="pv-stage-board-showcase">
              <div class="pv-showcase-label">TABLETOP BOARD &amp; SIGNATURE PROPS PREVIEW</div>
              ${renderMiniBoardDiagram(entry.id)}
            </div>

            <!-- Inline Variant Pill Toggles -->
            ${renderInlineVariantPills(entry)}

            <!-- Dealer's Bark / Rules Summary -->
            <details class="pv-rules-drawer" ${typeof window !== "undefined" && window.innerWidth <= 768 ? "" : "open"}>
              <summary>📜 Dealer's Bark &amp; Full House Rules</summary>
              <div class="pv-rules-body">${pickerCtx.scriptHtml(data, entry.id)}</div>
            </details>

            <!-- Instant Deal CTA -->
            <div class="pv-stage-cta-row">
              <button type="button" class="btn-hero-start pv-instant-deal-btn" data-fx-deal-now="${entry.id}">
                🃏 Call &amp; Deal ${entry.name} Now &rarr;
              </button>
            </div>
          </div>
        </div>
      `;
      return true;
    }

    // ---- RENDER MODEL 2: BALATRO BOOSTER PACK / 3-CARD DEALER'S DRAFT ----
    if (pickerViewMode === "draft") {
      const slotBadges = ["⚾ WILD & ACTION SLOT", "🔥 HIGH-TENSION SLOT", "🐂 BOARD & STRATEGY SLOT"];
      const cardsHtml = draftTripletIds
        .map((id, idx) => {
          const entry = GameRegistry.get(id);
          const data = pickerCtx.gameDataFor(id);
          const telem = GAME_TELEMETRY[id] || { cards: "5–7 Cards", wilds: 3, wildTxt: "Wilds", vol: 2, volTxt: "Standard", shelf: "stud" };
          return `
            <div class="pv-draft-tarot-card" data-cat-theme="${telem.shelf}">
              <div class="pv-draft-slot-ribbon">${slotBadges[idx] || "DEALER'S PICK"}</div>
              <div class="pv-draft-emblem-wrap">${getGameEmblemSvg(id, 84)}</div>
              <h3 class="pv-draft-title">${entry.name}</h3>
              <div class="pv-draft-cat">${data ? data.category : "House Game"}</div>
              <p class="pv-draft-sig">${GAME_SIGNATURES[id] || ""}</p>
              ${renderMiniBoardDiagram(id)}
              <div class="pv-draft-stats">
                <span>🃏 ${telem.cards}</span>
                <span>★ ${telem.wildTxt}</span>
                <span>${telem.volTxt}</span>
              </div>
              ${renderInlineVariantPills(entry)}
              <button type="button" class="btn-action-deal pv-draft-deal-btn" data-fx-deal-now="${id}">
                🃏 Deal ${entry.name} &rarr;
              </button>
            </div>
          `;
        })
        .join("");

      el.pickerMenu.innerHTML = `
        <div class="pv-draft-stage">
          <div class="pv-draft-header-bar">
            <div class="pv-draft-intro">
              <strong>🃏 Dealer's 3-Card Booster Pack:</strong> No scrolling through 27 games—pick 1 of tonight's 3 balanced draws or redraw a fresh pack!
            </div>
            <button type="button" class="pv-redraw-btn" data-fx-draft-redraw>🔄 Redraw 3 New Games</button>
          </div>
          <div class="pv-draft-cards-row">
            ${cardsHtml}
          </div>
        </div>
      `;
      return true;
    }

    // ---- RENDER MODEL 3: 3D JUKEBOX COVERFLOW CAROUSEL ----
    if (pickerViewMode === "carousel") {
      const total = vs.gameList.length;
      carouselIndex = ((carouselIndex % total) + total) % total;
      const prevIdx = (carouselIndex - 1 + total) % total;
      const nextIdx = (carouselIndex + 1) % total;
      const centerGame = vs.gameList[carouselIndex];
      const prevGame = vs.gameList[prevIdx];
      const nextGame = vs.gameList[nextIdx];

      const entry = GameRegistry.get(centerGame.id);
      const data = pickerCtx.gameDataFor(centerGame.id);
      const telem = GAME_TELEMETRY[centerGame.id] || { cards: "5–7 Cards", wilds: 3, wildTxt: "Wilds", vol: 2, volTxt: "Standard", shelf: "stud" };

      el.pickerMenu.innerHTML = `
        <div class="pv-carousel-stage">
          <div class="pv-carousel-wheel">
            <button type="button" class="pv-wheel-wing pv-wheel-left" data-fx-carousel-step="-1" title="Previous: ${prevGame.name}">
              <span class="pv-wing-arrow">&larr; PREV</span>
              ${getGameEmblemSvg(prevGame.id, 62)}
              <span class="pv-wing-name">${prevGame.name}</span>
              <span class="pv-wing-sub">${(GAME_TELEMETRY[prevGame.id] || {}).wildTxt || ""}</span>
            </button>

            <div class="pv-wheel-center-card" data-cat-theme="${telem.shelf}">
              <div class="pv-wheel-counter">GAME ${carouselIndex + 1} OF ${total} &middot; ${(data && data.category) || "HOUSE CLASSIC"}</div>
              <div class="pv-wheel-hero-row">
                ${getGameEmblemSvg(entry.id, 92)}
                <div class="pv-wheel-hero-text">
                  <h3>${entry.name}</h3>
                  <p>${GAME_SIGNATURES[entry.id] || ""}</p>
                  <div class="confirm-telem-strip">
                    <span class="pv-stat-pill">🃏 ${telem.cards}</span>
                    <span class="pv-stat-pill">★ ${telem.wildTxt}</span>
                    <span class="pv-stat-pill">${telem.volTxt}</span>
                  </div>
                </div>
              </div>
              ${renderMiniBoardDiagram(entry.id)}
              ${renderInlineVariantPills(entry)}
              <div class="pv-wheel-rules">${pickerCtx.scriptHtml(data, entry.id)}</div>
              <button type="button" class="btn-hero-start pv-instant-deal-btn" data-fx-deal-now="${entry.id}">
                🃏 Call &amp; Deal ${entry.name} Now &rarr;
              </button>
            </div>

            <button type="button" class="pv-wheel-wing pv-wheel-right" data-fx-carousel-step="1" title="Next: ${nextGame.name}">
              <span class="pv-wing-arrow">NEXT &rarr;</span>
              ${getGameEmblemSvg(nextGame.id, 62)}
              <span class="pv-wing-name">${nextGame.name}</span>
              <span class="pv-wing-sub">${(GAME_TELEMETRY[nextGame.id] || {}).wildTxt || ""}</span>
            </button>
          </div>

          <div class="pv-carousel-dock">
            ${vs.gameList
              .map(
                (g, idx) => `
                  <button type="button" class="pv-dock-dot ${idx === carouselIndex ? "pv-dock-dot-active" : ""}" data-fx-carousel-jump="${idx}" title="${g.name}">
                    ${getGameEmblemSvg(g.id, 28)}
                  </button>
                `
              )
              .join("")}
          </div>
        </div>
      `;
      return true;
    }

    // ---- RENDER MODEL 4: CATEGORIZED BENTO VAULT SHELVES ----
    const SHELVES = [
      { id: "baseball", title: "⚾ The Baseball Trilogy", desc: "3s & 9s Wild, 4s Bonus Card & Rain-Out Queens" },
      { id: "stud", title: "🏪 Market & Wild Studs", desc: "Free Enterprise Stalls, Shifting Queens, 7-Sums & Good/Bad/Ugly" },
      { id: "guts", title: "🔥 High-Voltage Guts & Pyramid", desc: "Simultaneous Stay/Fold Medallions & Losers Match the Pot" },
      { id: "target", title: "🎯 Target-Sum Analog Gauges", desc: "Dual Low/High Targets (5.5 & 21, 7 & 27, 3 & 33)" },
      { id: "holdem", title: "✚ Community Cross & Hold'em", desc: "Criss Cross Iron Cross, Cincinnati, Omaha, Seattle, Boise & Jersey" },
      { id: "specials", title: "🎭 Party, Draw & Poison Specials", desc: "Acey Ducey Goalposts, Game of Life, Anaconda & Blind Man's Bluff" },
    ];

    el.pickerMenu.innerHTML = `
      <div class="pv-bento-shelves">
        ${SHELVES.map((shelf) => {
          const gamesInShelf = vs.gameList.filter((g) => (GAME_TELEMETRY[g.id] || {}).shelf === shelf.id);
          return `
            <div class="pv-bento-shelf" data-cat-theme="${shelf.id}">
              <div class="pv-shelf-header">
                <h4>${shelf.title}</h4>
                <span>${shelf.desc}</span>
              </div>
              <div class="pv-shelf-grid">
                ${gamesInShelf
                  .map((g) => {
                    const gt = GAME_TELEMETRY[g.id] || { cards: "", wildTxt: "", vol: 2 };
                    return `
                      <div class="game-pick-card pv-bento-card" data-cat-theme="${shelf.id}">
                        <div class="pv-bento-top">
                          <span class="game-pick-icon">${getGameEmblemSvg(g.id, 54)}</span>
                          <div class="pv-bento-titles">
                            <span class="game-pick-name">${g.name}</span>
                            <span class="pv-bento-sub">🃏 ${gt.cards} &middot; ${gt.volTxt || ""}</span>
                          </div>
                        </div>
                        <span class="game-pick-signature">${GAME_SIGNATURES[g.id] || ""}</span>
                        <div class="pv-bento-actions">
                          <button type="button" class="pv-bento-inspect-btn" data-fx-bento-inspect="${g.id}">🔍 Inspect &amp; Variants</button>
                          <button type="button" class="btn-action-deal pv-bento-deal-btn" data-fx-deal-now="${g.id}">Deal &rarr;</button>
                        </div>
                      </div>
                    `;
                  })
                  .join("")}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
    return true;
  }

  function enhancePickerMenu(pickerMenuEl, showTabs) {
    if (!pickerMenuEl) return;
    const confirmContinue = pickerMenuEl.querySelector("[data-confirm-continue], [data-deal-with-variants]");
    if (confirmContinue) confirmContinue.classList.add("btn-action-deal");
  }

  // ---- 6. Main Post-Render Enhancement Hook ----
  function enhanceTable(el, vs) {
    ensureToolbarControls();
    if (!vs) return;

    const gvs = vs.orchestratorViewState;
    const state = gvs ? gvs.state : null;

    // 0. Stamp Core Game Family onto #table-view & #poker-table-stadium for Unique Table Felt & Atmosphere
    const family = getGameFamily(vs.activeGameId);
    const stadium = document.getElementById("poker-table-stadium");
    if (stadium) {
      stadium.dataset.gameFamily = family;
    }
    if (el.tableView) {
      el.tableView.dataset.gameFamily = family;
    }

    // 1. Enhance Top Pot Hero with SVG Chip Stack + Surge Animation
    const potChips =
      state && state.status === "complete" && typeof state.potAtShowdown === "number"
        ? state.potAtShowdown
        : state
        ? state.pot
        : 0;
    const potDollars = ChipEconomy.chipsToDollars(potChips || 0);

    const potHero = document.getElementById("pot-hero");
    if (potHero) {
      let chipContainer = potHero.querySelector(".pot-hero-chips");
      if (!chipContainer) {
        chipContainer = document.createElement("div");
        chipContainer.className = "pot-hero-chips";
        potHero.insertBefore(chipContainer, potHero.firstChild);
      }
      chipContainer.innerHTML = renderChipStackSvg(potDollars, true);

      if (potChips > prevSnapshot.potChips && prevSnapshot.gameId === vs.activeGameId) {
        potHero.classList.remove("pot-surge-anim");
        void potHero.offsetWidth;
        potHero.classList.add("pot-surge-anim");
        Sound.chipClink();
      }
    }

    // 2. Enhance Seats (Concept 4 Reactive Persona Headers, Metallic Frames, Telemetry Icons & Card Flips)
    let anyCardFlipped = false;
    let anyWildFlipped = false;

    if (el.seats && gvs && gvs.players) {
      const seatEls = Array.from(el.seats.querySelectorAll(".seat"));
      const winnerIds = new Set([
        ...(state && state.winnerIds ? state.winnerIds : []),
        ...(state && state.highWinnerIds ? state.highWinnerIds : []),
        ...(state && state.lowWinnerIds ? state.lowWinnerIds : []),
        ...(state && state.outrightWinnerIds ? state.outrightWinnerIds : []),
        ...(state && state.winnerId ? [state.winnerId] : []),
      ]);

      seatEls.forEach((seatEl, idx) => {
        const player = gvs.players[idx];
        if (!player) return;

        seatEl.dataset.playerId = player.id;
        if (player.isHuman) {
          seatEl.classList.add("seat-is-human");
        }

        // Format Concept 4 Archetype Header ("THE FORTRESS" / "Arthur")
        const nameEl = seatEl.querySelector(".seat-name");
        if (nameEl && !player.isHuman && !nameEl.dataset.c4Enhanced) {
          nameEl.dataset.c4Enhanced = "true";
          const hasDealer = !!nameEl.querySelector(".dealer-badge");
          const archetypeTitle = (player.archetypeLabel || "TABLE REGULAR").toUpperCase();
          nameEl.innerHTML = `
            <div class="c4-archetype-title">${archetypeTitle}</div>
            <div class="c4-person-name">${hasDealer ? '<span class="dealer-badge" title="Dealer">D</span> ' : ""}${player.name}</div>
          `;
        }

        // Add compact SVG chip stack next to seat chips
        const chipsEl = seatEl.querySelector(".seat-chips");
        if (chipsEl && player.wallet) {
          const seatDollars = ChipEconomy.chipsToDollars(player.wallet.chips);
          chipsEl.innerHTML = `${renderChipStackSvg(seatDollars, true)}<span class="seat-chips-amount">$${seatDollars.toFixed(2)}</span>`;
        }

        // Committed bet chip badge + telemetry state
        const committedChips =
          state && state.bettingRound && state.bettingRound.committed
            ? state.bettingRound.committed[player.id] || 0
            : 0;
        const maxBetChips = state && state.bettingRound ? state.bettingRound.currentBetChips || 0 : 0;

        if (committedChips > 0) {
          const committedDollars = ChipEconomy.chipsToDollars(committedChips);
          const betBadge = document.createElement("div");
          betBadge.className = "seat-committed-bet";
          betBadge.innerHTML = `<span class="committed-chip-dot"></span>Bet: $${committedDollars.toFixed(2)}`;
          seatEl.appendChild(betBadge);
        }

        // Guts Stay/Fold Medallions on showdown
        if (state && state.stayDecisions && state.stayDecisions[player.id] != null && state.status === "complete") {
          const stayed = state.stayDecisions[player.id] === true;
          const med = document.createElement("div");
          med.className = `guts-medallion ${stayed ? "guts-medallion-in" : "guts-medallion-out"}`;
          med.textContent = stayed ? "🔥 IN!" : "OUT";
          seatEl.appendChild(med);
        }

        // Winner celebration state & reactive avatar mood badges
        const isWinner = state && state.status === "complete" && winnerIds.has(player.id);
        const isTurn = seatEl.classList.contains("seat-active") && (!state || state.status !== "complete");
        if (isWinner) seatEl.classList.add("seat-winner");

        // Add Concept 4 "Thinking..." top label when active turn
        if (isTurn && !seatEl.querySelector(".c4-thinking-label")) {
          const thinkLbl = document.createElement("div");
          thinkLbl.className = "c4-thinking-label";
          thinkLbl.textContent = "Thinking...";
          seatEl.insertBefore(thinkLbl, seatEl.firstChild);
        }

        const moodBadge = seatEl.querySelector(".avatar-mood-badge");
        if (moodBadge) {
          if (isWinner) {
            moodBadge.textContent = "★ WINNER";
            moodBadge.className = "avatar-mood-badge mood-winner";
            moodBadge.hidden = false;
          } else if (player.folded) {
            moodBadge.textContent = "FOLDED";
            moodBadge.className = "avatar-mood-badge mood-folded";
            moodBadge.hidden = false;
          } else if (player.busted) {
            moodBadge.textContent = "BUSTED";
            moodBadge.className = "avatar-mood-badge mood-busted";
            moodBadge.hidden = false;
          } else {
            moodBadge.hidden = true;
          }
        }

        // Concept 4 Bottom Telemetry Icon Row (Check / Fold / Call / Raise)
        if (!player.isHuman && !seatEl.querySelector(".c4-telemetry-row")) {
          const isChecked = !player.folded && state && state.bettingRound && committedChips === 0 && !isTurn;
          const isCalled = !player.folded && committedChips > 0 && committedChips < maxBetChips;
          const isRaised = !player.folded && committedChips > 0 && committedChips >= maxBetChips;
          const telem = document.createElement("div");
          telem.className = "c4-telemetry-row";
          telem.innerHTML = `
            <span class="c4-telem-icon ${isChecked ? "telem-on" : ""}" title="In Hand / Check">☑</span>
            <span class="c4-telem-icon ${player.folded ? "telem-on telem-fold" : ""}" title="Folded">✖</span>
            <span class="c4-telem-icon ${isCalled ? "telem-on" : ""}" title="Called">✆</span>
            <span class="c4-telem-icon ${isRaised ? "telem-on telem-raise" : ""}" title="Bet / Raised">⛁</span>
          `;
          seatEl.appendChild(telem);
        }

        // Check for newly flipped/dealt face-up cards in this seat
        const cardNodes = Array.from(seatEl.querySelectorAll(".seat-cards .card"));
        const faceUpNodes = cardNodes.filter((c) => !c.classList.contains("card-back"));
        const prevUp = prevSnapshot.seatUpCounts[player.id] || 0;
        if (faceUpNodes.length > prevUp && prevSnapshot.gameId === vs.activeGameId) {
          const newestCard = faceUpNodes[faceUpNodes.length - 1];
          if (newestCard) {
            newestCard.classList.add("card-just-flipped");
            anyCardFlipped = true;
            if (newestCard.querySelector(".wild-tag")) anyWildFlipped = true;
          }
        }
        prevSnapshot.seatUpCounts[player.id] = faceUpNodes.length;

        cardNodes.forEach((cNode, cIdx) => {
          cNode.style.setProperty("--card-i", String(cIdx));
          if (cNode.querySelector(".wild-tag")) {
            cNode.classList.add("card-is-wild");
          }
        });
      });
    }

    // 3. Replace Center Board (#board-hand) with Concept 3 Bespoke Interactive Tabletop Board
    if (el.boardHand) {
      renderCustomGameBoard(el.boardHand, vs, gvs);

      const boardCards = Array.from(el.boardHand.querySelectorAll(".card"));
      const faceUpBoard = boardCards.filter((c) => !c.classList.contains("card-back"));
      if (faceUpBoard.length > prevSnapshot.boardCardCount && prevSnapshot.gameId === vs.activeGameId) {
        const lastBoardCard = faceUpBoard[faceUpBoard.length - 1];
        if (lastBoardCard) {
          lastBoardCard.classList.add("card-just-flipped");
          anyCardFlipped = true;
        }
      }
      prevSnapshot.boardCardCount = faceUpBoard.length;

      boardCards.forEach((cNode) => {
        if (cNode.querySelector(".wild-tag")) cNode.classList.add("card-is-wild");
      });
    }

    // 4. Enhance Human Hand (#human-hand) — Curved Fan Geometry, Wild Shaders & Live Hand Pill
    if (el.humanHand) {
      const human = gvs && gvs.players ? gvs.players.find((p) => p.id === vs.humanId) : null;
      const isHumanFolded = !!(human && human.folded);
      el.humanHand.classList.toggle("human-hand-folded", isHumanFolded);

      const humanCards = Array.from(el.humanHand.querySelectorAll(".card"));
      const total = humanCards.length;
      const mid = (total - 1) / 2;

      const faceUpHuman = humanCards.filter((c) => !c.classList.contains("card-back"));
      if (faceUpHuman.length > prevSnapshot.humanUpCount && prevSnapshot.gameId === vs.activeGameId) {
        const newlyRevealed = faceUpHuman[faceUpHuman.length - 1];
        if (newlyRevealed) {
          newlyRevealed.classList.add("card-just-flipped");
          anyCardFlipped = true;
          if (newlyRevealed.querySelector(".wild-tag")) anyWildFlipped = true;
        }
      }
      prevSnapshot.humanUpCount = faceUpHuman.length;
      prevSnapshot.humanCardCount = total;

      humanCards.forEach((cNode, idx) => {
        const offset = idx - mid;
        cNode.style.setProperty("--fan-offset", offset.toFixed(2));
        cNode.style.setProperty("--fan-abs", Math.abs(offset).toFixed(2));
        if (cNode.querySelector(".wild-tag")) {
          cNode.classList.add("card-is-wild");
        }
      });

      let handBadge = document.getElementById("human-hand-live-badge");
      if (!handBadge && el.humanHand.parentElement) {
        handBadge = document.createElement("div");
        handBadge.id = "human-hand-live-badge";
        handBadge.className = "human-hand-live-badge";
        el.humanHand.parentElement.insertBefore(handBadge, el.humanHand);
      }
      if (handBadge) {
        const desc = describeHumanHandLive(vs, gvs);
        handBadge.innerHTML = desc;
        handBadge.hidden = !desc;
        handBadge.classList.toggle("human-hand-badge-folded", isHumanFolded);
      }
    }

    // 5. Enhance Action Panel Buttons & Game Picker Cards
    enhanceActionButtons(el.actionPanel);
    enhancePickerMenu(el.pickerMenu);

    // 6. Trigger Contextual Audio Cues on State Transitions
    if (state && state.status === "complete" && prevSnapshot.status !== "complete") {
      Sound.winFanfare();
    } else if (anyWildFlipped) {
      Sound.wildChime();
    } else if (anyCardFlipped) {
      Sound.cardFlip();
    }

    prevSnapshot.gameId = vs.activeGameId;
    prevSnapshot.potChips = potChips || 0;
    prevSnapshot.status = state ? state.status : null;
  }

  // Delegated click handler for interactive Concept 3 Board Props (#board-hand)
  document.addEventListener("click", (e) => {
    const buyStall = e.target.closest("[data-fx-enterprise-buy]");
    if (buyStall && !buyStall.disabled && typeof TableNight !== "undefined" && TableNight.orchestrator) {
      const slotIdx = Number(buyStall.getAttribute("data-fx-enterprise-buy"));
      Sound.chipClink();
      TableNight.orchestrator.humanResolveEnterprise("buy", slotIdx);
      return;
    }
    const wipeCoin = e.target.closest("[data-fx-enterprise-wipe]");
    if (wipeCoin && !wipeCoin.disabled && typeof TableNight !== "undefined" && TableNight.orchestrator) {
      Sound.chipClink();
      TableNight.orchestrator.humanResolveEnterprise("wipe");
      return;
    }
    const freeDeck = e.target.closest("[data-fx-enterprise-free]");
    if (freeDeck && !freeDeck.disabled && typeof TableNight !== "undefined" && TableNight.orchestrator) {
      Sound.cardFlip();
      TableNight.orchestrator.humanResolveEnterprise("free");
      return;
    }
    const gutsMedallion = e.target.closest("[data-fx-stay]");
    if (gutsMedallion && !gutsMedallion.disabled && typeof TableNight !== "undefined" && TableNight.orchestrator) {
      const stayIn = gutsMedallion.getAttribute("data-fx-stay") === "yes";
      Sound.chipClink();
      TableNight.orchestrator.humanDeclare(stayIn);
      return;
    }

    // ---- 4-Model Game Picker Interactive Delegated Handlers ----
    const modeBtn = e.target.closest("[data-fx-picker-mode]");
    if (modeBtn && latestPickerCtx && latestPickerVs) {
      pickerViewMode = modeBtn.getAttribute("data-fx-picker-mode");
      localStorage.setItem(PICKER_MODE_KEY, pickerViewMode);
      Sound.cardFlip();
      latestPickerCtx.rerender();
      return;
    }

    const spotCatBtn = e.target.closest("[data-fx-spot-cat]");
    if (spotCatBtn && latestPickerCtx) {
      activePickerCategory = spotCatBtn.getAttribute("data-fx-spot-cat");
      Sound.cardFlip();
      latestPickerCtx.rerender();
      return;
    }

    const spotSelectBtn = e.target.closest("[data-fx-spotlight-select]");
    if (spotSelectBtn && latestPickerCtx) {
      spotlightGameId = spotSelectBtn.getAttribute("data-fx-spotlight-select");
      Sound.cardFlip();
      latestPickerCtx.rerender();
      return;
    }

    const varPillBtn = e.target.closest("[data-fx-var-game]");
    if (varPillBtn && latestPickerCtx) {
      const gId = varPillBtn.getAttribute("data-fx-var-game");
      const varKey = varPillBtn.getAttribute("data-fx-var-key");
      const varIdx = Number(varPillBtn.getAttribute("data-fx-var-idx"));
      const entry = GameRegistry.get(gId);
      if (entry && entry.variantOptions) {
        const opt = entry.variantOptions.find((o) => o.key === varKey);
        if (opt && opt.choices[varIdx]) {
          const current = ensureInlineVariants(entry);
          current[varKey] = opt.choices[varIdx].value;
          Sound.chipClink();
          latestPickerCtx.rerender();
        }
      }
      return;
    }

    const dealNowBtn = e.target.closest("[data-fx-deal-now]");
    if (dealNowBtn && latestPickerCtx) {
      const gId = dealNowBtn.getAttribute("data-fx-deal-now");
      const entry = GameRegistry.get(gId);
      if (entry) {
        const choices = ensureInlineVariants(entry);
        Sound.winFanfare();
        latestPickerCtx.onCallGameNow(entry.id, choices);
      }
      return;
    }

    const randomDealBtn = e.target.closest("[data-fx-random-deal]");
    if (randomDealBtn && latestPickerCtx && latestPickerVs) {
      const list = latestPickerVs.gameList;
      const rand = list[Math.floor(Math.random() * list.length)];
      const entry = GameRegistry.get(rand.id);
      if (entry) {
        Sound.wildChime();
        latestPickerCtx.onPreviewConfirm(entry, GameRegistry.defaultVariantChoices(entry));
      }
      return;
    }

    const draftRedrawBtn = e.target.closest("[data-fx-draft-redraw]");
    if (draftRedrawBtn && latestPickerCtx && latestPickerVs) {
      pickDraftTriplet(latestPickerVs.gameList);
      Sound.cardFlip();
      latestPickerCtx.rerender();
      return;
    }

    const carouselStepBtn = e.target.closest("[data-fx-carousel-step]");
    if (carouselStepBtn && latestPickerCtx) {
      carouselIndex += Number(carouselStepBtn.getAttribute("data-fx-carousel-step"));
      Sound.cardFlip();
      latestPickerCtx.rerender();
      return;
    }

    const carouselJumpBtn = e.target.closest("[data-fx-carousel-jump]");
    if (carouselJumpBtn && latestPickerCtx) {
      carouselIndex = Number(carouselJumpBtn.getAttribute("data-fx-carousel-jump"));
      Sound.cardFlip();
      latestPickerCtx.rerender();
      return;
    }

    const bentoInspectBtn = e.target.closest("[data-fx-bento-inspect]");
    if (bentoInspectBtn && latestPickerCtx) {
      spotlightGameId = bentoInspectBtn.getAttribute("data-fx-bento-inspect");
      pickerViewMode = "spotlight";
      localStorage.setItem(PICKER_MODE_KEY, "spotlight");
      Sound.cardFlip();
      latestPickerCtx.rerender();
      return;
    }
  });

  // Keyboard shortcuts during live table play (F = Fold, C = Call/Check, R = Raise/Buy, 1-7 = Flip card)
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "select" || tag === "textarea") return;
    const tableView = document.getElementById("table-view");
    if (!tableView || tableView.hidden) return;
    const actionPanel = document.getElementById("action-panel");
    if (!actionPanel) return;

    const key = e.key.toLowerCase();
    if (key === "f") {
      const foldBtn = actionPanel.querySelector(".btn-action-fold:not(:disabled)");
      if (foldBtn) {
        e.preventDefault();
        foldBtn.click();
      }
    } else if (key === "c") {
      const callBtn = actionPanel.querySelector(".btn-action-call:not(:disabled)");
      if (callBtn) {
        e.preventDefault();
        callBtn.click();
      }
    } else if (key === "r") {
      const raiseBtn = actionPanel.querySelector(".btn-action-raise:not(:disabled)");
      if (raiseBtn) {
        e.preventDefault();
        raiseBtn.click();
      }
    } else if (key >= "1" && key <= "7") {
      const idx = Number(key) - 1;
      const flipCard = document.querySelector(`#human-hand [data-flip-index="${idx}"]`);
      if (flipCard) {
        e.preventDefault();
        flipCard.click();
      }
    }
  });

  applyTheme(currentTheme);
  applyLayoutMode(currentLayout);
  applyUiScale(currentScale);

  return {
    enhanceTable,
    enhancePickerMenu,
    renderRichPicker,
    getGameEmblemSvg,
    renderChipStackSvg,
    Sound,
  };
})();

(function () {
  "use strict";

  const CATEGORY_ORDER = [
    "Guts",
    "Stud-based",
    "Texas Hold'em variant",
    "Baseball",
    "Other",
  ];

  const state = {
    category: "All",
    includeNew: false,
    players: 6,
  };

  const el = {
    listView: document.getElementById("list-view"),
    detailView: document.getElementById("detail-view"),
    grid: document.getElementById("game-grid"),
    emptyState: document.getElementById("empty-state"),
    categoryFilters: document.getElementById("category-filters"),
    playerCount: document.getElementById("player-count"),
    includeNew: document.getElementById("include-new"),
    pickButton: document.getElementById("pick-for-me"),
    backButton: document.getElementById("back-button"),
    detailContent: document.getElementById("detail-content"),
  };

  function gamesById(id) {
    return GAMES.find((g) => g.id === id);
  }

  function visibleGames() {
    return GAMES.filter((g) => {
      if (state.category !== "All" && g.category !== state.category) return false;
      if (g.isNew && !state.includeNew) return false;
      return true;
    });
  }

  function buildCategoryFilters() {
    const categories = ["All", ...CATEGORY_ORDER.filter((c) => GAMES.some((g) => g.category === c))];
    el.categoryFilters.innerHTML = "";
    categories.forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter-chip" + (state.category === cat ? " active" : "");
      btn.textContent = cat;
      btn.addEventListener("click", () => {
        state.category = cat;
        buildCategoryFilters();
        renderGrid();
      });
      el.categoryFilters.appendChild(btn);
    });
  }

  function cardMarkup(game) {
    const tags = [`<span class="tag">${game.category}</span>`];
    if (game.isNew) tags.push(`<span class="tag new">New</span>`);
    if (typeof game.resolvePlayers === "function") tags.push(`<span class="tag">adapts to players</span>`);
    return `
      <button class="game-card" data-id="${game.id}">
        <div class="icon">${game.icon}</div>
        <div class="name">${game.name}</div>
        <div class="meta">${tags.join("")}</div>
      </button>
    `;
  }

  function renderGrid() {
    const games = visibleGames();
    el.grid.innerHTML = games.map(cardMarkup).join("");
    el.emptyState.hidden = games.length > 0;
    el.grid.querySelectorAll(".game-card").forEach((card) => {
      card.addEventListener("click", () => {
        location.hash = "#/game/" + card.dataset.id;
      });
    });
  }

  function listBlock(title, items) {
    if (!items || items.length === 0) return "";
    return `
      <div class="detail-section">
        <h3>${title}</h3>
        <ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>
      </div>
    `;
  }

  function scriptBlock(title, script) {
    if (!script) return "";
    const body = Array.isArray(script)
      ? script.map((s) => `
          <div class="dealer-script-labeled">
            <div class="dealer-script-label">${s.label}</div>
            <div class="dealer-script">${s.text}</div>
          </div>
        `).join("")
      : `<div class="dealer-script">${script}</div>`;
    return `
      <div class="detail-section">
        <h3>${title}</h3>
        ${body}
      </div>
    `;
  }

  function textBlock(title, text) {
    if (!text) return "";
    return `
      <div class="detail-section">
        <h3>${title}</h3>
        <p>${text}</p>
      </div>
    `;
  }

  function renderDetail(id) {
    const game = gamesById(id);
    if (!game) {
      location.hash = "";
      return;
    }

    const tags = [`<span class="tag">${game.category}</span>`];
    if (game.isNew) tags.push(`<span class="tag new">New — not yet in our rotation</span>`);
    tags.push(`<span class="tag">${game.players.min}–${game.players.max} players</span>`);

    const playerNote = typeof game.resolvePlayers === "function"
      ? `<div class="player-note">👥 ${game.resolvePlayers(state.players)}</div>`
      : (game.players.note ? `<div class="player-note">👥 ${game.players.note}</div>` : "");

    el.detailContent.innerHTML = `
      <div class="detail-head">
        <div class="icon">${game.icon}</div>
        <div>
          <h2>${game.name}</h2>
          <div class="meta">${tags.join("")}</div>
        </div>
      </div>

      ${listBlock("Before You Deal", game.before)}
      ${playerNote}
      ${textBlock("Setup", game.setup)}
      ${textBlock("Gameplay", game.gameplay)}
      ${textBlock("How to Win", game.win)}

      ${scriptBlock("How to Describe It", game.script)}

      ${listBlock("Key Decisions", game.keyDecisions)}
      ${listBlock("Don't Forget to Repeat", game.repeats)}
    `;
  }

  function showListView() {
    el.detailView.hidden = true;
    el.listView.hidden = false;
  }

  function showDetailView(id) {
    renderDetail(id);
    el.listView.hidden = true;
    el.detailView.hidden = false;
    window.scrollTo(0, 0);
  }

  function route() {
    const hash = location.hash;
    const match = hash.match(/^#\/game\/(.+)$/);
    if (match) {
      showDetailView(decodeURIComponent(match[1]));
    } else {
      showListView();
    }
  }

  el.playerCount.addEventListener("change", () => {
    const n = parseInt(el.playerCount.value, 10);
    state.players = Number.isFinite(n) && n > 0 ? n : state.players;
    // Live-update the detail view if it's currently showing a game that adapts to player count.
    const match = location.hash.match(/^#\/game\/(.+)$/);
    if (match) renderDetail(decodeURIComponent(match[1]));
  });

  el.includeNew.addEventListener("change", () => {
    state.includeNew = el.includeNew.checked;
    renderGrid();
  });

  el.pickButton.addEventListener("click", () => {
    const games = visibleGames();
    if (games.length === 0) return;
    const pick = games[Math.floor(Math.random() * games.length)];
    location.hash = "#/game/" + pick.id;
  });

  el.backButton.addEventListener("click", () => {
    location.hash = "";
  });

  window.addEventListener("hashchange", route);

  // Init
  state.players = parseInt(el.playerCount.value, 10) || 6;
  buildCategoryFilters();
  renderGrid();
  route();
})();

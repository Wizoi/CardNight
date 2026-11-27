"use strict";

// First-run app tutorial -- explains the APP's own touch mechanics (tap to
// select/arrange, the action panel, the more menu), not any one game's
// rules (those already live in app/games-data.js's per-game script, shown
// via the in-game info toggle and the "Rules" link). A deliberately small,
// paged overlay: a handful of steps, Back/Next/Skip, shown automatically
// once on first visit and re-launchable anytime from the setup screen's
// help link and the in-game more menu.
const Tutorial = (function () {
  const SEEN_KEY = "cardnight.table.tutorialSeen.v1";

  const STEPS = [
    {
      icon: "🃏",
      title: "Welcome to the table",
      body:
        "This is a full night of poker against computer opponents: sit down, cut for deal, and play through the house's 27 games. This quick tour covers how the APP works -- tapping, menus, where things live -- not any one game's rules (each game explains its own rules once you're playing it).",
    },
    {
      icon: "🪑",
      title: "Setting up your table",
      body:
        "On the setup screen, tap any seat tile to swap in a different regular, or use the +/- to add or remove AI seats (5-8 players total). Pick a buy-in, a rebuy cap, and a Dealer's Choice mode, then tap \"Sit Down at the Table.\"",
    },
    {
      icon: "🎴",
      title: "Cutting for deal",
      body:
        "Tap any face-down card in the spread to draw it. Highest card gets the dealer button -- and, in Dealer's Choice mode, picks the first game. A tie reshuffles just the tied cards for a re-cut.",
    },
    {
      icon: "🎯",
      title: "Picking a game",
      body:
        "When it's your turn to pick, tap a game card in the grid -- some games ask a follow-up question about house variants first. When it's an AI's turn, just wait for their pick; you'll see what they chose before the hand starts.",
    },
    {
      icon: "✋",
      title: "Your turn at the table",
      body:
        "Whenever it's your move -- bet, fold, hit, buy a wildcard, discard -- the choices appear in the action panel just below your hand. If a game asks you to discard, pass, or arrange cards, tap the cards themselves (in your own hand) to select them in order; a tag on each card shows what you picked.",
    },
    {
      icon: "⋯",
      title: "The rest of the controls",
      body:
        "The pot is always shown at the top -- your own chip stack is on your seat tile, right at the table. Tap the ⓘ next to the game name for a plain-English explanation to read aloud. Tap ⋯ to change games, see the chip history &amp; regulars ledger, or cash out back to the main screen.",
    },
    {
      icon: "👍",
      title: "That's it",
      body:
        "You can replay this tour anytime from the setup screen's \"How this app works\" link, or from the ⋯ menu during a game. Good luck at the table.",
    },
  ];

  let stepIndex = 0;
  let el = null;

  function hasSeenTutorial() {
    try {
      return localStorage.getItem(SEEN_KEY) === "1";
    } catch (err) {
      return false;
    }
  }

  function markSeen() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch (err) {
      // localStorage unavailable (private mode, etc.) -- just means the
      // tour reappears next visit, not a functional problem.
    }
  }

  function ensureModal() {
    if (el) return el;
    const modal = document.createElement("div");
    modal.id = "tutorial-modal";
    modal.hidden = true;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "tutorial-title");
    modal.innerHTML =
      '<div id="tutorial-modal-content">' +
      '<div id="tutorial-dots"></div>' +
      '<div id="tutorial-icon"></div>' +
      '<h2 id="tutorial-title"></h2>' +
      '<p id="tutorial-body"></p>' +
      '<div id="tutorial-actions">' +
      '<button type="button" id="tutorial-skip-btn">Skip tour</button>' +
      '<div id="tutorial-nav">' +
      '<button type="button" id="tutorial-back-btn">&larr; Back</button>' +
      '<button type="button" id="tutorial-next-btn" class="btn-action-deal">Next &rarr;</button>' +
      "</div>" +
      "</div>" +
      "</div>";
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        close();
        return;
      }
      if (e.target.closest("#tutorial-skip-btn")) {
        close();
        return;
      }
      if (e.target.closest("#tutorial-back-btn")) {
        goTo(stepIndex - 1);
        return;
      }
      if (e.target.closest("#tutorial-next-btn")) {
        if (stepIndex >= STEPS.length - 1) {
          close();
        } else {
          goTo(stepIndex + 1);
        }
        return;
      }
      const dot = e.target.closest("[data-tutorial-dot]");
      if (dot) {
        goTo(Number(dot.getAttribute("data-tutorial-dot")));
      }
    });

    el = {
      modal,
      dots: modal.querySelector("#tutorial-dots"),
      icon: modal.querySelector("#tutorial-icon"),
      title: modal.querySelector("#tutorial-title"),
      body: modal.querySelector("#tutorial-body"),
      backBtn: modal.querySelector("#tutorial-back-btn"),
      nextBtn: modal.querySelector("#tutorial-next-btn"),
    };
    return el;
  }

  function render() {
    const step = STEPS[stepIndex];
    el.icon.textContent = step.icon;
    el.title.textContent = step.title;
    el.body.innerHTML = step.body;
    el.backBtn.hidden = stepIndex === 0;
    el.nextBtn.textContent = stepIndex === STEPS.length - 1 ? "Got it" : "Next →";
    el.dots.innerHTML = STEPS.map((_, i) => {
      const cls = i === stepIndex ? "tutorial-dot tutorial-dot-active" : "tutorial-dot";
      return `<button type="button" class="${cls}" data-tutorial-dot="${i}" aria-label="Step ${i + 1}"></button>`;
    }).join("");
  }

  function goTo(index) {
    stepIndex = Math.max(0, Math.min(STEPS.length - 1, index));
    render();
  }

  function open() {
    ensureModal();
    stepIndex = 0;
    render();
    el.modal.hidden = false;
  }

  function close() {
    if (el) el.modal.hidden = true;
    markSeen();
  }

  function maybeAutoOpen() {
    if (!hasSeenTutorial()) open();
  }

  return { open, close, maybeAutoOpen, hasSeenTutorial };
})();

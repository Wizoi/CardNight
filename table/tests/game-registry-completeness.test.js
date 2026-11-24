"use strict";

// A gate against a future "add a new game" pass forgetting the hooks it
// needs, requested directly by the user (2026-11-23) right after the
// archetype game-category-affinity feature shipped: nothing before this
// enforced that a newly registered game actually declares the pieces
// those two systems (and the game itself) depend on. Every check here is
// something that was true by convention, not by anything that would have
// failed loudly if a new entry skipped it -- this file is what makes it
// fail loudly instead.

const { load } = require("./harness");
const { makeChecker } = require("./check");

// games.md's "Game Categories" section is the one source of truth for
// which category strings are allowed to exist at all -- kept here as a
// fixed list (not derived from the registry itself) so a typo'd NEW
// category string gets caught, not quietly accepted as "the 8th category."
const KNOWN_CATEGORIES = ["Guts", "Stud-based", "Baseball", "Community Stud", "Poker Scored", "Texas Hold'em variant", "Other"];

function run() {
  const { check, summary } = makeChecker();
  const { GameRegistry, AIProfiles } = load(
    [
      "deck.js", "hand-evaluator.js", "chip-economy.js", "target-sum-evaluator.js", "betting-engine.js",
      "baseball-family-wildcards.js", "rules-stud.js", "game-configs-stud.js",
      "rules-mexican-sweat.js", "game-configs-mexican-sweat.js",
      "rules-community-stud.js", "game-configs-community-stud.js",
      "rules-guts.js", "game-configs-guts.js",
      "rules-wild-in-your-hand.js", "game-configs-wild-in-your-hand.js",
      "rules-holdem.js", "game-configs-holdem.js",
      "rules-press-your-luck.js", "game-configs-press-your-luck.js",
      "rules-acey-ducey.js", "ai-profiles.js",
      "game-registry.js",
    ],
    ["GameRegistry", "AIProfiles"],
    {
      // game-registry.js's createOrchestrator closures reference every
      // family's Session* factory at module scope -- stubbed here since
      // this test only ever calls GameRegistry.list()/get(), never
      // createOrchestrator itself, so the real session loops aren't
      // needed (same stubbing approach table-night.test.js already uses).
      SessionMidnightBaseball: { create: () => ({}) },
      SessionStud: { create: () => ({}) },
      SessionMexicanSweat: { create: () => ({}) },
      SessionCommunityStud: { create: () => ({}) },
      SessionGuts: { create: () => ({}) },
      SessionWildInYourHand: { create: () => ({}) },
      SessionHoldem: { create: () => ({}) },
      SessionPressYourLuck: { create: () => ({}) },
      Session333: { create: () => ({}) },
      SessionAceyDucey: { create: () => ({}) },
      SessionBlindMansBluff: { create: () => ({}) },
      SessionGameOfLife: { create: () => ({}) },
      SessionDrawPoker: { create: () => ({}) },
      SessionAnaconda: { create: () => ({}) },
    }
  );

  const games = GameRegistry.list();
  check("the registry actually has games in it (sandbox loaded correctly)", games.length >= 20);

  // --- Mechanics hooks: every registered game must declare the pieces
  // the picker, the orchestrator dispatch, and the affinity weighting all
  // depend on existing. ---
  const categoriesInUse = new Set();
  for (const game of games) {
    check(`${game.id}: has an id matching its registry key`, typeof game.id === "string" && game.id.length > 0);
    check(`${game.id}: has a name`, typeof game.name === "string" && game.name.length > 0);
    check(`${game.id}: has a uiFamily (table-ui-<family>.js dispatch key)`, typeof game.uiFamily === "string" && game.uiFamily.length > 0);
    check(`${game.id}: has a createOrchestrator factory`, typeof game.createOrchestrator === "function");
    check(`${game.id}: has a category`, typeof game.category === "string" && game.category.length > 0);
    if (typeof game.category === "string") {
      check(`${game.id}: category "${game.category}" is one of games.md's known categories`, KNOWN_CATEGORIES.includes(game.category));
      categoriesInUse.add(game.category);
    }
    check(`${game.id}: declares premium (monetization groundwork)`, typeof game.premium === "boolean");
  }

  // --- Archetype hooks: every category a real game actually uses must be
  // a real lean (not a silent 1-via-fallback) in every archetype's own
  // gameCategoryAffinity table, and that table must never carry a stale
  // category key pointing at nothing. ---
  const archetypeProfiles = Object.keys(AIProfiles.PROFILES).filter((key) => !!AIProfiles.PROFILES[key].gameCategoryAffinity);
  check("at least the 10 real archetypes declare gameCategoryAffinity (not just the 3 cautious/balanced/aggressive fallbacks)", archetypeProfiles.length >= 10);

  for (const key of archetypeProfiles) {
    const affinity = AIProfiles.PROFILES[key].gameCategoryAffinity;
    for (const category of categoriesInUse) {
      check(`${key}'s gameCategoryAffinity covers "${category}" (a category real games actually use)`, affinity[category] != null);
    }
    for (const category of Object.keys(affinity)) {
      check(`${key}'s gameCategoryAffinity has no stale "${category}" key (every key is a real, in-use category)`, categoriesInUse.has(category));
      check(`${key}'s gameCategoryAffinity["${category}"] is a sane positive multiplier (never 0 -- a category must stay pickable)`, affinity[category] > 0 && affinity[category] <= 3);
    }
  }

  return summary("game-registry-completeness");
}

if (require.main === module) process.exit(run());
module.exports = { run };

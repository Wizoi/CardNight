"use strict";

// Helpers over the TABLE_PEOPLE roster (table-people-data.js) — filtering for
// the setup-screen picker, and a fixed archetype-to-AI-profile mapping.
const TablePeople = (function () {
  // Flavor/identity (name, avatar, backstory) is far richer than this, but
  // actual gameplay decisions still run through the existing three AI
  // profiles (Cautious/Balanced/Aggressive) until a deeper per-archetype
  // decision engine exists — this is today's deliberately simple bridge.
  const ARCHETYPE_PROFILE = {
    "the-calculator": "balanced",
    "live-wire": "aggressive",
    fortress: "cautious",
    storm: "aggressive",
    diplomat: "balanced",
    wall: "balanced",
    statistician: "balanced",
    "streak-chaser": "aggressive",
    subversive: "aggressive",
    "steady-hand": "balanced",
  };

  function getById(id) {
    return TABLE_PEOPLE.find((p) => p.id === id) || null;
  }

  function profileFor(archetypeId) {
    return ARCHETYPE_PROFILE[archetypeId] || "balanced";
  }

  function archetypeList() {
    const seen = new Map();
    for (const p of TABLE_PEOPLE) {
      if (!seen.has(p.archetypeId)) seen.set(p.archetypeId, p.archetypeLabel);
    }
    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  }

  function filter(opts) {
    opts = opts || {};
    const q = (opts.search || "").trim().toLowerCase();
    return TABLE_PEOPLE.filter((p) => {
      if (opts.archetypeId && p.archetypeId !== opts.archetypeId) return false;
      if (opts.pronouns && p.pronouns !== opts.pronouns) return false;
      if (
        q &&
        !(p.name.toLowerCase().includes(q) || p.oneLiner.toLowerCase().includes(q) || p.archetypeLabel.toLowerCase().includes(q))
      ) {
        return false;
      }
      return true;
    });
  }

  // Picks a random person not already seated elsewhere this session, falling
  // back to the full roster if everyone's somehow already taken (more seats
  // than roster entries shouldn't happen at 8 max seats / 30 people, but stay
  // safe rather than returning null).
  function randomUnused(excludeIds) {
    excludeIds = excludeIds || [];
    const pool = TABLE_PEOPLE.filter((p) => !excludeIds.includes(p.id));
    const source = pool.length > 0 ? pool : TABLE_PEOPLE;
    return source[Math.floor(Math.random() * source.length)];
  }

  return { getById, profileFor, archetypeList, filter, randomUnused };
})();

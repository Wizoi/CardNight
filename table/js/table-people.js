"use strict";

// Helpers over the TABLE_PEOPLE roster (table-people-data.js) — filtering for
// the setup-screen picker, and a fixed archetype-to-AI-profile mapping.
const TablePeople = (function () {
  // Each archetype maps to its own dedicated AIProfiles entry (2026-08-28) --
  // previously several archetypes shared one of only 3 buckets (5 of 10
  // landed on "balanced" and played identically). See ai-profiles.js's
  // file-level comment for the tuning rationale and the two archetypes
  // (storm, streak-chaser) whose real trait is state-dependent and only
  // approximated by a fixed baseline here.
  const ARCHETYPE_PROFILE = {
    "the-calculator": "the-calculator",
    "live-wire": "live-wire",
    fortress: "fortress",
    storm: "storm",
    diplomat: "diplomat",
    wall: "wall",
    statistician: "statistician",
    "streak-chaser": "streak-chaser",
    subversive: "subversive",
    "steady-hand": "steady-hand",
  };

  // Purely a badge-coloring bucket, kept separate from the actual AIProfiles
  // decision data above -- lets the setup UI's play-style badge still show a
  // quick tight/loose/moderate visual grouping (reusing the original three
  // CSS colors) even though each archetype now has its own distinct profile
  // and label text underneath.
  const TEMPERAMENT_CLASS = {
    "the-calculator": "cautious",
    fortress: "cautious",
    statistician: "cautious",
    "steady-hand": "cautious",
    diplomat: "balanced",
    wall: "balanced",
    "live-wire": "aggressive",
    storm: "aggressive",
    "streak-chaser": "aggressive",
    subversive: "aggressive",
  };

  function getById(id) {
    return TABLE_PEOPLE.find((p) => p.id === id) || null;
  }

  function profileFor(archetypeId) {
    return ARCHETYPE_PROFILE[archetypeId] || "balanced";
  }

  function temperamentClassFor(archetypeId) {
    return TEMPERAMENT_CLASS[archetypeId] || "balanced";
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

  return { getById, profileFor, temperamentClassFor, archetypeList, filter, randomUnused };
})();

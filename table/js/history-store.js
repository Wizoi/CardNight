"use strict";

// Day-over-day chip history, persisted to localStorage (no server/build to lean
// on). Only the human player's day is ever recorded here.
const HistoryStore = (function () {
  const STORAGE_KEY = "cardnight.table.history.v1";

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { version: 1, days: [] };
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.days)) return { version: 1, days: [] };
      return parsed;
    } catch (err) {
      console.error("Failed to read table history from localStorage", err);
      return { version: 1, days: [] };
    }
  }

  function save(history) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }

  function todayDateString() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // One per SITTING, not one per calendar day -- a real nightId generated
  // once when a night starts (table-night.js's init()), not derived from
  // the date at all. Two real bugs this fixes, both caught by a live
  // design review rather than guessed at: (1) a second sitting on the same
  // calendar day used to silently overwrite the first's already-recorded
  // result, since both upserted under the same bare date key; (2) resuming
  // a saved night after midnight used to re-derive "today" fresh on
  // restore, splitting one sitting's history across two different date
  // rows and double-counting it in regularsSummary below. table-night.js
  // now generates this once in init() and carries it through snapshot()/
  // restore() unchanged for the sitting's whole lifetime.
  function generateNightId() {
    return `night-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // Upserts a sitting's entry by nightId so re-saving mid-session (e.g.
  // after each rebuy) always leaves exactly one row per sitting. Entries
  // from before nightId existed have none -- matched by date instead, so
  // those legacy rows keep their original one-row-per-day behavior rather
  // than silently duplicating the moment this code ships.
  function upsertDay(history, dayEntry) {
    const idx = dayEntry.nightId
      ? history.days.findIndex((d) => d.nightId === dayEntry.nightId)
      : history.days.findIndex((d) => d.date === dayEntry.date && !d.nightId);
    if (idx >= 0) history.days[idx] = dayEntry;
    else history.days.push(dayEntry);
    history.days.sort((a, b) => (a.date < b.date ? 1 : -1));
    save(history);
    return history;
  }

  function getDay(history, date) {
    return history.days.find((d) => d.date === date) || null;
  }

  // Aggregates each day's recorded opponents (see session.js's recordDayProgress)
  // into a per-person running total across every sitting, so a group of regulars
  // can see cumulative hands/net rather than just one night at a time. Each day
  // is upserted as a single entry (re-saves during a sitting overwrite that same
  // day's row rather than appending), so summing one contribution per day here
  // is exactly the across-days total, not a double count.
  function regularsSummary(history) {
    const byId = new Map();
    for (const day of history.days) {
      if (!Array.isArray(day.tablePeople)) continue;
      for (const person of day.tablePeople) {
        const existing = byId.get(person.id) || {
          id: person.id,
          name: person.name,
          archetypeLabel: person.archetypeLabel,
          pronouns: person.pronouns,
          sessionsPlayed: 0,
          handsWon: 0,
          netDollars: 0,
          lastPlayedDate: day.date,
        };
        existing.sessionsPlayed += 1;
        existing.handsWon += person.handsWon;
        existing.netDollars += person.netDollars;
        if (day.date > existing.lastPlayedDate) existing.lastPlayedDate = day.date;
        byId.set(person.id, existing);
      }
    }
    return Array.from(byId.values()).sort((a, b) => (a.lastPlayedDate < b.lastPlayedDate ? 1 : -1));
  }

  // The single biggest gap a live design review found in the History
  // view: no lifetime summary anywhere, so a player had to add up every
  // row by hand to answer "am I up or down overall?" -- the first thing
  // any real bankroll tracker leads with. Purely additive, computed fresh
  // from history.days each time rather than stored, so it can't drift out
  // of sync with the rows it's summarizing. Only counts SETTLED nights
  // (cashedOutDollars != null) for win/loss/best/worst -- a night still
  // "(in progress)" has no final result yet to count one way or the
  // other, the same reasoning the History view's own "(in progress)"
  // label already uses.
  function lifetimeSummary(history) {
    const settled = history.days.filter((d) => d.cashedOutDollars != null);
    const totalNet = history.days.reduce((s, d) => s + d.net, 0);
    const nightsPlayed = history.days.length;
    const winningNights = settled.filter((d) => d.net > 0).length;
    let bestNight = null;
    let worstNight = null;
    for (const d of settled) {
      if (!bestNight || d.net > bestNight.net) bestNight = d;
      if (!worstNight || d.net < worstNight.net) worstNight = d;
    }
    return {
      totalNet,
      nightsPlayed,
      settledNights: settled.length,
      winningNights,
      winRatePct: settled.length ? Math.round((winningNights / settled.length) * 100) : null,
      bestNight,
      worstNight,
    };
  }

  function exportAsJSON(history) {
    return JSON.stringify(history, null, 2);
  }

  function downloadExport(history) {
    const blob = new Blob([exportAsJSON(history)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cardnight-table-history-${todayDateString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { load, save, todayDateString, generateNightId, upsertDay, getDay, regularsSummary, lifetimeSummary, exportAsJSON, downloadExport };
})();

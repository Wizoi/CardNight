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

  // Upserts a day's entry by date so re-saving mid-session (e.g. after each
  // rebuy) always leaves exactly one row per calendar day.
  function upsertDay(history, dayEntry) {
    const idx = history.days.findIndex((d) => d.date === dayEntry.date);
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

  return { load, save, todayDateString, upsertDay, getDay, regularsSummary, exportAsJSON, downloadExport };
})();

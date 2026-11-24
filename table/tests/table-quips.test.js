"use strict";

// Covers the 2026-11-23 archetype design review's finding #1+#2: the
// shared TableQuips.pickQuip helper (replacing 12 copy-pasted maybeQuip
// bodies), and the re-bucketed phrasesByMoment data it reads from
// (table-people-data.js). Previously 90% of the 1,478-line quip corpus
// sat in `general` (1,335 lines), 22 of 30 characters had zero `win`
// lines, and a fold quip could only ever fire in 5 of 27 games.

const { load } = require("./harness");
const { makeChecker } = require("./check");

function run() {
  const { check, summary } = makeChecker();
  const { TableQuips, TablePeople, TABLE_PEOPLE } = load(
    ["table-people-data.js", "table-people.js", "table-quips.js"],
    ["TableQuips", "TablePeople", "TABLE_PEOPLE"]
  );

  // --- pickQuip unit behavior ---
  const aiPlayer = { isHuman: false, id: "ai-1", tablePersonId: TABLE_PEOPLE[0].id };
  const humanPlayer = { isHuman: true, id: "human", tablePersonId: null };
  const noArchetypePlayer = { isHuman: false, id: "ai-2", tablePersonId: null };

  check("a human player never gets a quip", TableQuips.pickQuip(humanPlayer, "win", 1) === null);
  check("a player with no archetype data never gets a quip", TableQuips.pickQuip(noArchetypePlayer, "win", 1) === null);
  check("chance=0 never fires", TableQuips.pickQuip(aiPlayer, "win", 0) === null);
  check("chance=1 with a real character always fires", TableQuips.pickQuip(aiPlayer, "general", 1) !== null);

  const picked = TableQuips.pickQuip(aiPlayer, "general", 1);
  check("a real pick returns {personName, text}", typeof picked.personName === "string" && typeof picked.text === "string");

  // A character known to have zero `raise` lines (a genuine authored-
  // content gap left deliberately unforced by the re-bucketing pass, not
  // a bug) must still fall back to `general` rather than return null.
  const fortressSheHer = TablePeople.getById("fortress--she-her");
  check("fortress--she-her genuinely has 0 raise lines (documented gap, not re-checked here)", fortressSheHer.phrasesByMoment.raise.length === 0);
  const fallbackPick = TableQuips.pickQuip({ isHuman: false, id: "x", tablePersonId: "fortress--she-her" }, "raise", 1);
  check("an empty moment bucket falls back to general instead of returning null", fallbackPick !== null);

  // --- Data integrity across all 30 characters ---
  check("still 30 characters", TABLE_PEOPLE.length === 30);

  let totalPhrases = 0;
  let totalBucketed = 0;
  let minFold = Infinity;
  let minWin = Infinity;
  const zeroRaiseIds = [];
  for (const p of TABLE_PEOPLE) {
    totalPhrases += p.phrases.length;
    const allBucketed = Object.values(p.phrasesByMoment).flat();
    totalBucketed += allBucketed.length;
    // Every bucketed line must be a real line from this character's own
    // phrases (no stray/invented text), and no line double-counted across
    // two different moment buckets.
    const seen = new Set();
    for (const line of allBucketed) {
      check(`${p.id}: "${line.slice(0, 30)}..." is a real phrase, not invented`, p.phrases.includes(line));
      check(`${p.id}: "${line.slice(0, 30)}..." isn't double-bucketed`, !seen.has(line));
      seen.add(line);
    }
    minFold = Math.min(minFold, p.phrasesByMoment.fold.length);
    minWin = Math.min(minWin, p.phrasesByMoment.win.length);
    if (p.phrasesByMoment.raise.length === 0) zeroRaiseIds.push(p.id);
  }
  check("total phrase count across all characters is unchanged at 1478 (no loss/duplication from re-bucketing)", totalPhrases === 1478);
  check("every bucketed line is accounted for exactly once per character (sum of buckets == sum of phrases)", totalBucketed === totalPhrases);
  check("every character has at least 1 fold line (min across roster: 3)", minFold >= 1);
  check("every character has at least 1 win line (min across roster: 1 -- was 0 for 22/30 before this pass)", minWin >= 1);
  // Exactly the 2 known, deliberately-unforced content gaps -- if this
  // list ever grows, that's a real regression worth investigating, not
  // silently accepted.
  check(
    `only the 2 known characters have 0 raise lines (fortress--she-her, statistician--they-them): got [${zeroRaiseIds.join(", ")}]`,
    zeroRaiseIds.length === 2 && zeroRaiseIds.includes("fortress--she-her") && zeroRaiseIds.includes("statistician--they-them")
  );

  return summary("table-quips");
}

if (require.main === module) process.exit(run());
module.exports = { run };

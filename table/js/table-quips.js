"use strict";

// Shared quip-selection logic (2026-11-23, per the archetype design
// review's finding #2: "maybeQuip is copy-pasted into 12 session files,
// each with its own QUIP_CHANCE"). Pulling the actual SELECTION logic
// (random fallback-to-general lookup) into one place means it can only
// drift or regress once, not 11+ times independently. DOM-free (no
// document/window/localStorage), same as every rules-*.js/session-*.js/
// ai-*.js file, so layer-boundary.test.js's boundary still holds.
//
// Each session file still keeps its own tiny maybeQuip(player, moment)
// wrapper around TableQuips.pickQuip, since quipSeq/lastQuip/state.log are
// that session's own resumable closure state, not this helper's concern:
//
//   function maybeQuip(player, moment) {
//     const picked = TableQuips.pickQuip(player, moment, QUIP_CHANCE);
//     if (!picked) return;
//     quipSeq += 1;
//     lastQuip = { id: quipSeq, playerId: player.id, text: picked.text };
//     if (state) state.log.push(`${picked.personName}: "${picked.text}"`);
//   }
const TableQuips = (function () {
  const DEFAULT_QUIP_CHANCE = 0.35;

  // Returns {personName, text} or null if nothing fires this time (human,
  // no archetype data, the chance roll missed, or genuinely no lines
  // exist anywhere for this person, moment included). Falls back to
  // `general` whenever the requested moment's own bucket is empty for
  // this specific character -- e.g. the 2 known content gaps from the
  // 2026-11-23 re-bucketing pass (fortress--she-her and
  // statistician--they-them both have zero `raise` lines written) degrade
  // to a plain general line instead of firing nothing or throwing.
  // Per-profile talkativeness (2026-11-23, design review finding #8)
  // takes priority over the caller-supplied `chance` whenever the player
  // has real archetype data: previously every archetype talked at the
  // exact same flat rate (the session's own QUIP_CHANCE), so the Wall
  // (most of whose own lines are about NOT talking) chattered exactly as
  // often as the Diplomat. `chance` stays the fallback for a player with
  // no resolvable profile (or in a test harness that hands this a plain
  // synthetic profile-less player), so this is additive, not breaking.
  function effectiveChance(player, chance) {
    if (typeof AIProfiles !== "undefined" && player.profileName) {
      const profile = AIProfiles.profileFor(player.profileName);
      if (profile && profile.talkativeness != null) return profile.talkativeness;
    }
    return chance == null ? DEFAULT_QUIP_CHANCE : chance;
  }

  function pickQuip(player, moment, chance) {
    if (player.isHuman || !player.tablePersonId) return null;
    if (Math.random() > effectiveChance(player, chance)) return null;
    const person = TablePeople.getById(player.tablePersonId);
    if (!person || !person.phrasesByMoment) return null;
    const pool = person.phrasesByMoment[moment];
    const fallback = person.phrasesByMoment.general;
    const source = pool && pool.length ? pool : fallback;
    if (!source || !source.length) return null;
    const text = source[Math.floor(Math.random() * source.length)];
    return { personName: person.name, text };
  }

  // Reaction quips (2026-11-23, design review finding #9): "No archetype
  // can react to another player, so the Diplomat's compliments and the
  // Steady Hand's reassurance never happen." Every other quip here is the
  // acting player talking about their own action; a reaction is the one
  // genuinely cross-player case -- fired from a seat that WASN'T involved
  // in the event, about something that just happened to someone else.
  // Deliberately does NOT fall back to `general` the way pickQuip does:
  // a reaction misfiring as unrelated self-talk is exactly the kind of
  // misfire the original quip classifier was built to avoid, so a
  // character with no real lines for this specific reaction moment (21
  // of 30 -- only Diplomat/Steady Hand/Live Wire have any) simply never
  // reacts, rather than saying something generic that happens to be
  // wrong for the moment.
  function pickReaction(players, excludePlayerId, moment) {
    const eligible = players.filter((p) => !p.isHuman && p.id !== excludePlayerId && p.tablePersonId);
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = eligible[i];
      eligible[i] = eligible[j];
      eligible[j] = tmp;
    }
    for (const player of eligible) {
      if (Math.random() > effectiveChance(player, null)) continue;
      const person = TablePeople.getById(player.tablePersonId);
      const pool = person && person.phrasesByMoment && person.phrasesByMoment[moment];
      if (!pool || !pool.length) continue;
      const text = pool[Math.floor(Math.random() * pool.length)];
      return { personName: person.name, text, playerId: player.id };
    }
    return null;
  }

  return { DEFAULT_QUIP_CHANCE, pickQuip, pickReaction };
})();

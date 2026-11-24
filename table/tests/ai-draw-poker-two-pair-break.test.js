"use strict";

// Pair of Jacks, Trips to Win requires Trips-or-better to actually WIN,
// so a made two pair can never win on its own. Design review follow-up
// (2026-11-24): decideDraw now breaks the lower pair and draws 3 to the
// higher one (better odds of reaching Trips-or-better than keeping both
// pairs and drawing 1), except for the roster's most loss-averse profiles
// (lossAversion >= 2 -- Fortress and the generic "cautious" bucket), which
// keep the old behavior, matching the endowment-effect psychology those
// two profiles are built around.

const { load } = require("./harness");
const { makeChecker } = require("./check");

function run() {
  const { check, summary } = makeChecker();
  const { AIProfiles, DrawPokerAIProfiles, Deck } = load(
    ["deck.js", "hand-evaluator.js", "chip-economy.js", "betting-engine.js", "ai-profiles.js", "rules-draw-poker.js", "ai-draw-poker-profiles.js"],
    ["AIProfiles", "DrawPokerAIProfiles", "Deck"]
  );

  const twoPairHand = [
    { rank: "J", suit: "S" },
    { rank: "J", suit: "H" },
    { rank: "4", suit: "C" },
    { rank: "4", suit: "D" },
    { rank: "9", suit: "H" },
  ];

  // --- A balanced profile breaks the lower pair (4s), drawing 3 ---
  {
    const player = { hand: twoPairHand.slice() };
    const balanced = AIProfiles.profileFor("balanced");
    const discardIdx = DrawPokerAIProfiles.decideDraw(player, balanced);
    check("balanced discards exactly 3", discardIdx.length === 3);
    const discardedRanks = discardIdx.map((i) => player.hand[i].rank).sort();
    check("balanced discards the 4s and the kicker, keeping the Jacks", discardedRanks.join(",") === "4,4,9");
  }

  // --- Fortress (lossAversion >= 2) keeps both pairs, drawing 1 ---
  {
    const player = { hand: twoPairHand.slice() };
    const fortress = AIProfiles.profileFor("fortress");
    check("fortress profile has lossAversion >= 2", fortress.lossAversion >= 2);
    const discardIdx = DrawPokerAIProfiles.decideDraw(player, fortress);
    check("fortress discards exactly 1 (keeps both pairs)", discardIdx.length === 1);
    check("fortress's one discard is the unpaired kicker (9)", player.hand[discardIdx[0]].rank === "9");
  }

  // --- The generic "cautious" bucket also keeps both pairs ---
  {
    const player = { hand: twoPairHand.slice() };
    const cautious = AIProfiles.profileFor("cautious");
    const discardIdx = DrawPokerAIProfiles.decideDraw(player, cautious);
    check("cautious discards exactly 1 (keeps both pairs)", discardIdx.length === 1);
  }

  // --- A looser profile (Live Wire) breaks the pair, same as balanced ---
  {
    const player = { hand: twoPairHand.slice() };
    const liveWire = AIProfiles.profileFor("live-wire");
    const discardIdx = DrawPokerAIProfiles.decideDraw(player, liveWire);
    check("live-wire discards exactly 3 (breaks the two pair)", discardIdx.length === 3);
  }

  // --- No profile argument at all keeps the old (two-pair-preserving) behavior ---
  {
    const player = { hand: twoPairHand.slice() };
    const discardIdx = DrawPokerAIProfiles.decideDraw(player);
    check("omitting profile keeps the original behavior (discards 1, both pairs kept)", discardIdx.length === 1);
  }

  // --- Two pair that includes a Joker is untouched by the break (it's
  // already a full house via the Joker, nothing to break) ---
  {
    const jokerHand = [
      { rank: "J", suit: "S" },
      { rank: "J", suit: "H" },
      { rank: "4", suit: "C" },
      { rank: "4", suit: "D" },
      { rank: "JOKER", suit: null },
    ];
    const player = { hand: jokerHand.slice() };
    const balanced = AIProfiles.profileFor("balanced");
    const discardIdx = DrawPokerAIProfiles.decideDraw(player, balanced);
    check("a two-pair-plus-Joker hand discards nothing (already a full house)", discardIdx.length === 0);
  }

  // --- A hand that's two pair but NOT drawable (e.g. one group is trips,
  // not a true two-pair) is unaffected by the break ---
  {
    const tripsHand = [
      { rank: "J", suit: "S" },
      { rank: "J", suit: "H" },
      { rank: "J", suit: "D" },
      { rank: "4", suit: "C" },
      { rank: "9", suit: "H" },
    ];
    const player = { hand: tripsHand.slice() };
    const balanced = AIProfiles.profileFor("balanced");
    const discardIdx = DrawPokerAIProfiles.decideDraw(player, balanced);
    check("trips keeps all 3 Jacks, discarding only the 2 kickers", discardIdx.length === 2 && !discardIdx.map((i) => player.hand[i].rank).includes("J"));
  }

  return summary("ai-draw-poker-two-pair-break");
}

if (require.main === module) process.exit(run());
module.exports = { run };

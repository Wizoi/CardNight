"use strict";

// Covers the 2026-11-23 archetype design review's finding #11 (the one
// concrete hook it names): decideBuy4 used to always buy the $1 bonus
// card if affordable, regardless of archetype -- a genuine, if small,
// gamble (one more chance to improve, nothing guaranteed), which the
// roster's most loss-averse profiles should skip outright rather than
// always taking.

const { load } = require("./harness");
const { makeChecker } = require("./check");

function run() {
  const { check, summary } = makeChecker();
  const { AIProfiles, ChipEconomy } = load(["deck.js", "hand-evaluator.js", "chip-economy.js", "ai-profiles.js"], ["AIProfiles", "ChipEconomy"]);

  const richPlayer = { wallet: { chips: ChipEconomy.dollarsToChips(100) } };
  const poorPlayer = { wallet: { chips: 0 } };

  check("affordability is still checked first, regardless of profile", AIProfiles.decideBuy4(poorPlayer, AIProfiles.profileFor("live-wire")) === false);
  check("with no profile argument at all, the old always-buy-if-affordable behavior is unchanged", AIProfiles.decideBuy4(richPlayer) === true);
  check("Fortress (lossAversion 2) skips the $1 bonus buy outright", AIProfiles.decideBuy4(richPlayer, AIProfiles.profileFor("fortress")) === false);
  check("cautious (lossAversion 2) skips it too", AIProfiles.decideBuy4(richPlayer, AIProfiles.profileFor("cautious")) === false);
  check("Live Wire (lossAversion 0) still always buys when affordable", AIProfiles.decideBuy4(richPlayer, AIProfiles.profileFor("live-wire")) === true);
  check("Balanced (lossAversion 1, below the skip threshold) still buys", AIProfiles.decideBuy4(richPlayer, AIProfiles.profileFor("balanced")) === true);

  return summary("ai-decide-buy4");
}

if (require.main === module) process.exit(run());
module.exports = { run };

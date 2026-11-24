"use strict";

// The baseball family's shared wildcard/extra-card rule (games.md's "House
// rule: the baseball family"): 3s and 9s are wild but only once bought ($3
// and $2), and a dealt 4 lets a player buy an extra card for $1. Shared by
// Midnight Baseball and the new stud-shaped baseball games (Daytime, Rainy
// Day) so the rule lives in one place instead of three.
//
// Takes the specific card/hand reference rather than searching a hand by
// predicate (e.g. "the face-up, unbought 3") — that search is only safe for
// a single-reveal game like Midnight Baseball, where a player can never have
// two live unresolved 3s at once. A multi-street stud engine can deal a
// second 3 or 9 on a later street while an earlier one was left unbought
// (declined 9s stay face-up as plain cards), so the caller must resolve
// which exact card is being decided on rather than this module guessing.
const BaseballWildcards = (function () {
  const BUY3_DOLLARS = 3;
  const BUY9_DOLLARS = 2;
  const BUY4_DOLLARS = 1;

  function resolveBuy3(card, wallet, willBuy) {
    const neededChips = ChipEconomy.dollarsToChips(BUY3_DOLLARS);
    if (!willBuy) return { paidChips: 0, wild: false, declined: true };
    if (wallet.isTracked && wallet.chips < neededChips) return { paidChips: 0, wild: false, declined: true };
    if (!wallet.isTracked && wallet.chips < neededChips) {
      while (wallet.chips < neededChips) ChipEconomy.rebuy(wallet, ChipEconomy.BUY_IN_INCREMENT_DOLLARS, Date.now());
    }
    const { paid } = ChipEconomy.pay(wallet, neededChips);
    card.isWild = true;
    card.bought = true;
    return { paidChips: paid, wild: true, declined: false };
  }

  function resolveBuy9(card, wallet, willBuy) {
    const neededChips = ChipEconomy.dollarsToChips(BUY9_DOLLARS);
    if (!willBuy) return { paidChips: 0, wild: false };
    if (wallet.isTracked && wallet.chips < neededChips) return { paidChips: 0, wild: false };
    if (!wallet.isTracked && wallet.chips < neededChips) {
      while (wallet.chips < neededChips) ChipEconomy.rebuy(wallet, ChipEconomy.BUY_IN_INCREMENT_DOLLARS, Date.now());
    }
    const { paid } = ChipEconomy.pay(wallet, neededChips);
    card.isWild = true;
    card.bought = true;
    return { paidChips: paid, wild: true };
  }

  // drawFn: () => card|null — caller supplies the deck/discard draw source
  // (each engine may recycle a discard pile differently).
  function resolveBuy4(hand, wallet, willBuy, drawFn) {
    const neededChips = ChipEconomy.dollarsToChips(BUY4_DOLLARS);
    if (!willBuy) return { paidChips: 0, drew: null };
    if (wallet.isTracked && wallet.chips < neededChips) return { paidChips: 0, drew: null };
    if (!wallet.isTracked && wallet.chips < neededChips) {
      while (wallet.chips < neededChips) ChipEconomy.rebuy(wallet, ChipEconomy.BUY_IN_INCREMENT_DOLLARS, Date.now());
    }
    const bonus = drawFn();
    if (!bonus) return { paidChips: 0, drew: null, exhausted: true };
    const { paid } = ChipEconomy.pay(wallet, neededChips);
    hand.push({ rank: bonus.rank, suit: bonus.suit, faceUp: false, isWild: false, bought: false, isBonus: true });
    return { paidChips: paid, drew: bonus };
  }

  // Real gap, reported directly (2026-11-23): an AI's "is this hand worth
  // continuing to chase" decision (ai-profiles.js's worthPursuing) used a
  // single flat per-archetype optimism constant for every remaining
  // unflipped card, blind to the fact that this family's own 3s/9s (wild,
  // once bought) and 4s (buy an extra card) make some remaining flips
  // genuinely more valuable than an average card -- a hand with several
  // unflipped cards left shouldn't be judged as if every one of them is
  // equally likely to be a plain, unhelpful card. The user's own framing
  // of why this matters, not just a stats nitpick: "one of the reasons
  // for having wilds and flipups in the game is to keep even moderate
  // players in a bit longer... should be considered" -- the house rule's
  // whole point is giving a middling hand a real reason to stick around,
  // so the AI should weigh that the same way a player watching the table
  // would, not fold reflexively the moment a showing hand looks weak.
  //
  // unseenRankBoost counts how many of the CARDS NOBODY HAS LOOKED AT YET
  // (not just this player's own remaining face-down cards, but every card
  // at the table that hasn't been turned face up, wherever it physically
  // sits right now) match the given rank(s), as a fraction of the whole
  // unseen pool -- exactly the odds a neutral outside observer would
  // assign to "the next card revealed, by anyone, is one of these ranks."
  // This deliberately only ever reads cards that are ALREADY face-up (or
  // already folded into the discard pile) to build the "seen" count --
  // never this player's own still-face-down cards, the same "never judge
  // from the AI's own hidden cards" discipline ai-profiles.js's file
  // header already documents for every other decision in this project.
  function unseenRankBoost(state, ranks, totalInDeck) {
    let seenTotal = 0;
    let seenMatching = 0;
    for (const p of state.players) {
      for (const c of p.hand) {
        if (!c.faceUp) continue;
        seenTotal += 1;
        if (ranks.includes(c.rank)) seenMatching += 1;
      }
    }
    for (const c of state.discardPile || []) {
      seenTotal += 1;
      if (ranks.includes(c.rank)) seenMatching += 1;
    }
    const unseenTotal = 52 - seenTotal;
    if (unseenTotal <= 0) return 0;
    const unseenMatching = Math.max(0, totalInDeck - seenMatching);
    return unseenMatching / unseenTotal;
  }

  // The combined "a remaining flip might genuinely help" signal this
  // family's AI decisions read: the odds of hitting a buyable wild (3 or
  // 9) weighted more heavily (it directly upgrades the showing hand),
  // plus the odds of hitting a 4 (only an OPTION to buy one more card,
  // so weighted at half that) -- additive, in the same chanceBonus units
  // worthPursuing already expects on top of a profile's flat
  // chancePerCard. Both terms naturally taper toward 0 as a hand
  // progresses and the relevant ranks actually get seen, the same way a
  // real player's read would sharpen as the table fills in.
  const WILD_RANK_WEIGHT = 2; // a bought 3/9 is a genuine wildcard -- weighted as a real, not marginal, upgrade
  const BONUS_RANK_WEIGHT = 1; // a 4 is only the OPTION to buy one more chance, worth meaningfully less

  function wildcardChanceBonus(state) {
    const wildBoost = unseenRankBoost(state, ["3", "9"], 8);
    const bonusBoost = unseenRankBoost(state, ["4"], 4);
    return wildBoost * WILD_RANK_WEIGHT + bonusBoost * BONUS_RANK_WEIGHT;
  }

  return { BUY3_DOLLARS, BUY9_DOLLARS, BUY4_DOLLARS, resolveBuy3, resolveBuy9, resolveBuy4, unseenRankBoost, wildcardChanceBonus };
})();

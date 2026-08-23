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
    if (!willBuy) return { paidChips: 0, wild: false, declined: true };
    const { paid } = ChipEconomy.pay(wallet, ChipEconomy.dollarsToChips(BUY3_DOLLARS));
    card.isWild = true;
    card.bought = true;
    return { paidChips: paid, wild: true, declined: false };
  }

  function resolveBuy9(card, wallet, willBuy) {
    if (!willBuy) return { paidChips: 0, wild: false };
    const { paid } = ChipEconomy.pay(wallet, ChipEconomy.dollarsToChips(BUY9_DOLLARS));
    card.isWild = true;
    card.bought = true;
    return { paidChips: paid, wild: true };
  }

  // drawFn: () => card|null — caller supplies the deck/discard draw source
  // (each engine may recycle a discard pile differently).
  function resolveBuy4(hand, wallet, willBuy, drawFn) {
    if (!willBuy) return { paidChips: 0, drew: null };
    const bonus = drawFn();
    if (!bonus) return { paidChips: 0, drew: null, exhausted: true };
    const { paid } = ChipEconomy.pay(wallet, ChipEconomy.dollarsToChips(BUY4_DOLLARS));
    hand.push({ rank: bonus.rank, suit: bonus.suit, faceUp: false, isWild: false, bought: false, isBonus: true });
    return { paidChips: paid, drew: bonus };
  }

  return { BUY3_DOLLARS, BUY9_DOLLARS, BUY4_DOLLARS, resolveBuy3, resolveBuy9, resolveBuy4 };
})();

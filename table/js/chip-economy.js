"use strict";

// Buy-in / rebuy / cash-out math. Chips are a fixed 25¢ denomination (house
// default from games.md); buy-ins happen in $20 increments. Only the human's
// wallet is "tracked" against the rebuy cap and written to history — AI seats
// get an untracked wallet so the hand mechanics keep working without pretending
// to simulate their finances.
const ChipEconomy = (function () {
  const CHIP_VALUE_CENTS = 25;
  const BUY_IN_INCREMENT_DOLLARS = 20;

  function dollarsToChips(dollars) {
    return Math.round((dollars * 100) / CHIP_VALUE_CENTS);
  }

  function chipsToDollars(chips) {
    return (chips * CHIP_VALUE_CENTS) / 100;
  }

  function createWallet({ initialBuyInDollars, rebuyCapDollars, isTracked = true }) {
    return {
      isTracked,
      chips: dollarsToChips(initialBuyInDollars),
      initialBuyInDollars,
      rebuyCapDollars,
      rebuys: [], // [{dollars, ts}]
      cashedOutDollars: null,
    };
  }

  function totalRebuysDollars(wallet) {
    return wallet.rebuys.reduce((sum, r) => sum + r.dollars, 0);
  }

  function canRebuy(wallet, dollars) {
    if (!wallet.isTracked) return true;
    return totalRebuysDollars(wallet) + dollars <= wallet.rebuyCapDollars;
  }

  function rebuy(wallet, dollars, ts) {
    if (!canRebuy(wallet, dollars)) return false;
    wallet.rebuys.push({ dollars, ts });
    wallet.chips += dollarsToChips(dollars);
    return true;
  }

  // Pays up to whatever the wallet holds — no borrowing. Returns what was
  // actually taken and whether the player went all-in short of the full amount.
  function pay(wallet, chipAmount) {
    const paid = Math.min(wallet.chips, chipAmount);
    wallet.chips -= paid;
    return { paid, allIn: paid < chipAmount };
  }

  function award(wallet, chipAmount) {
    wallet.chips += chipAmount;
  }

  function totalBoughtInDollars(wallet) {
    return wallet.initialBuyInDollars + totalRebuysDollars(wallet);
  }

  function cashOut(wallet) {
    wallet.cashedOutDollars = chipsToDollars(wallet.chips);
    return wallet.cashedOutDollars;
  }

  function netDollars(wallet) {
    const cashOutValue = wallet.cashedOutDollars != null ? wallet.cashedOutDollars : chipsToDollars(wallet.chips);
    return cashOutValue - totalBoughtInDollars(wallet);
  }

  return {
    CHIP_VALUE_CENTS,
    BUY_IN_INCREMENT_DOLLARS,
    dollarsToChips,
    chipsToDollars,
    createWallet,
    totalRebuysDollars,
    canRebuy,
    rebuy,
    pay,
    award,
    totalBoughtInDollars,
    cashOut,
    netDollars,
  };
})();

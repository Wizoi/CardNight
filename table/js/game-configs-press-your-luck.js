"use strict";

// Config objects turning PressYourLuckRules into 5.5-21 and 7-27.
const FIVE_FIVE_TWENTYONE_CONFIG = {
  id: "fiveFiveTwentyOne",
  name: "5.5-21",
  lowTarget: 5.5,
  highTarget: 21,
  bustRule: "bust", // going over EITHER target busts a hand out of contention for that specific side
  // games.md states these as fixed values, no flexibility (unlike 7-27's
  // flexible Ace/paid-flexible-10) -- Ace = 1, face cards = 0.5, numbers at face value.
  cardValue(card) {
    if (card.rank === "A") return [1];
    if (card.rank === "J" || card.rank === "Q" || card.rank === "K") return [0.5];
    return [Number(card.rank)];
  },
  initialDeal: { faceUp: [false] }, // "All cards dealt face down" -- never revealed until showdown
  dealtCardsFaceUp: false,
  buyBack: null, // not a feature of this game at all
  kitchenSink: false,
  tieBreak: "fewestCards", // games.md's one explicit exception to the usual even-split-on-tie default
  // Added 2026-08-26 after the user caught the same "documented but never
  // built" gap 3-33 had: a real betting round right after the deal, then
  // another after each full hit-or-stand lap. See rules-press-your-luck.js.
  bettingEnabled: true,
  consecutiveStandRoundsToEnd: 2, // games.md: "one more complete round of no-takers is required" after the first
};

const SEVEN_TWENTYSEVEN_CONFIG = {
  id: "sevenTwentySeven",
  name: "7-27",
  lowTarget: 7,
  highTarget: 27,
  bustRule: "noBust", // going over either target does NOT disqualify a hand -- just whichever's numerically closest wins
  anteDollars: 0.25, // games.md: half the standard 50c default
  // Ace is genuinely flexible (1 or 11); face cards fixed at 0.5. A 10 is
  // fixed at 10 unless its holder pays flexTenPriceDollars to make it
  // genuinely flexible too (0 or 10) -- games.md's "$1 buys a specific 10
  // the flexible 0-or-10 choice," implemented 2026-08-29 (previously a
  // known gap) via card.flexTen, set by PressYourLuckRules.
  // applyFlexTenPurchase the moment it's paid for.
  cardValue(card) {
    if (card.rank === "A") return [1, 11];
    if (card.rank === "J" || card.rank === "Q" || card.rank === "K") return [0.5];
    if (card.rank === "10" && card.flexTen) return [0, 10];
    return [Number(card.rank)];
  },
  flexTenPriceDollars: 1,
  initialDeal: { faceUp: [false, true] }, // 1 down, then 1 up
  dealtCardsFaceUp: true, // every card after the initial down card is dealt face up, same as the up-card itself
  // "Down the river": escalating buy-back, up to 3 total across the whole
  // hand, on any face-up card (the initial up-card included) -- a genuinely
  // CHAINED decision (buy the $1 replacement, and if it's still eligible,
  // you're immediately offered the $2 one, then the $3 one, not just one
  // buy-back per newly-dealt card). A bought-back card is replaced and
  // dealt face up again, same as any other dealt card here.
  buyBack: { priceScheduleDollars: [1, 2, 3], maxBuys: 3 },
  kitchenSink: true, // exactly 7 for low AND exactly 27 for high at once wins the whole pot outright
  tieBreak: "split", // standard house default -- no exception documented for this game
  // Confirmed by the user 2026-08-26 (games.md itself doesn't restate a
  // betting field or ending condition for this game): real betting same
  // as 5.5-21, but ending on just ONE round of nobody taking a card, not
  // two -- and folding is still a real option even though nobody can
  // bust under this game's noBust rule.
  bettingEnabled: true,
  consecutiveStandRoundsToEnd: 1,
};

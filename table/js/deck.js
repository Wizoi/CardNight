"use strict";

// Card/deck primitives shared by the hand evaluator and rule engines.
// Pure logic, no DOM — this is the layer most worth reusing on a future port.
const Deck = (function () {
  const SUITS = ["S", "H", "D", "C"];
  const SUIT_SYMBOLS = { S: "♠", H: "♥", D: "♦", C: "♣" };
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const RANK_VALUES = RANKS.reduce((map, rank, i) => {
    map[rank] = i + 2;
    return map;
  }, {});

  function buildDeck() {
    const cards = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ rank, suit, value: RANK_VALUES[rank] });
      }
    }
    return cards;
  }

  function shuffle(deck) {
    const cards = deck.slice();
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }

  function cardLabel(card) {
    return `${card.rank}${SUIT_SYMBOLS[card.suit] || card.suit}`;
  }

  // Draws one card from pile.deck, reshuffling pile.discardPile back in as a
  // fresh draw source once the deck runs dry (mutates both arrays on the
  // passed-in pile object). Any object with `deck`/`discardPile` array
  // properties works as `pile` — a game's whole hand-state object included,
  // since drawing is a rare, out-of-band event (a bonus-card buy) rather than
  // part of the normal deal.
  function drawWithReshuffle(pile) {
    let reshuffled = false;
    if (pile.deck.length === 0 && pile.discardPile.length > 0) {
      pile.deck = shuffle(pile.discardPile);
      pile.discardPile = [];
      reshuffled = true;
    }
    if (pile.deck.length === 0) return { card: null, reshuffled };
    return { card: pile.deck.shift(), reshuffled };
  }

  return { SUITS, SUIT_SYMBOLS, RANKS, RANK_VALUES, buildDeck, shuffle, cardLabel, drawWithReshuffle };
})();

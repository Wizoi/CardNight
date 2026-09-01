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
  // A Joker is never a real rank to compare against another card by value --
  // but a few AI heuristics (e.g. Anaconda's discard-the-lowest sort) look
  // up Deck.RANK_VALUES[card.rank] on EVERY card, wild or not, to decide
  // what to keep. Registering a value one above Ace here means those
  // heuristics naturally treat a Joker as the best card in hand (never
  // discarded first) without each caller needing its own Joker special-case.
  RANK_VALUES.JOKER = RANK_VALUES.A + 1;

  // games.md's "House rule: playing with Jokers" -- dealer's choice to add
  // 1 or 2 Jokers to the deck as extra wildcards, for the handful of games
  // that have no dedicated wildcard mechanic of their own (see
  // game-registry.js's jokerCount variantOptions). `jokerCount` defaults to
  // 0 (a plain 52-card deck) for every game that doesn't opt in.
  function buildDeck(jokerCount) {
    const cards = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ rank, suit, value: RANK_VALUES[rank] });
      }
    }
    for (let i = 0; i < (jokerCount || 0); i++) {
      cards.push({ rank: "JOKER", suit: null, value: RANK_VALUES.JOKER });
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
    if (card.rank === "JOKER") return "Joker";
    return `${card.rank}${SUIT_SYMBOLS[card.suit] || card.suit}`;
  }

  // The visible face of a card rendered on the table (used by every
  // table-ui-*.js's own cardMarkup) -- deliberately separate from
  // cardLabel(), which stays a single inline string for log/sentence text
  // ("Flipped wildcard: 10♥."). Stacks rank above suit symbol so both can
  // render at a larger, equally-legible font-size without widening the
  // card; a 2-character rank ("10") gets `card-rank-wide` so the shared
  // stylesheet can squeeze it horizontally (scaleX) rather than shrinking
  // its font-size, which would otherwise make "10" look shorter than every
  // other rank instead of just narrower.
  function cardFaceHtml(card) {
    if (card.rank === "JOKER") return "Joker";
    const rankClass = card.rank.length > 1 ? "card-rank card-rank-wide" : "card-rank";
    return `<span class="${rankClass}">${card.rank}</span><span class="card-suit">${SUIT_SYMBOLS[card.suit] || card.suit}</span>`;
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

  return { SUITS, SUIT_SYMBOLS, RANKS, RANK_VALUES, buildDeck, shuffle, cardLabel, cardFaceHtml, drawWithReshuffle };
})();

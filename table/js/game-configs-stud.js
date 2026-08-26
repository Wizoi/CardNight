"use strict";

// Config objects turning the shared StudRules engine into specific games
// (games.md's Daytime Baseball and Rainy Day Baseball entries). See
// CLAUDE.md / the plan for the judgment calls made where games.md leaves a
// detail unstated (Rainy Day's 4th card face, action order, rain-out
// counter scope).
const DAYTIME_BASEBALL_CONFIG = {
  id: "daytimeBaseball",
  name: "Daytime Baseball",
  wildcards: BaseballWildcards,
  // 2 down, then up-cards one per round with a betting round after each --
  // 5 up-rounds (7 cards total) at 5-7 players, 4 up-rounds (6 total) at a
  // full 8-player table, same scaling as Midnight Baseball's own deal size.
  streets(playerCount) {
    const upRounds = playerCount >= 8 ? 4 : 5;
    const streets = [
      { faceUp: false, bettingAfter: false },
      { faceUp: false, bettingAfter: false },
    ];
    for (let i = 0; i < upRounds; i++) streets.push({ faceUp: true, bettingAfter: true });
    return streets;
  },
};

const RAINY_DAY_BASEBALL_CONFIG = {
  id: "rainyDayBaseball",
  name: "Rainy Day Baseball",
  wildcards: BaseballWildcards,
  // 2 down, 1 up + bet, 1 more card + bet. games.md doesn't state the 4th
  // card's face -- dealt face-up here, matching the stud family's "down
  // twice, up from then on" default.
  streets() {
    return [
      { faceUp: false, bettingAfter: false },
      { faceUp: false, bettingAfter: false },
      { faceUp: true, bettingAfter: true },
      { faceUp: true, bettingAfter: true },
    ];
  },
  // A red queen rains out (kills) the hand outright, pot carrying to the
  // next hand. After the first rain-out this game has seen, it takes two
  // red queens dealt in the same hand to trigger again. gameMemory persists
  // across hands of this one game sitting (owned by the orchestrator, reset
  // whenever Rainy Day is freshly started); state.redQueensThisHand is
  // per-hand. Checks both down and up cards -- games.md doesn't restrict
  // the rule to visible cards, and a player would still see their own
  // face-down red queen land.
  rainOutCheck(state, dealtCard, gameMemory) {
    const isRedQueen = dealtCard.rank === "Q" && (dealtCard.suit === "H" || dealtCard.suit === "D");
    if (!isRedQueen) return false;
    state.redQueensThisHand = (state.redQueensThisHand || 0) + 1;
    const threshold = gameMemory.rainOutHappenedOnce ? 2 : 1;
    if (state.redQueensThisHand < threshold) return false;
    gameMemory.rainOutHappenedOnce = true;
    return true;
  },
};

const FOLLOW_THE_QUEEN_CONFIG = {
  id: "followTheQueen",
  name: "Follow the Queen",
  wildcards: null,
  // Queens are always wild, and so is whatever rank immediately follows the
  // most-recently-exposed queen -- a later queen cancels the earlier follow
  // rank rather than stacking. Highest showing hand leads each betting
  // round (the stud family's usual bring-in-style rule), unlike the other
  // games here which just keep the fixed dealer-relative order.
  rollingWildcard: { triggerRank: "Q" },
  firstToActId(state) {
    const best = StudRules.currentBestShowingHand(state);
    return best.holderId || state.players.find((p) => !p.folded).id;
  },
  // 6 cards in sequence -- 2 up, 3 down, 1 up (games.md's documented deal;
  // whether this should scale with player count like the other stud games
  // is still an open question there, not resolved here). A betting round
  // follows each up card, matching the stud family's "bet when new public
  // information appears" default; the 3 down cards in the middle are dealt
  // with no betting in between, same as the initial 2-down street elsewhere
  // in the family.
  //
  // Known gap: games.md also documents an optional "Low Chicago" side pot
  // (best concealed spade in the hole) as a companion rule to this game --
  // not implemented here, core high-hand-wins play only.
  streets() {
    return [
      { faceUp: true, bettingAfter: true },
      { faceUp: true, bettingAfter: true },
      { faceUp: false, bettingAfter: false },
      { faceUp: false, bettingAfter: false },
      { faceUp: false, bettingAfter: false },
      { faceUp: true, bettingAfter: true },
    ];
  },
};

const SEVEN_AND_WHAT_MAKES_IT_CONFIG = {
  id: "sevenAndWhatMakesIt",
  name: "Seven and What Makes It",
  wildcards: null,
  // No fixed wildcard rank at all: any of a player's own cards that sum to
  // exactly 7 are wild, chosen fresh per player from whatever they're
  // holding (a lone 7 counts too). Aces count as 1; face cards aren't
  // assigned a value here since games.md doesn't specify one for them, so
  // they simply can't take part in a sum-to-7 combination -- a judgment
  // call, not a documented rule.
  selfDeterminedWild: {
    targetSum: 7,
    rankValue(rank) {
      if (rank === "A") return 1;
      const n = Number(rank);
      return Number.isFinite(n) ? n : null;
    },
  },
  // Standard stud betting: highest showing hand leads each round, same as
  // Follow the Queen.
  firstToActId(state) {
    const best = StudRules.currentBestShowingHand(state);
    return best.holderId || state.players.find((p) => !p.folded).id;
  },
  // 2 down, then up-card rounds (one per round), then 1 down -- standard
  // 7-card stud shape. 4 up-rounds (7 cards total) at 5-7 players, 3
  // up-rounds (6 total) at a full 8-player table, same scaling pattern as
  // the baseball-family games.
  streets(playerCount) {
    const upRounds = playerCount >= 8 ? 3 : 4;
    const streets = [
      { faceUp: false, bettingAfter: false },
      { faceUp: false, bettingAfter: false },
    ];
    for (let i = 0; i < upRounds; i++) streets.push({ faceUp: true, bettingAfter: true });
    streets.push({ faceUp: false, bettingAfter: true });
    return streets;
  },
};

const GOOD_BAD_UGLY_CONFIG = {
  id: "goodBadUgly",
  name: "The Good, the Bad and the Ugly",
  wildcards: null,
  // 3 cards dealt face down to the table itself (never part of anyone's
  // hand) at the start of the hand, revealed one at a time as the deal
  // reaches cards 4, 5, and 6.
  tableCards: { count: 3 },
  tableReveals: [
    { effect: "wild", label: "The Good" }, // every card of this rank, any player, is wild from here on
    { effect: "discard", label: "The Bad" }, // every card of this rank, any player, is discarded outright
    { effect: "foldOnUpMatch", label: "The Ugly" }, // anyone whose up-card matches this rank folds immediately
  ],
  // games.md doesn't specify a bring-in/leader-acts-first rule for this game
  // the way it does for Follow the Queen or Seven and What Makes It, so this
  // keeps the simpler fixed dealer-relative order those two override away
  // from -- a judgment call, not a documented rule.
  //
  // 2 down, 1 up, then up-cards 4/5/6 each followed by that card's table
  // reveal (and a second betting round for it), then a final down card at
  // 5-7 players (skipped at a full 8-player table so the deal still fits
  // one deck alongside the 3 table cards).
  streets(playerCount) {
    const streets = [
      { faceUp: false, bettingAfter: false },
      { faceUp: false, bettingAfter: false },
      { faceUp: true, bettingAfter: true },
      { faceUp: true, bettingAfter: true, tableRevealAfter: 0 },
      { faceUp: true, bettingAfter: true, tableRevealAfter: 1 },
      { faceUp: true, bettingAfter: true, tableRevealAfter: 2 },
    ];
    if (playerCount < 8) streets.push({ faceUp: false, bettingAfter: true });
    return streets;
  },
};

const FREE_ENTERPRISE_CONFIG = {
  id: "freeEnterprise",
  name: "Free Enterprise",
  wildcards: null,
  // No fixed wildcard at all -- its whole house twist is the Enterprise
  // pile: instead of a normal per-player deal, every card after the
  // initial 2 down comes from a shared 3-card face-up spread each player
  // either buys from (priced by position, $1/$2/$3), wipes for a fresh 3
  // (free, then must buy or take a free card from the new spread), or
  // skips for a free card off the deck. A bought card stays face up (the
  // table already saw it); a free card is dealt face down. Doubled prices
  // on the final round.
  enterprisePile: { priceScheduleDollars: [1, 2, 3], finalRoundMultiplier: 2 },
  // games.md: "Betting: Based on highest showing card(s)" -- the same
  // bring-in rule Follow the Queen and Seven and What Makes It use, missed
  // when this config was first built (games.md is explicit here, unlike
  // Follow the Queen's still-open deal-size question).
  firstToActId(state) {
    const best = StudRules.currentBestShowingHand(state);
    return best.holderId || state.players.find((p) => !p.folded).id;
  },
  // 2 down dealt normally, then every remaining card is a turn at the
  // Enterprise pile -- no fixed up/down schedule beyond that, since a
  // pile-acquired card's face depends on how it was gotten (bought = up,
  // free = down), not which street it's on. 5 more rounds (7 cards total)
  // at 5-7 players, 4 more rounds (6 total) at a full 8-player table, same
  // scaling pattern as the baseball-family games.
  streets(playerCount) {
    const pileRounds = playerCount >= 8 ? 4 : 5;
    const streets = [
      { faceUp: false, bettingAfter: false },
      { faceUp: false, bettingAfter: false },
    ];
    for (let i = 0; i < pileRounds; i++) streets.push({ bettingAfter: true });
    return streets;
  },
};

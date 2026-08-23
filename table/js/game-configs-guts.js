"use strict";

// Config objects turning the shared GutsRules engine into specific games
// (games.md's Deep or Double Screw, 3 Buy 5 / 5 Buy 5, and Four-Two-Two
// entries). 3-5-7 Guts is structurally different enough (fixed 3-round
// hand, no early end) that it isn't built on this engine at all — see
// rules-guts-357.js / game-configs-guts-357.js instead.
const DEEP_OR_DOUBLE_SCREW_CONFIG = {
  id: "deepOrDoubleScrew",
  name: "Deep or Double Screw",
  // 7-card version at typical table sizes, 6-card at a full 8-player table
  // so the deal (plus a dummy hand elsewhere in the real rules — not
  // implemented here, see below) stays within one deck.
  dealSize(playerCount) {
    return playerCount >= 8 ? 6 : 7;
  },
  // games.md documents FOUR dealer's-choice wildcard variants for this game
  // (flip-up wildcards, lowest-card-wild, 3s/5s/7s wild, red royals) —
  // implementing all four is disproportionate scope for a rule that's
  // explicitly meant to vary night-to-night by dealer's choice anyway, so
  // this picks ONE concrete default: a single flip-up wildcard (same
  // wildcard density as the other guts games here, one rank). 3s/5s/7s-all-
  // wild was tried first and produces such strong hands so often (3 wild
  // ranks in a 7-card hand) that the escalating cycle rarely resolves —
  // realistic to how rich that variant genuinely plays, but a bad fit as
  // the single always-on default. The other three variants are left as a
  // documented future enhancement (a per-hand dealer's-choice toggle).
  wildRanks: [],
  flipWildcardCount: 1,
  // A 6-7 card hand is big enough that a bare pair is unremarkable (most
  // random hands that size have one) -- shift every AI profile's stay-in
  // bar up so the decision stays meaningfully selective. See
  // ai-guts-profiles.js's decideStayIn for why.
  categoryShift: 2,
  // 6-card version passes 1 left / 1 right; 7-card version passes 2 left /
  // 1 right — tied directly to which deal size is actually in play.
  passing(playerCount) {
    return playerCount >= 8 ? { left: 1, right: 1 } : { left: 2, right: 1 };
  },
  loserPolicy: "allNonWinners",
  // Known gap: the "dummy hand" a lone "in" player might otherwise have to
  // beat isn't implemented — a lone stayer always just wins outright here,
  // same simplification used wherever this project treats an optional/
  // underspecified rule as not applicable rather than guessing its shape.
};

const THREE_BUY_FIVE_CONFIG = {
  id: "threeBuyFive",
  name: "3 Buy 5 / 5 Buy 5",
  // games.md offers "3 or 5 cards" as two variants, dealer's choice; the
  // 5-card version is picked as the concrete default here (a normal
  // 5-card poker hand), leaving the 3-card variant as a documented gap.
  dealSize() {
    return 5;
  },
  wildRanks: ["5"], // "5s are always wild" -- the base rule; games.md's "plus optional additional wildcards" isn't implemented (dealer's choice, no fixed shape given)
  exchangePriceDollars: 1, // games.md says "dealer-set price" without a number -- a judgment call
  loserPolicy: "allNonWinners",
  // A bare pair happens close to half the time in a random 5-card hand --
  // shift the stay-in bar up one category so "stay in" stays a genuine
  // signal rather than something most hands clear. See
  // ai-guts-profiles.js's decideStayIn.
  categoryShift: 1,
};

const FOUR_TWO_TWO_CONFIG = {
  id: "fourTwoTwo",
  name: "Four-Two-Two",
  dealSize() {
    return 4;
  },
  wildRanks: ["2"],
  bonusCards: 2, // stayers draw 2 more (up to 6 total) before showdown
  loserPolicy: "allNonWinners",
  // Even a 4-card hand collides into a pair often enough (especially with
  // a wild rank in the mix) that the stay-in bar needs the same one-
  // category bump 3 Buy 5 / 5 Buy 5 uses. See ai-guts-profiles.js's
  // decideStayIn.
  categoryShift: 1,
  // Known gap: games.md's optional "max loss per deal" cap on how much a
  // loser has to match isn't implemented — matches the full pot every time.
};

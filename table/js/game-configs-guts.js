"use strict";

// Config objects turning the shared GutsRules engine into specific games
// (games.md's Deep or Double Screw, 3 Buy 5 / 5 Buy 5, Four-Two-Two, and
// 3-5-7 Guts entries).
const DEEP_OR_DOUBLE_SCREW_CONFIG = {
  id: "deepOrDoubleScrew",
  name: "Deep or Double Screw",
  // 7-card version at typical table sizes, 6-card at a full 8-player table
  // so the deal (plus a dummy hand elsewhere in the real rules — not
  // implemented here, see below) stays within one deck.
  dealSize(playerCount) {
    return playerCount >= 8 ? 6 : 7;
  },
  // games.md's confirmed house rule (corrected 2026-08-25 -- the original
  // build modeled this as "pick one of 4 dealer's-choice variants," which
  // was wrong): the lowest card in each player's OWN hand is ALWAYS wild,
  // every hand, no exceptions. 1 or 2 additional flip-up wildcards are an
  // optional dealer's-choice add-on ON TOP of that base rule, not a
  // replacement for it -- flipWildcardCount defaults to 0 (no flip-ups
  // called) since there's no per-hand dealer prompt in this app yet; a
  // future toggle could raise it to 1 or 2. The old "3s/5s/7s wild" and
  // "red royals" variants are no longer modeled as alternatives at all now
  // that games.md documents a single concrete base rule instead of 4
  // mutually-exclusive picks -- see games.md's Variants: bullet if they're
  // ever wanted back.
  wildRanks: [],
  lowestCardWild: true,
  flipWildcardCount: 0,
  // Re-tuned 2026-08-26 alongside the lowestCardWild rebuild above (was 2,
  // back when this game's only wildness came from a single table-wide
  // flip-up rank). A GUARANTEED per-player wild card (the lowest, always
  // present) is a much bigger boost than that: with a 6-7 card hand, a lone
  // wild can almost always pair with something, and a second, independent
  // natural pair among the other 5-6 cards is itself likely (a birthday-
  // paradox-style collision over 13 ranks) -- so most hands clear a
  // TWO_PAIR-ish bar without even being genuinely strong. Empirically swept
  // shift values 2-5 across 30 mixed-player-count trials each: shift=2
  // resolved only 10/30 within 500 rounds (a cycle this rarely narrows to a
  // solo winner is a bug, not "some hands take longer" — same class of
  // issue as the original aggressive-always-stays bug this project already
  // hit once); shift=4 resolved 30/30 in ~9 rounds on average (a believable
  // real-guts-night escalation, not degenerate); shift=5 also resolved
  // 30/30 but averaged just 3 rounds, which felt too quick to be a genuine
  // "the pot escalates" experience. 4 was picked as the concrete default.
  categoryShift: 4,
  // 6-card version passes 1 left / 1 right; 7-card version passes 2 left /
  // 1 right — tied directly to which deal size is actually in play.
  passing(playerCount) {
    return playerCount >= 8 ? { left: 1, right: 1 } : { left: 2, right: 1 };
  },
  loserPolicy: "allNonWinners",
  // games.md's optional dealer's-choice dummy hand -- implemented
  // 2026-08-29 (previously a documented known gap). Off by default; see
  // rules-guts.js's createRoundState/resolveShowdown for the actual
  // mechanic (an extra unowned hand everyone who stays in has to beat
  // too, only dealt when it fits within one deck) and game-registry.js
  // for the variantOptions toggle.
  dummyHandEnabled: false,
};

// 2026-08-29: 3 Buy 5 / 5 Buy 5's two documented dealer's-choice options
// (deal size, and an extra wildcard rank on top of the always-wild 5s) are
// now real `variantOptions` (see game-registry.js) instead of fixed-forever
// judgment calls. dealSize functions and wildRanks arrays are named consts
// here (not inlined into the registry) so a variantOptions choice's `value`
// can be the exact same reference as THREE_BUY_FIVE_CONFIG's own default
// field -- variantFormMarkup/describeVariantChoice compare with ===.
function threeBuyFiveDealSizeFive() {
  return 5;
}
function threeBuyFiveDealSizeThree() {
  return 3;
}
const THREE_BUY_FIVE_WILD_5S_ONLY = ["5"];
// games.md doesn't specify a shape for "plus optional additional
// wildcards" -- 2s wild alongside the always-wild 5s is picked as a
// concrete, reasonably tame default for the "on" choice (a judgment call,
// same as the exchange price below).
const THREE_BUY_FIVE_WILD_5S_AND_2S = ["5", "2"];

const THREE_BUY_FIVE_CONFIG = {
  id: "threeBuyFive",
  name: "3 Buy 5 / 5 Buy 5",
  // games.md offers "3 or 5 cards" as two variants, dealer's choice; the
  // 5-card version is picked as the concrete default (a normal 5-card
  // poker hand). Now a real variantOptions choice -- see game-registry.js.
  dealSize: threeBuyFiveDealSizeFive,
  wildRanks: THREE_BUY_FIVE_WILD_5S_ONLY, // "5s are always wild" -- the base rule; the optional extra wildcard is a variantOptions choice (see game-registry.js)
  exchangePriceDollars: 1, // games.md says "dealer-set price" without a number -- a judgment call
  loserPolicy: "allNonWinners",
  // A bare pair happens close to half the time in a random 5-card hand --
  // shift the stay-in bar up one category so "stay in" stays a genuine
  // signal rather than something most hands clear. See
  // ai-guts-profiles.js's decideStayIn. The 3-card deal-size variant keeps
  // this same shift rather than a separately-tuned value -- a smaller hand
  // with 5s (and optionally 2s) wild still collides into a pair often
  // enough that the same one-category bump is a reasonable starting point;
  // not empirically re-swept the way Deep or Double Screw's shift was.
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
  // games.md's optional "agree a max loss per deal (e.g. $5)" cap on how
  // much a loser has to match -- now a real variantOptions choice (see
  // game-registry.js). Undefined/off means "match the full pot every
  // time," the base rule.
  maxLossPerDealDollars: undefined,
};

// Rebuilt 2026-08-30, after the user flagged the previously-documented
// "3s wild round 1, 5s wild round 2, 7s wild round 3" structure as
// genuinely confusing in play -- a player who folds while 3s are wild has
// no bearing on a later round where the wild rank has already moved on to
// 7s. The house rule is structurally a sibling of Deep or Double Screw
// (same shared engine below, same one-deal-then-pass-then-escalating-cycle
// shape) rather than its own bespoke fixed-3-round hand: 3s, 5s, AND 7s are
// all wild together, for the whole hand, known from the very first look at
// your cards -- not escalating at all. This REPLACES the old bespoke
// rules-guts-357.js/session-guts-357.js/table-ui-guts-357.js engine
// entirely (see game-registry.js) rather than adding a second game next to
// it, since the old entry was a researched "(New)" candidate the group
// never actually confirmed playing, not an established house rule worth
// preserving under its own name once corrected.
const THREE_FIVE_SEVEN_GUTS_CONFIG = {
  id: "threeFiveSeven",
  name: "3-5-7 Guts",
  // Same deck-size scaling as Deep or Double Screw -- 7 cards a hand,
  // trimmed to 6 at a full 8-player table.
  dealSize(playerCount) {
    return playerCount >= 8 ? 6 : 7;
  },
  wildRanks: ["3", "5", "7"],
  flipWildcardCount: 0, // optional dealer's-choice extra flip-up(s) on top -- see game-registry.js's variantOptions
  // Same passing shape as Deep or Double Screw, tied to the same deal size.
  passing(playerCount) {
    return playerCount >= 8 ? { left: 1, right: 1 } : { left: 2, right: 1 };
  },
  loserPolicy: "allNonWinners",
  // THREE simultaneously-wild ranks (12 of 52 cards) makes this hand shape
  // dramatically stronger than Deep or Double Screw's guaranteed-single-
  // wild-card: a random 7-card sample evaluates to Four of a Kind or
  // better roughly half the time. Deep or Double Screw's own shift=4 was
  // empirically re-swept for this config specifically (same "does the
  // cycle actually reach a solo winner in a believable number of rounds"
  // methodology) and turned out too low here -- it failed to resolve
  // within 40 rounds at 6-7 players. shift=6 resolved every sweep trial at
  // every table size (5-8 players) within 2-22 rounds, a believable
  // escalation pace; shift=8 also always resolved but usually in 1-4
  // rounds, felt too quick to be a real "the pot escalates" experience
  // (the same "too quick" call already made once for Deep or Double
  // Screw's own shift=5 sweep result). See ai-guts-profiles.js's
  // decideStayIn.
  categoryShift: 6,
  dummyHandEnabled: false, // optional dealer's-choice dummy hand -- see game-registry.js's variantOptions
};

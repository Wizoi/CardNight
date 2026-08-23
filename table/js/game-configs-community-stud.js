"use strict";

// Config objects turning the shared CommunityStudRules engine into specific
// games (games.md's Cincinnati and Criss Cross entries). Neither game's
// deal needs to scale by player count -- 5 hole cards/player + 5 community
// cards fits one deck comfortably even at a full 8-player table.
const CINCINNATI_CONFIG = {
  id: "cincinnati",
  name: "Cincinnati",
  holeCards: 5,
  communityCards: 5,
  bettingBeforeFirstReveal: false,
  // No wildcard in the base game -- games.md documents a variant wildcard
  // (whichever rank the final community card turns out to be) as dealer's
  // choice to add, not a rule. Left off here to match the base game; a
  // future toggle could flip this on.
  wildcardMode: null,
  handConstruction: CommunityStudRules.cincinnatiHandConstruction,
};

const CRISS_CROSS_CONFIG = {
  id: "crissCross",
  name: "Criss Cross (Iron Cross)",
  holeCards: 5,
  communityCards: 5,
  bettingBeforeFirstReveal: true,
  // Community cards are laid out top, left, CENTER, right, bottom (index 2
  // is the shared center card) and revealed in that same index order --
  // games.md doesn't specify a reveal order for the cross layout, so this
  // is a judgment call, not a documented rule.
  wildcardMode: null, // also dealer's-choice-only in games.md, left off to match the base game
  centerIndex: 2,
  arms: { horizontal: [1, 2, 3], vertical: [0, 2, 4] },
  handConstruction: CommunityStudRules.crissCrossHandConstruction,
  // Known gap: games.md documents an optional hi-lo variant (declaring
  // "both" must use the same single arm for both hands) -- not implemented
  // here, high-hand-only play, same pattern as Follow the Queen's
  // unimplemented "Low Chicago" side pot.
};

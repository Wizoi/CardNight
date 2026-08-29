"use strict";

// Every playable game, keyed by id. table-night.js dispatches to
// `createOrchestrator` when a game is picked; table-ui.js dispatches
// rendering to whichever table-ui-<family>.js module matches `uiFamily`.
//
// A game entry MAY declare `variantOptions`: an array of
// { key, label, choices: [{value, label}], default } describing dealer's-
// choice options games.md documents as optional on top of that game's base
// rule (see e.g. Deep or Double Screw's flip-up wildcards, or Cincinnati/
// Criss Cross's optional wildcard-rank variant). `key` must match a field
// name on that game's own gameConfig object, since applyVariants below is
// just a shallow merge -- no per-game translation layer needed. A game with
// no variantOptions (most of them, for now) skips the whole picker/summary
// step entirely and behaves exactly as before. table-ui.js is responsible
// for actually prompting for a choice (human picker) or picking each
// option's default and showing it clearly (AI picker) before the hand
// starts; table-night.js just threads whatever `variantChoices` object it's
// given through to createOrchestrator.
const GameRegistry = (function () {
  function applyVariants(baseConfig, variantChoices) {
    return variantChoices ? { ...baseConfig, ...variantChoices } : baseConfig;
  }

  // Every registered game's variantOptions default choices -- {} for a game
  // with no variantOptions at all. Used by table-night.js's autoPickForAI
  // (an AI dealer just plays the standard base rule) and by table-ui.js to
  // pre-select each radio group for a human picker.
  function defaultVariantChoices(entry) {
    const choices = {};
    for (const opt of entry.variantOptions || []) choices[opt.key] = opt.default;
    return choices;
  }

  const games = {
    midnightBaseball: {
      id: "midnightBaseball",
      name: "Midnight Baseball",
      uiFamily: "midnightBaseball",
      createOrchestrator: (config) => SessionMidnightBaseball.create(config),
    },
    daytimeBaseball: {
      id: "daytimeBaseball",
      name: "Daytime Baseball",
      uiFamily: "stud",
      createOrchestrator: (config) => SessionStud.create({ ...config, gameConfig: DAYTIME_BASEBALL_CONFIG }),
    },
    rainyDayBaseball: {
      id: "rainyDayBaseball",
      name: "Rainy Day Baseball",
      uiFamily: "stud",
      createOrchestrator: (config) => SessionStud.create({ ...config, gameConfig: RAINY_DAY_BASEBALL_CONFIG }),
    },
    freeEnterprise: {
      id: "freeEnterprise",
      name: "Free Enterprise",
      uiFamily: "stud",
      createOrchestrator: (config) => SessionStud.create({ ...config, gameConfig: FREE_ENTERPRISE_CONFIG }),
    },
    followTheQueen: {
      id: "followTheQueen",
      name: "Follow the Queen",
      uiFamily: "stud",
      createOrchestrator: (config) => SessionStud.create({ ...config, gameConfig: FOLLOW_THE_QUEEN_CONFIG }),
    },
    sevenAndWhatMakesIt: {
      id: "sevenAndWhatMakesIt",
      name: "Seven and What Makes It",
      uiFamily: "stud",
      createOrchestrator: (config) => SessionStud.create({ ...config, gameConfig: SEVEN_AND_WHAT_MAKES_IT_CONFIG }),
    },
    goodBadUgly: {
      id: "goodBadUgly",
      name: "The Good, the Bad and the Ugly",
      uiFamily: "stud",
      createOrchestrator: (config) => SessionStud.create({ ...config, gameConfig: GOOD_BAD_UGLY_CONFIG }),
    },
    mexicanSweat: {
      id: "mexicanSweat",
      name: "Mexican Sweat",
      uiFamily: "mexicanSweat",
      createOrchestrator: (config) => SessionMexicanSweat.create({ ...config, gameConfig: MEXICAN_SWEAT_CONFIG }),
    },
    cincinnati: {
      id: "cincinnati",
      name: "Cincinnati",
      uiFamily: "communityStud",
      variantOptions: [
        {
          key: "wildcardMode",
          label: "Wildcard",
          choices: [
            { value: null, label: "None (base game)" },
            { value: "lastRevealed", label: "Last community card's rank is wild" },
          ],
          default: null,
        },
      ],
      createOrchestrator: (config) => SessionCommunityStud.create({ ...config, gameConfig: applyVariants(CINCINNATI_CONFIG, config.variantChoices) }),
    },
    crissCross: {
      id: "crissCross",
      name: "Criss Cross (Iron Cross)",
      uiFamily: "communityStud",
      variantOptions: [
        {
          key: "wildcardMode",
          label: "Wildcard",
          choices: [
            { value: null, label: "None (base game)" },
            { value: "center", label: "Center card's rank is wild" },
          ],
          default: null,
        },
      ],
      createOrchestrator: (config) => SessionCommunityStud.create({ ...config, gameConfig: applyVariants(CRISS_CROSS_CONFIG, config.variantChoices) }),
    },
    deepOrDoubleScrew: {
      id: "deepOrDoubleScrew",
      name: "Deep or Double Screw",
      uiFamily: "guts",
      variantOptions: [
        {
          key: "flipWildcardCount",
          label: "Extra flip-up wildcards (on top of the lowest card, which is always wild)",
          choices: [
            { value: 0, label: "None" },
            { value: 1, label: "1 flip-up wildcard" },
            { value: 2, label: "2 flip-up wildcards" },
          ],
          default: 0,
        },
      ],
      createOrchestrator: (config) => SessionGuts.create({ ...config, gameConfig: applyVariants(DEEP_OR_DOUBLE_SCREW_CONFIG, config.variantChoices) }),
    },
    threeBuyFive: {
      id: "threeBuyFive",
      name: "3 Buy 5 / 5 Buy 5",
      uiFamily: "guts",
      createOrchestrator: (config) => SessionGuts.create({ ...config, gameConfig: THREE_BUY_FIVE_CONFIG }),
    },
    fourTwoTwo: {
      id: "fourTwoTwo",
      name: "Four-Two-Two",
      uiFamily: "guts",
      createOrchestrator: (config) => SessionGuts.create({ ...config, gameConfig: FOUR_TWO_TWO_CONFIG }),
    },
    threeFiveSeven: {
      id: "threeFiveSeven",
      name: "3-5-7 Guts",
      uiFamily: "guts357",
      createOrchestrator: (config) => SessionGuts357.create(config),
    },
    omaha: {
      id: "omaha",
      name: "Omaha",
      uiFamily: "holdem",
      createOrchestrator: (config) => SessionHoldem.create({ ...config, gameConfig: OMAHA_CONFIG }),
    },
    seattle: {
      id: "seattle",
      name: "Seattle",
      uiFamily: "holdem",
      createOrchestrator: (config) => SessionHoldem.create({ ...config, gameConfig: SEATTLE_CONFIG }),
    },
    boise: {
      id: "boise",
      name: "Boise",
      uiFamily: "holdem",
      createOrchestrator: (config) => SessionHoldem.create({ ...config, gameConfig: BOISE_CONFIG }),
    },
    jerseyHoldem: {
      id: "jerseyHoldem",
      name: "Jersey Hold'em",
      uiFamily: "holdem",
      createOrchestrator: (config) => SessionHoldem.create({ ...config, gameConfig: JERSEY_HOLDEM_CONFIG }),
    },
    fiveFiveTwentyOne: {
      id: "fiveFiveTwentyOne",
      name: "5.5-21",
      uiFamily: "pressYourLuck",
      createOrchestrator: (config) => SessionPressYourLuck.create({ ...config, gameConfig: FIVE_FIVE_TWENTYONE_CONFIG }),
    },
    sevenTwentySeven: {
      id: "sevenTwentySeven",
      name: "7-27",
      uiFamily: "pressYourLuck",
      createOrchestrator: (config) => SessionPressYourLuck.create({ ...config, gameConfig: SEVEN_TWENTYSEVEN_CONFIG }),
    },
    threeThirtyThree: {
      id: "threeThirtyThree",
      name: "3-33",
      uiFamily: "threeThirtyThree",
      createOrchestrator: (config) => Session333.create(config),
    },
    aceyDucey: {
      id: "aceyDucey",
      name: "Acey Ducey",
      uiFamily: "aceyDucey",
      createOrchestrator: (config) => SessionAceyDucey.create(config),
    },
    blindMansBluff: {
      id: "blindMansBluff",
      name: "Blind Man's Bluff",
      uiFamily: "blindMansBluff",
      createOrchestrator: (config) => SessionBlindMansBluff.create(config),
    },
    gameOfLife: {
      id: "gameOfLife",
      name: "Game of Life",
      uiFamily: "gameOfLife",
      createOrchestrator: (config) => SessionGameOfLife.create(config),
    },
    pairOfJacksTripsToWin: {
      id: "pairOfJacksTripsToWin",
      name: "Pair of Jacks, Trips to Win",
      uiFamily: "drawPoker",
      createOrchestrator: (config) => SessionDrawPoker.create(config),
    },
    anaconda: {
      id: "anaconda",
      name: "Anaconda (Pass the Trash)",
      uiFamily: "anaconda",
      createOrchestrator: (config) => SessionAnaconda.create(config),
    },
  };

  function list() {
    return Object.values(games);
  }

  function get(id) {
    return games[id] || null;
  }

  return { list, get, defaultVariantChoices };
})();

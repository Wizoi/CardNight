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

  // Same shape as defaultVariantChoices, but rolls a uniformly random
  // choice per option instead of always the default -- an AI dealer used
  // to always play the standard base rule (see the old comment on
  // autoPickForAI in table-night.js), but per the user's explicit request
  // (2026-08-29) an AI dealer now gambles on variants too, same as a human
  // picker could.
  function randomVariantChoices(entry) {
    const choices = {};
    for (const opt of entry.variantOptions || []) {
      choices[opt.key] = opt.choices[Math.floor(Math.random() * opt.choices.length)].value;
    }
    return choices;
  }

  // Free Enterprise's two documented price scales -- defined once so a
  // variantOptions choice's `value` and its `default` can be the exact same
  // object reference (variantFormMarkup/describeVariantChoice compare with
  // ===, not deep equality).
  const FREE_ENTERPRISE_STANDARD_PRICES = { priceScheduleDollars: [1, 2, 3], finalRoundMultiplier: 2 };
  const FREE_ENTERPRISE_CHEAP_PRICES = { priceScheduleDollars: [0.5, 1, 1.5], finalRoundMultiplier: 2 };

  // games.md's "House rule: playing with Jokers" -- dealer's choice to add
  // 1 or 2 Jokers to the deck as extra wildcards, for the specific games
  // games.md names as having no dedicated wildcard mechanic of their own
  // (Cincinnati, Criss Cross, Free Enterprise, Anaconda, Game of Life, Pair
  // of Jacks Trips to Win). Shared across all 6 entries below rather than
  // duplicated -- `key: "jokerCount"` matches the gameConfig field name
  // (Cincinnati/Criss Cross/Free Enterprise) read by Deck.buildDeck, or is
  // read directly off config.variantChoices by the 3 games below that have
  // no gameConfig object of their own (Anaconda, Game of Life, Pair of
  // Jacks Trips to Win).
  const JOKER_COUNT_VARIANT_OPTION = {
    key: "jokerCount",
    label: "Jokers in the deck (extra wildcards)",
    choices: [
      { value: 0, label: "None" },
      { value: 1, label: "1 Joker" },
      { value: 2, label: "2 Jokers" },
    ],
    default: 0,
  };

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
      variantOptions: [
        {
          key: "rainOutScope",
          label: "Rain-out scope",
          choices: [
            { value: undefined, label: "Whole hand rains out (base rule)" },
            { value: "dealtPlayerOnly", label: `"Once you're out, you're out" — only the dealt player is eliminated` },
          ],
          default: undefined,
        },
      ],
      createOrchestrator: (config) => SessionStud.create({ ...config, gameConfig: applyVariants(RAINY_DAY_BASEBALL_CONFIG, config.variantChoices) }),
    },
    freeEnterprise: {
      id: "freeEnterprise",
      name: "Free Enterprise",
      uiFamily: "stud",
      variantOptions: [
        {
          key: "enterprisePile",
          label: "Enterprise pile price scale",
          choices: [
            { value: FREE_ENTERPRISE_STANDARD_PRICES, label: "$1 / $2 / $3 by position" },
            { value: FREE_ENTERPRISE_CHEAP_PRICES, label: "Cheaper: $0.50 / $1 / $1.50 by position" },
          ],
          default: FREE_ENTERPRISE_STANDARD_PRICES,
        },
        JOKER_COUNT_VARIANT_OPTION,
      ],
      createOrchestrator: (config) => SessionStud.create({ ...config, gameConfig: applyVariants(FREE_ENTERPRISE_CONFIG, config.variantChoices) }),
    },
    followTheQueen: {
      id: "followTheQueen",
      name: "Follow the Queen",
      uiFamily: "stud",
      variantOptions: [
        {
          key: "lowChicago",
          label: "Low Chicago (best spade in the hole)",
          choices: [
            { value: false, label: "Off" },
            { value: true, label: "On — best concealed spade splits the pot" },
          ],
          default: false,
        },
      ],
      createOrchestrator: (config) => SessionStud.create({ ...config, gameConfig: applyVariants(FOLLOW_THE_QUEEN_CONFIG, config.variantChoices) }),
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
      variantOptions: [
        {
          key: "flipWildcard",
          label: "Wildcard",
          choices: [
            { value: true, label: "Flip a wildcard rank for the hand" },
            { value: false, label: "None (dealer's choice off)" },
          ],
          default: true,
        },
      ],
      createOrchestrator: (config) => SessionMexicanSweat.create({ ...config, gameConfig: applyVariants(MEXICAN_SWEAT_CONFIG, config.variantChoices) }),
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
        JOKER_COUNT_VARIANT_OPTION,
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
        {
          key: "hiLo",
          label: "Hi-lo",
          choices: [
            { value: false, label: "Off (high hand only)" },
            { value: true, label: "On — best qualifying low (from your high hand's arm) splits the pot" },
          ],
          default: false,
        },
        JOKER_COUNT_VARIANT_OPTION,
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
        {
          key: "dummyHandEnabled",
          label: "Dummy hand — an extra unowned hand everyone who stays in must also beat",
          choices: [
            { value: false, label: "None (base game)" },
            { value: true, label: "Deal a dummy hand (only if it fits at tonight's table size)" },
          ],
          default: false,
        },
      ],
      createOrchestrator: (config) => SessionGuts.create({ ...config, gameConfig: applyVariants(DEEP_OR_DOUBLE_SCREW_CONFIG, config.variantChoices) }),
    },
    threeBuyFive: {
      id: "threeBuyFive",
      name: "3 Buy 5 / 5 Buy 5",
      uiFamily: "guts",
      variantOptions: [
        {
          key: "dealSize",
          label: "Deal size",
          choices: [
            { value: threeBuyFiveDealSizeFive, label: "5 cards (5 Buy 5)" },
            { value: threeBuyFiveDealSizeThree, label: "3 cards (3 Buy 5)" },
          ],
          default: threeBuyFiveDealSizeFive,
        },
        {
          key: "wildRanks",
          label: "Extra wildcards (on top of the always-wild 5s)",
          choices: [
            { value: THREE_BUY_FIVE_WILD_5S_ONLY, label: "None" },
            { value: THREE_BUY_FIVE_WILD_5S_AND_2S, label: "2s also wild" },
          ],
          default: THREE_BUY_FIVE_WILD_5S_ONLY,
        },
      ],
      createOrchestrator: (config) => SessionGuts.create({ ...config, gameConfig: applyVariants(THREE_BUY_FIVE_CONFIG, config.variantChoices) }),
    },
    fourTwoTwo: {
      id: "fourTwoTwo",
      name: "Four-Two-Two",
      uiFamily: "guts",
      variantOptions: [
        {
          key: "maxLossPerDealDollars",
          label: "Max loss per deal",
          choices: [
            { value: undefined, label: "None (match the full pot every time)" },
            { value: 5, label: "$5 cap" },
          ],
          default: undefined,
        },
      ],
      createOrchestrator: (config) => SessionGuts.create({ ...config, gameConfig: applyVariants(FOUR_TWO_TWO_CONFIG, config.variantChoices) }),
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
      variantOptions: [JOKER_COUNT_VARIANT_OPTION],
      createOrchestrator: (config) => SessionGameOfLife.create(config),
    },
    pairOfJacksTripsToWin: {
      id: "pairOfJacksTripsToWin",
      name: "Pair of Jacks, Trips to Win",
      uiFamily: "drawPoker",
      variantOptions: [JOKER_COUNT_VARIANT_OPTION],
      createOrchestrator: (config) => SessionDrawPoker.create(config),
    },
    anaconda: {
      id: "anaconda",
      name: "Anaconda (Pass the Trash)",
      uiFamily: "anaconda",
      variantOptions: [
        {
          key: "hiLo",
          label: "Hi-lo",
          choices: [
            { value: false, label: "Off (high hand only)" },
            { value: true, label: "On — best qualifying low splits the pot" },
          ],
          default: false,
        },
        JOKER_COUNT_VARIANT_OPTION,
      ],
      createOrchestrator: (config) => SessionAnaconda.create(config),
    },
  };

  function list() {
    return Object.values(games);
  }

  function get(id) {
    return games[id] || null;
  }

  return { list, get, defaultVariantChoices, randomVariantChoices };
})();

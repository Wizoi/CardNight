"use strict";

// Every playable game, keyed by id. table-night.js dispatches to
// `createOrchestrator` when a game is picked; table-ui.js dispatches
// rendering to whichever table-ui-<family>.js module matches `uiFamily`.
const GameRegistry = (function () {
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
      createOrchestrator: (config) => SessionCommunityStud.create({ ...config, gameConfig: CINCINNATI_CONFIG }),
    },
    crissCross: {
      id: "crissCross",
      name: "Criss Cross (Iron Cross)",
      uiFamily: "communityStud",
      createOrchestrator: (config) => SessionCommunityStud.create({ ...config, gameConfig: CRISS_CROSS_CONFIG }),
    },
    deepOrDoubleScrew: {
      id: "deepOrDoubleScrew",
      name: "Deep or Double Screw",
      uiFamily: "guts",
      createOrchestrator: (config) => SessionGuts.create({ ...config, gameConfig: DEEP_OR_DOUBLE_SCREW_CONFIG }),
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
  };

  function list() {
    return Object.values(games);
  }

  function get(id) {
    return games[id] || null;
  }

  return { list, get };
})();

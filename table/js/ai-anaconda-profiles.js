"use strict";

// AI decisions for Anaconda. Discarding (both rounds) keeps whatever's
// part of a pair/group and throws the lowest lone cards first -- the same
// spirit as every other family's simple discard/pass heuristics in this
// project (Deep or Double Screw's passing, Pair of Jacks' draw). Betting
// mirrors the stud family's own shape: a player's own current best-
// achievable hand judged against a flat bar, scaled by how many of the 5
// reveal rounds are still left.
const AnacondaAIProfiles = (function () {
  function chooseDiscards(hand, count) {
    const rankCounts = {};
    for (const c of hand) rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
    const sorted = hand
      .map((c, i) => ({ c, i }))
      .sort((a, b) => {
        // A Joker is the single most valuable card in the deck (always
        // wild) -- never volunteer one for discard ahead of a real card.
        // A LONE Joker is never "grouped" by rank the way a pair is, so
        // without this check it fell into the same ungrouped bucket as
        // any other unpaired card and could get discarded well before a
        // genuinely low, ungrouped real card -- a real bug (reported
        // directly: a hand dealt with a wildcard Joker never showed one
        // at showdown across several hands).
        const aJoker = a.c.rank === "JOKER" ? 1 : 0;
        const bJoker = b.c.rank === "JOKER" ? 1 : 0;
        // Real bug, reported directly after live play (2026-11-23): this
        // comparator's sign was backwards from its own comment -- `bJoker -
        // aJoker` sorts a Joker to the FRONT of the array when it's `a`,
        // and `slice(0, count)` (below) discards from the front. So a
        // Joker was actually the FIRST card offered up for discard/pass,
        // the opposite of "never volunteer one ahead of a real card" this
        // same function was fixed to do once already (see the comment
        // above). `aJoker - bJoker` (matching decideArrangeOrder's own,
        // correctly-signed version just below) sorts Jokers to the END,
        // so the discard slice skips over them.
        if (aJoker !== bJoker) return aJoker - bJoker; // Jokers sort last -> kept
        const aGrouped = rankCounts[a.c.rank] >= 2 ? 1 : 0;
        const bGrouped = rankCounts[b.c.rank] >= 2 ? 1 : 0;
        if (aGrouped !== bGrouped) return aGrouped - bGrouped;
        return Deck.RANK_VALUES[a.c.rank] - Deck.RANK_VALUES[b.c.rank];
      });
    return sorted.slice(0, count).map((x) => x.i);
  }

  function decideDiscard1(player) {
    return chooseDiscards(player.hand, 3);
  }

  function decideDiscard2(player) {
    return chooseDiscards(player.hand, 2);
  }

  // Ordering the final 5 kept cards for reveal doesn't change the hand's
  // final VALUE at all -- only the drama/betting-information order of the
  // 5 reveal rounds. Reveals ungrouped, low-value cards first and holds
  // groups (pairs/trips/etc.) and any Joker back for the last rounds, so
  // opponents don't see this hand's real strength until late -- the same
  // "don't tip a big hand early" instinct chooseDiscards already applies
  // when deciding what to keep in the first place.
  function decideArrangeOrder(player) {
    const rankCounts = {};
    for (const c of player.hand) rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
    const sorted = player.hand
      .map((c, i) => ({ c, i }))
      .sort((a, b) => {
        const aJoker = a.c.rank === "JOKER" ? 1 : 0;
        const bJoker = b.c.rank === "JOKER" ? 1 : 0;
        if (aJoker !== bJoker) return aJoker - bJoker; // reveal Jokers last
        const aGrouped = rankCounts[a.c.rank] >= 2 ? 1 : 0;
        const bGrouped = rankCounts[b.c.rank] >= 2 ? 1 : 0;
        if (aGrouped !== bGrouped) return aGrouped - bGrouped; // reveal groups last
        return Deck.RANK_VALUES[a.c.rank] - Deck.RANK_VALUES[b.c.rank];
      });
    return sorted.map((x) => x.i);
  }

  // The raise bar tightens the more of the 5 reveal rounds are still to
  // come, instead of one flat threshold for the whole hand -- same fix
  // applied everywhere else this pattern existed (2026-08-29, reported
  // against Criss Cross).
  function raiseBarFor(revealsLeft, profile, barAdjustment) {
    if (revealsLeft <= 0) return HandEvaluator.CATEGORY.TRIPS;
    return Math.min(HandEvaluator.CATEGORY.STRAIGHT_FLUSH, profile.raiseMinCategory + Math.floor(revealsLeft / 2) + (barAdjustment || 0));
  }

  function decideBet(player, state, profile) {
    const br = state.bettingRound;
    const toCallChips = br.currentBetChips - br.committed[player.id];
    const cards = player.hand.map((c) => ({ rank: c.rank, suit: c.suit, isWild: c.rank === "JOKER" }));
    const myHand = HandEvaluator.evaluatePartial(cards);
    const revealsLeft = 5 - state.revealsDone;
    // Incidental mechanics bug, flagged alongside design review finding #4
    // (not an archetype-tuning issue): revealsLeft used to stand in for
    // "chances to improve" at every betting point, but a player's own hand
    // is fully fixed the moment the second discard resolves ("betting2"
    // onward) -- the 5 reveal rounds after that only change what OPPONENTS
    // can see, never this player's own cards. Crediting "3 reveals left"
    // as 3 more chances to improve a fixed hand made the fold gate
    // archetype-sensitive to a signal that doesn't exist post-discard2 (a
    // Fortress folding high-card with "3 reveals left," a Live Wire never
    // doing so, on a hand neither of them can actually still change).
    // Only "betting1" (before the second discard still has a real, if
    // player-controlled rather than random, cut ahead of it) keeps the
    // credit.
    const cardsStillUnfixed = state.status === "betting1" ? revealsLeft : 0;

    if (AIProfiles.shouldBluff(profile)) {
      const maxRaise = RulesAnaconda.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) return { action: "raise", raiseDollars: AIProfiles.scaledRaiseDollars(AIProfiles.bluffRaiseTier(profile), state.raiseIncrementDollars, maxRaise) };
    }

    if (toCallChips > 0) {
      const callWorthyCategory = AIProfiles.callWorthyCategoryFor(HandEvaluator.CATEGORY.PAIR, profile, toCallChips, state.pot);
      const gap = callWorthyCategory - myHand.category;
      const chanceBonus =
        AIProfiles.potOddsChanceBonus(toCallChips, state.pot) +
        AIProfiles.reRaiseChanceAdjustment(br, player.id, profile) +
        AIProfiles.opponentLoosenessAdjustment(state.opponentStats, AIProfiles.liveOpponentIds(state.players, player.id), profile);
      if (gap > 0 && cardsStillUnfixed * (profile.chancePerCard + chanceBonus) < gap) return { action: "fold" };
    }
    const barAdjustment = AIProfiles.opponentCountBarAdjustment(AIProfiles.liveOpponentCount(state.players, player.id));
    const bar = raiseBarFor(revealsLeft, profile, barAdjustment);
    if (profile.raiseWhenLeading && myHand.category >= bar) {
      const maxRaise = RulesAnaconda.maxRaiseDollars(state, player.id);
      if (maxRaise > 0) {
        const tier = AIProfiles.confidenceTier(myHand.category - bar);
        return { action: "raise", raiseDollars: AIProfiles.scaledRaiseDollars(tier, state.raiseIncrementDollars, maxRaise) };
      }
    }
    return { action: "call" };
  }

  return { decideDiscard1, decideDiscard2, decideArrangeOrder, decideBet };
})();

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

  // Generates every k-combination of the indices [0, n) -- small and cheap
  // at this hand's sizes (C(7,5) = 21).
  function combinationIndices(n, k) {
    const result = [];
    function helper(start, combo) {
      if (combo.length === k) {
        result.push(combo.slice());
        return;
      }
      for (let i = start; i < n; i++) {
        combo.push(i);
        helper(i + 1, combo);
        combo.pop();
      }
    }
    helper(0, []);
    return result;
  }

  // Real bug, found during the 2026-11-23 archetype design review and
  // fixed alongside finding #4 (not an archetype tweak -- a correctness
  // bug any profile could hit): chooseDiscards' heuristic only tracks RANK
  // groups, so it could discard the two cards that would have completed a
  // straight or flush, down to a lesser pair -- e.g. 7 cards
  // 4h 5h 7h 9h Kh 2c 2d discarded 4h/5h for a pair of 2s instead of
  // keeping the heart flush, even though decideBet's own betting1 read
  // (evaluatePartial over all 7 cards) had already bet on the flush that
  // was about to be thrown away. Fixed by actually trying every one of the
  // C(7,5)=21 keep-sets through HandEvaluator.bestHand (which already
  // handles a Joker's wild identity correctly) and keeping whichever 5
  // genuinely score best, rather than a rank-only heuristic.
  function decideDiscard2(player) {
    const hand = player.hand;
    const n = hand.length;
    // Always discards exactly 2 (games.md's round-2 rule), keeping n-2 --
    // the real game always calls this with the full 7-card post-pass
    // hand (keepCount 5), but this stays well-defined for any n rather
    // than silently discarding everything (including a Joker) if it's
    // ever handed fewer cards than that.
    const keepCount = Math.max(0, n - 2);
    let bestKeep = null;
    let bestEval = null;
    for (const keepIdx of combinationIndices(n, keepCount)) {
      const cards = keepIdx.map((i) => ({ rank: hand[i].rank, suit: hand[i].suit, isWild: hand[i].rank === "JOKER" }));
      const evaluated = HandEvaluator.bestHand(cards);
      if (!bestEval || HandEvaluator.isBetter(evaluated, bestEval)) {
        bestEval = evaluated;
        bestKeep = keepIdx;
      }
    }
    const keepSet = new Set(bestKeep);
    const discardIdx = [];
    for (let i = 0; i < n; i++) if (!keepSet.has(i)) discardIdx.push(i);
    return discardIdx;
  }

  // Ordering the final 5 kept cards for reveal doesn't change the hand's
  // final VALUE at all -- only the drama/betting-information order of the
  // 5 reveal rounds, which is exactly where a tell lives: no AI ever reads
  // another player's revealed cards in decideBet, so this only affects
  // what the HUMAN can learn from watching an AI's reveal order.
  //
  // presentationStyle (design review follow-up, 2026-11-24 -- reuses
  // profile.bluffSizing, already modeling "how this archetype presents
  // strength," rather than inventing a new field) picks among 3 orders:
  // "conceal" (the default/original behavior, every profile except the 2
  // below) reveals ungrouped, low-value cards first and holds groups and
  // any Joker back for the last rounds -- the same "don't tip a big hand
  // early" instinct chooseDiscards already applies. "flaunt" (Live Wire)
  // reverses that order entirely -- show strength early specifically to
  // see who flinches. "mask" (the Wall) shuffles the order randomly
  // instead of reversing it, since a reversed order is itself a readable
  // pattern once you've seen it a few times -- a genuinely random order
  // can't be read either way. The Subversive keeps its default conceal
  // order but occasionally flaunts instead (AIProfiles.breaksPattern,
  // rate 0.15) -- "deliberately breaking its own established tells
  // mid-session," per subversive.md.
  function decideArrangeOrder(player, profile) {
    const rankCounts = {};
    for (const c of player.hand) rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
    const concealOrder = player.hand
      .map((c, i) => ({ c, i }))
      .sort((a, b) => {
        const aJoker = a.c.rank === "JOKER" ? 1 : 0;
        const bJoker = b.c.rank === "JOKER" ? 1 : 0;
        if (aJoker !== bJoker) return aJoker - bJoker; // reveal Jokers last
        const aGrouped = rankCounts[a.c.rank] >= 2 ? 1 : 0;
        const bGrouped = rankCounts[b.c.rank] >= 2 ? 1 : 0;
        if (aGrouped !== bGrouped) return aGrouped - bGrouped; // reveal groups last
        return Deck.RANK_VALUES[a.c.rank] - Deck.RANK_VALUES[b.c.rank];
      })
      .map((x) => x.i);

    if (!profile) return concealOrder;
    const style = AIProfiles.presentationStyle(profile);
    const wantsFlaunt = style === "flaunt" || (style === "conceal" && AIProfiles.breaksPattern(profile));
    if (wantsFlaunt) return concealOrder.slice().reverse();
    if (style === "mask") {
      const shuffled = concealOrder.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = tmp;
      }
      return shuffled;
    }
    return concealOrder;
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
    const revealsLeft = 5 - state.revealsDone; // still used by raiseBarFor below
    // Incidental mechanics bug, originally flagged alongside design review
    // finding #4 and only half-fixed at the time (caught in a follow-up
    // review, 2026-11-23): `revealsLeft` used to stand in for "chances to
    // improve" at every betting point, and the first pass at this only
    // scoped that credit to "betting1" on the theory that the still-ahead
    // second discard left real uncertainty there. It doesn't: `myHand` is
    // computed via `evaluatePartial` over the player's CURRENT full hand,
    // which already picks the best achievable 5-card combination from
    // whatever's in it (the same best-of-N logic `bestHand` uses
    // elsewhere) -- so by the time passing resolves and betting1 begins,
    // a player's own eventual hand value is already fully determined.
    // Discard2 can only ever keep or match that same already-found best-5
    // (removing 2 of the 7 cards can't improve on a selection already
    // optimal over all 7), and the 5 reveal rounds after that only change
    // what OPPONENTS can see. There is no stage in Anaconda, after the
    // initial deal-and-pass, where a player's own achievable category can
    // still change by chance -- so there's genuinely nothing left to
    // credit, at any status, not just post-"betting2". Multiplying by a
    // "reveals left" count stops making sense at all once that count is
    // always 0 -- so unlike every OTHER family's fold gate (where
    // cardsLeft legitimately represents real future improvement chances),
    // Anaconda's own chancePerCard is applied as a flat, unscaled
    // allowance instead: "how much benefit of the doubt this archetype
    // gives a close-but-not-quite KNOWN hand," not "how many more flips
    // might help" (there are none). This still differentiates archetypes
    // by their relative looseness (Live Wire's high chancePerCard still
    // tolerates a real gap; Fortress's low one barely tolerates any), it
    // just no longer multiplies that tolerance by a nonexistent reveal
    // count.
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
      if (gap > 0 && profile.chancePerCard + chanceBonus < gap) {
        // Hero call (design review finding #10, closed out 2026-11-23):
        // currently only Subversive's patternBreakRate ever fires this --
        // calling anyway despite a read that says fold.
        if (AIProfiles.shouldHeroCall(profile)) return { action: "call" };
        return { action: "fold" };
      }
    }
    const barAdjustment = AIProfiles.opponentCountBarAdjustment(AIProfiles.liveOpponentCount(state.players, player.id));
    const bar = raiseBarFor(revealsLeft, profile, barAdjustment);
    if ((profile.raiseWhenLeading || AIProfiles.breaksPattern(profile)) && myHand.category >= bar) {
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

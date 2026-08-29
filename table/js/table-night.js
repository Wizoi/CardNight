"use strict";

// Persists for a whole sitting ("night") instead of resetting per game: the
// roster/wallets, seat order, chip history, and cross-game hand tallies, plus
// the new game-selection ceremony (cut-for-deal, picker rotation). Only an
// explicit cash-out ends the night; changing games mid-sitting keeps wallets
// and seats exactly as they are. Owns whichever per-game orchestrator
// (SessionMidnightBaseball / SessionStud) is currently active, created via
// GameRegistry.
const TableNight = (function () {
  let players = [];
  let seatOrder = []; // player ids in physical seating order, fixed for the night
  let settings = null;
  let history = null;
  let today = null;
  let handsWonByPlayerId = {}; // across every game played this whole night
  let nightHandsPlayed = 0; // never resets; what actually lands in history
  // Whoever holds the dealer button for the upcoming game is also the picker
  // for it -- games.md doesn't document a picker mechanic at all (it's an
  // app-only meta-layer), but "the next dealer picks" is the natural fit,
  // and used to NOT be true: an earlier version tracked a separate
  // currentPickerSeatIndex that just advanced one seat per game-end,
  // completely independent of the dealer button. There is deliberately no
  // separate picker-seat variable anymore -- currentPickerSeatId() below
  // just reads dealerIndex directly.
  let dealerIndex = 0; // continuous across game changes -- advanced in rotatePickerAfterGameEnds, BEFORE the picker screen shows (not in chooseNextGame, which only consumes the already-current value)
  let cutForDealState = null; // stepwise reveal state for the cut-for-deal screen, once per night -- see beginCutForDeal
  let activeGameId = null;
  let activeOrchestrator = null;
  let gameMemoryByGameId = {}; // fresh {} each time a game is (freshly) started
  // A rained-out hand's pot is meant to carry into that SAME game's next
  // hand -- but if the table switches away before that game comes back
  // around, the orchestrator holding it in memory gets discarded outright.
  // Stashing it here (rather than losing it) keeps those already-collected
  // ante chips from silently dropping out of the tracked total; it's handed
  // back to the game as its next carriedPotChips whenever it's next chosen.
  let carriedPotByGameId = {};
  let onUpdate = () => {};

  function notify() {
    onUpdate(getViewState());
  }

  function getHuman() {
    return players.find((p) => p.isHuman);
  }

  function init(config, updateCallback) {
    onUpdate = updateCallback || (() => {});
    settings = {
      anteDollars: 0.5,
      raiseIncrementDollars: 0.25,
      maxBetDollars: 2,
      initialBuyInDollars: config.buyInDollars || 20,
      rebuyCapDollars: config.rebuyCapDollars || 60,
    };
    history = HistoryStore.load();
    today = HistoryStore.todayDateString();

    const humanWallet = ChipEconomy.createWallet({
      initialBuyInDollars: settings.initialBuyInDollars,
      rebuyCapDollars: settings.rebuyCapDollars,
      isTracked: true,
    });
    players = [{ id: "human", name: config.humanName || "You", isHuman: true, wallet: humanWallet, profileName: null, folded: false }];

    const seatCount = config.seatCount || 6;
    const usedPersonIds = [];
    for (let i = 1; i < seatCount; i++) {
      const assignedId = config.aiSeatAssignments && config.aiSeatAssignments[i - 1];
      let person = assignedId ? TablePeople.getById(assignedId) : null;
      if (!person) person = TablePeople.randomUnused(usedPersonIds);
      usedPersonIds.push(person.id);
      players.push({
        id: `ai-${i}`,
        name: person.name,
        isHuman: false,
        wallet: ChipEconomy.createWallet({ initialBuyInDollars: settings.initialBuyInDollars, rebuyCapDollars: 0, isTracked: false }),
        profileName: TablePeople.profileFor(person.archetypeId),
        folded: false,
        tablePersonId: person.id,
        pronouns: person.pronouns,
        archetypeId: person.archetypeId,
        archetypeLabel: person.archetypeLabel,
        avatarSpec: person.avatar,
      });
    }

    seatOrder = players.map((p) => p.id);
    dealerIndex = 0;
    nightHandsPlayed = 0;
    handsWonByPlayerId = {};
    cutForDealState = null;
    activeGameId = null;
    activeOrchestrator = null;
    gameMemoryByGameId = {};
    recordDayProgress();
    notify();
  }

  // Every seat draws one card from a single shared, anonymous fan -- nobody
  // (the human included) knows in advance which position holds which card,
  // so picking one is a genuine choice rather than just revealing a value
  // already secretly assigned to your name (2026-08-29 redesign, at the
  // user's request: the old per-seat layout telegraphed which face-down
  // card was already "yours" before you ever clicked it, which read as
  // trusting the computer's pre-assignment rather than a real cut). Claims
  // don't have to happen in seat order -- the human can click any open
  // position whenever they like, and AI seats claim a random remaining
  // position on their own pace, in random order, not strictly one-by-one
  // by seat. Highest card picks the first game. A tie redeals a fresh
  // anonymous fan to just the tied seats (closer to a physical re-cut than
  // a fresh shuffle for everyone).
  function beginCutForDeal() {
    const deck = Deck.shuffle(Deck.buildDeck());
    cutForDealState = {
      deck,
      cursor: 0,
      eligibleSeatIds: seatOrder.slice(),
      currentRound: seatOrder.map((_, slotIndex) => ({ slotIndex, seatId: null, card: null, revealed: false })),
      tieBreakInProgress: false,
      status: "revealing",
      winnerSeatId: null,
    };
    notify();
    return cutForDealState;
  }

  // Claims one specific open slot in the shared fan for a seat -- a no-op
  // if that slot's already taken, or if this seat already claimed a
  // different slot this round, or once the cut is decided. Safe to call
  // repeatedly / redundantly.
  function claimCutForDealSlot(seatId, slotIndex) {
    if (!cutForDealState || cutForDealState.status === "complete") return;
    if (!cutForDealState.eligibleSeatIds.includes(seatId)) return;
    if (cutForDealState.currentRound.some((e) => e.seatId === seatId)) return;
    const entry = cutForDealState.currentRound[slotIndex];
    if (!entry || entry.revealed) return;
    entry.card = cutForDealState.deck[cutForDealState.cursor++];
    entry.revealed = true;
    entry.seatId = seatId;
    notify();
    maybeResolveCutForDealRound();
  }

  // AI seats don't pick a specific position on purpose -- they reach for a
  // random still-open one, same as a human just grabbing whichever card is
  // convenient from a real fan.
  function autoClaimCutForDealSlot(seatId) {
    if (!cutForDealState) return;
    const openSlots = cutForDealState.currentRound.filter((e) => !e.revealed);
    if (!openSlots.length) return;
    const slot = openSlots[Math.floor(Math.random() * openSlots.length)];
    claimCutForDealSlot(seatId, slot.slotIndex);
  }

  function maybeResolveCutForDealRound() {
    const round = cutForDealState.currentRound;
    if (!round.every((e) => e.revealed)) return;
    const maxValue = Math.max(...round.map((e) => Deck.RANK_VALUES[e.card.rank]));
    const winners = round.filter((e) => Deck.RANK_VALUES[e.card.rank] === maxValue);
    if (winners.length === 1) {
      cutForDealState.status = "complete";
      cutForDealState.winnerSeatId = winners[0].seatId;
      // High card both deals AND picks the night's first game -- the two
      // were already meant to be the same seat, just tracked separately
      // before.
      dealerIndex = seatOrder.indexOf(winners[0].seatId);
    } else {
      cutForDealState.tieBreakInProgress = true;
      cutForDealState.eligibleSeatIds = winners.map((w) => w.seatId);
      cutForDealState.currentRound = winners.map((_, slotIndex) => ({ slotIndex, seatId: null, card: null, revealed: false }));
    }
    notify();
  }

  function currentPickerSeatId() {
    return seatOrder[dealerIndex];
  }

  function currentPickerIsHuman() {
    return currentPickerSeatId() === getHuman().id;
  }

  function onHandComplete(result) {
    nightHandsPlayed += 1;
    if (result.winnerId) {
      handsWonByPlayerId[result.winnerId] = (handsWonByPlayerId[result.winnerId] || 0) + 1;
    }
    // Mirror the outgoing orchestrator's own "carry to next hand" state
    // against the game it belongs to (see carriedPotByGameId above) -- an
    // overwrite, not an accumulator, so it always reflects "what's currently
    // outstanding for this game," not a running total. potChips > 0 covers
    // every game's own reason for carrying a pot forward (a stud rain-out,
    // a guts family cycle nobody's won outright yet, draw poker's "nobody
    // qualified" redeal, etc.) -- not just rainedOut, which only guts' own
    // hi-lo-style sibling games ever actually set.
    carriedPotByGameId[activeGameId] = result.potChips || 0;
    recordDayProgress();
  }

  // Switching games abandons whatever hand is currently in progress (via
  // "Change game" between hands, or the debug "Jump to game" control mid-hand
  // -- see the note on that control below). A hand that already finished
  // (status === "complete") is left alone -- it's already been paid out (or,
  // for a rain-out/no-contest/cycle-continues completion, its outstanding
  // pot is already tracked via carriedPotByGameId through onHandComplete).
  // A genuinely UNFINISHED hand, though, can be sitting on real ante/bet
  // chips already taken out of players' wallets with nobody ever awarded
  // them -- discarding the orchestrator would let those chips silently drop
  // out of the tracked total. Refunding state.pot evenly back to every
  // dealt player is an approximation (it doesn't reconstruct exactly who
  // contributed how much through folds/raises), but it keeps the total chips
  // in the system conserved, which is the substantive part of "as though
  // this hand never started."
  function refundAbandonedHand(vs) {
    const state = vs.state;
    if (!state || state.status === "complete" || !state.pot) return;
    const share = Math.floor(state.pot / vs.players.length);
    const remainder = state.pot - share * vs.players.length;
    vs.players.forEach((p, i) => {
      ChipEconomy.award(p.wallet, share + (i < remainder ? 1 : 0));
    });
  }

  // variantChoices is an optional {key: value} object matching whatever the
  // chosen game's own variantOptions declare (see game-registry.js) -- a
  // dealer's-choice pick made before the hand starts, e.g. Deep or Double
  // Screw's extra flip-up wildcard count. Games with no variantOptions just
  // ignore an omitted/empty object (createOrchestrator's applyVariants is a
  // no-op without one).
  function chooseNextGame(gameId, variantChoices) {
    const entry = GameRegistry.get(gameId);
    if (!entry) return;
    // dealerIndex for the upcoming game is already current by this point --
    // rotatePickerAfterGameEnds() advances it (from wherever the outgoing
    // game's own per-hand dealer rotation landed) BEFORE the picker screen
    // ever shows, since the picker IS the upcoming dealer and needs to be
    // known before anyone (human or AI) picks. Calling chooseNextGame
    // directly without going through that first -- only the debug "Jump to
    // game" shortcut does this, bypassing the whole ceremony on purpose --
    // just leaves dealerIndex wherever it already was.
    if (activeOrchestrator) {
      refundAbandonedHand(activeOrchestrator.getViewState());
    }
    activeGameId = gameId;
    gameMemoryByGameId[gameId] = {};
    // Hand back whatever carried pot this game left outstanding last time it
    // was played (e.g. a Rainy Day rain-out that never got revisited before
    // the table switched games) -- see carriedPotByGameId above. Cleared
    // once consumed so it isn't re-applied a second time if this game is
    // picked again later without ever completing a hand in between.
    const carriedPotChips = carriedPotByGameId[gameId] || 0;
    carriedPotByGameId[gameId] = 0;
    activeOrchestrator = entry.createOrchestrator({
      players,
      settings,
      dealerIndex,
      handNumber: 0,
      gameMemory: gameMemoryByGameId[gameId],
      carriedPotChips,
      variantChoices,
      onUpdate: () => notify(),
      onHandComplete,
    });
    notify();
  }

  // AI pickers choose uniformly at random among every registered game for
  // now -- a natural later upgrade is weighting by archetype/house-favorite
  // data once games.md's "house favorite rating" field has real values. An
  // AI dealer always just plays each variant option's own default (the
  // standard base rule) rather than gambling on a random variant too --
  // table-ui.js is responsible for showing the human what was picked,
  // including any variants, before the table view appears.
  function autoPickForAI() {
    const list = GameRegistry.list();
    const choice = list[Math.floor(Math.random() * list.length)];
    const variantChoices = GameRegistry.defaultVariantChoices(choice);
    chooseNextGame(choice.id, variantChoices);
    return { choice, variantChoices };
  }

  // Called once the "Change game" button is clicked (only enabled between
  // hands, per its own gating in table-ui.js) to end the current game and
  // show the picker for the next one. The dealer button keeps rotating
  // continuously across the whole night, ignoring game boundaries -- seed it
  // one seat past wherever the outgoing game's own per-hand dealer rotation
  // landed. Since the picker for the upcoming game IS the upcoming dealer
  // (currentPickerSeatId() just reads dealerIndex), this has to happen here,
  // before the picker screen shows -- not in chooseNextGame, which only
  // runs once someone's already made their choice.
  function rotatePickerAfterGameEnds() {
    if (activeOrchestrator) {
      const vs = activeOrchestrator.getViewState();
      dealerIndex = (vs.dealerIndex + 1) % players.length;
    }
    activeGameId = null;
    activeOrchestrator = null;
    notify();
  }

  function recordDayProgress() {
    const human = getHuman();
    const wallet = human.wallet;
    const day = {
      date: today,
      initialBuyInDollars: wallet.initialBuyInDollars,
      rebuys: wallet.rebuys,
      currentChipsDollars: ChipEconomy.chipsToDollars(wallet.chips),
      cashedOutDollars: wallet.cashedOutDollars,
      net: ChipEconomy.netDollars(wallet),
      handsPlayed: nightHandsPlayed,
      tablePeople: players
        .filter((p) => !p.isHuman)
        .map((p) => ({
          id: p.tablePersonId,
          name: p.name,
          archetypeLabel: p.archetypeLabel,
          pronouns: p.pronouns,
          handsWon: handsWonByPlayerId[p.id] || 0,
          netDollars: ChipEconomy.netDollars(p.wallet),
        })),
    };
    history = HistoryStore.upsertDay(history, day);
  }

  function canRebuy(dollars) {
    return ChipEconomy.canRebuy(getHuman().wallet, dollars);
  }

  function rebuy(dollars) {
    const ok = ChipEconomy.rebuy(getHuman().wallet, dollars, Date.now());
    if (ok) recordDayProgress();
    notify();
    return ok;
  }

  function cashOut() {
    ChipEconomy.cashOut(getHuman().wallet);
    recordDayProgress();
    notify();
  }

  function exportHistory() {
    HistoryStore.downloadExport(history);
  }

  function peekHistory() {
    if (!history) {
      history = HistoryStore.load();
      today = HistoryStore.todayDateString();
    }
    return history;
  }

  function getViewState() {
    return {
      players,
      seatOrder,
      humanId: "human",
      settings,
      history,
      today,
      currentPickerSeatIndex: dealerIndex, // the picker IS the upcoming dealer -- see currentPickerSeatId()
      cutForDealState,
      activeGameId,
      gameList: GameRegistry.list(),
      orchestratorViewState: activeOrchestrator ? activeOrchestrator.getViewState() : null,
    };
  }

  return {
    init,
    beginCutForDeal,
    claimCutForDealSlot,
    autoClaimCutForDealSlot,
    currentPickerSeatId,
    currentPickerIsHuman,
    chooseNextGame,
    autoPickForAI,
    rotatePickerAfterGameEnds,
    canRebuy,
    rebuy,
    cashOut,
    exportHistory,
    peekHistory,
    getViewState,
    get orchestrator() {
      return activeOrchestrator;
    },
  };
})();

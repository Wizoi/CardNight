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
  let dealerIndex = 0; // continuous across game changes -- see chooseNextGame
  let currentPickerSeatIndex = 0;
  let cutForDealState = null; // stepwise reveal state for the cut-for-deal screen, once per night -- see beginCutForDeal
  let activeGameId = null;
  let activeOrchestrator = null;
  let gameMemoryByGameId = {}; // fresh {} each time a game is (freshly) started
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
    currentPickerSeatIndex = 0;
    cutForDealState = null;
    activeGameId = null;
    activeOrchestrator = null;
    gameMemoryByGameId = {};
    recordDayProgress();
    notify();
  }

  // Every seat draws one card from a shared fan, face down, revealed one at
  // a time (the human clicks their own card; AI seats reveal on their own
  // pace) instead of everyone's card being dealt and shown all at once --
  // a physical cut-for-deal is something each player actually does, not
  // something that just happens to them. Highest card picks the first
  // game. A tie redeals a fresh face-down card to just the tied seats
  // (closer to a physical re-cut than a fresh shuffle for everyone).
  function beginCutForDeal() {
    const deck = Deck.shuffle(Deck.buildDeck());
    cutForDealState = {
      deck,
      cursor: 0,
      currentRound: seatOrder.map((seatId) => ({ seatId, card: null, revealed: false })),
      tieBreakInProgress: false,
      status: "revealing",
      winnerSeatId: null,
    };
    notify();
    return cutForDealState;
  }

  // Flips one seat's own next card. Safe to call repeatedly / out of order
  // -- a no-op once that seat's already revealed or the cut is decided.
  function revealCutForDealSeat(seatId) {
    if (!cutForDealState || cutForDealState.status === "complete") return;
    const entry = cutForDealState.currentRound.find((e) => e.seatId === seatId);
    if (!entry || entry.revealed) return;
    entry.card = cutForDealState.deck[cutForDealState.cursor++];
    entry.revealed = true;
    notify();
    maybeResolveCutForDealRound();
  }

  function maybeResolveCutForDealRound() {
    const round = cutForDealState.currentRound;
    if (!round.every((e) => e.revealed)) return;
    const maxValue = Math.max(...round.map((e) => Deck.RANK_VALUES[e.card.rank]));
    const winners = round.filter((e) => Deck.RANK_VALUES[e.card.rank] === maxValue);
    if (winners.length === 1) {
      cutForDealState.status = "complete";
      cutForDealState.winnerSeatId = winners[0].seatId;
      currentPickerSeatIndex = seatOrder.indexOf(winners[0].seatId);
    } else {
      cutForDealState.tieBreakInProgress = true;
      cutForDealState.currentRound = winners.map((w) => ({ seatId: w.seatId, card: null, revealed: false }));
    }
    notify();
  }

  function currentPickerSeatId() {
    return seatOrder[currentPickerSeatIndex];
  }

  function currentPickerIsHuman() {
    return currentPickerSeatId() === getHuman().id;
  }

  function onHandComplete(result) {
    nightHandsPlayed += 1;
    if (result.winnerId) {
      handsWonByPlayerId[result.winnerId] = (handsWonByPlayerId[result.winnerId] || 0) + 1;
    }
    recordDayProgress();
  }

  function chooseNextGame(gameId) {
    const entry = GameRegistry.get(gameId);
    if (!entry) return;
    // The dealer button keeps rotating continuously across the whole night,
    // ignoring game boundaries -- seed the new orchestrator one seat past
    // wherever the outgoing one's dealer landed (or seat 0 for the night's
    // very first game).
    if (activeOrchestrator) {
      const vs = activeOrchestrator.getViewState();
      dealerIndex = (vs.dealerIndex + 1) % players.length;
    }
    activeGameId = gameId;
    gameMemoryByGameId[gameId] = {};
    activeOrchestrator = entry.createOrchestrator({
      players,
      settings,
      dealerIndex,
      handNumber: 0,
      gameMemory: gameMemoryByGameId[gameId],
      onUpdate: () => notify(),
      onHandComplete,
    });
    notify();
  }

  // AI pickers choose uniformly at random among every registered game for
  // now -- a natural later upgrade is weighting by archetype/house-favorite
  // data once games.md's "house favorite rating" field has real values.
  function autoPickForAI() {
    const list = GameRegistry.list();
    const choice = list[Math.floor(Math.random() * list.length)];
    chooseNextGame(choice.id);
    return choice;
  }

  function rotatePickerAfterGameEnds() {
    currentPickerSeatIndex = (currentPickerSeatIndex + 1) % seatOrder.length;
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
      currentPickerSeatIndex,
      cutForDealState,
      activeGameId,
      gameList: GameRegistry.list(),
      orchestratorViewState: activeOrchestrator ? activeOrchestrator.getViewState() : null,
    };
  }

  return {
    init,
    beginCutForDeal,
    revealCutForDealSeat,
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

// Structured game data for the CardNight app.
// Hand-curated from ../games.md — the prose doc is still the source of truth for house rules.
// If games.md changes, update the matching entry here too; there's no automated sync.

const GAMES = [
  {
    id: "3-buy-5-5-buy-5",
    name: "3 Buy 5 / 5 Buy 5",
    category: "Guts",
    extraCategories: ["Poker Scored"],
    isNew: false,
    icon: "💵",
    players: { min: 5, max: 8 },
    before: [
      "Pick the deal size: 3-card or 5-card version",
      "Set the buy price for exchanging cards",
      "Decide if any wildcards beyond 5s are in play",
    ],
    betting: `Ante only — 50¢ house default. No raises, no max bet.`,
    setup: `Dealer deals 3 or 5 cards face down to each player, per the chosen variant.`,
    gameplay: `5s are always wild. Players may buy/exchange cards for the dealer-set price. After buying, everyone secretly decides whether to play (stay in) or fold — this is a guts game, so it's ante only, no raises.`,
    win: `Best hand among the players who stayed in wins the pot. Anyone who stayed in but didn't have the best hand must match the pot to play again. Repeats until one player bets and wins outright.`,
    keyDecisions: [
      "Buy new cards or keep your hand as dealt?",
      "Stay in (bet the guts) or fold?",
    ],
    repeats: [
      "5s are always wild, regardless of what other wildcards are chosen",
      "Losers must match the pot to play the next hand",
    ],
    script: `5s are wild. You'll get cards face down — you can buy new ones for the going price. Then everyone secretly decides in or out. Best hand among the "in"s wins; everyone else who was in matches the pot and we go again until someone wins it outright.`,
  },
  {
    id: "3-33",
    name: "3-33 (333)",
    category: "Other",
    isNew: false,
    icon: "🅰️🅰️🅰️",
    players: { min: 5, max: 8 },
    before: [],
    betting: `Ante 50¢, 25¢ raise increment, $2 max bet per person (house default).`,
    setup: `Deal 3 cards face down to each player.`,
    gameplay: `Dealer flips 1 community card per round, 5 rounds total. Anyone holding a card matching that rank must discard it. Aces count as 1 or 11, face cards count as 10. If a flipped card's rank already came up in an earlier round, it's set aside and a new card is drawn in its place.`,
    win: `Best high hand AND best low hand split the pot — or a player who discards their entire hand wins it outright. Being dealt AAA ("Ultima") wins the whole pot immediately, no flips needed.`,
    keyDecisions: [
      "None really — this one's about the flips and your cards, not player choices",
    ],
    repeats: [
      "Three aces off the deal is an instant win",
      "Discarding on a match is mandatory, not optional",
      "A repeat rank gets swapped for a fresh card instead of flipped again",
      "Emptying your hand first wins outright — ties on that split evenly, it's not a race",
    ],
    script: `You get 3 cards. I'll flip one community card at a time, 5 flips total — if you're holding that rank, discard it. If the same rank comes up twice, I'll swap it for a new card instead of flipping it again. Aces count 1 or 11, face cards count 10. Best high hand and best low hand split the pot, or whoever empties their hand first wins it all. Three aces off the deal wins on the spot.`,
  },
  {
    id: "3-5-7-guts",
    name: "3-5-7 Guts",
    category: "Guts",
    isNew: true,
    icon: "🔥",
    players: { min: 5, max: 8, note: "At a full table, round 3's 7-card hands can exceed a single deck — trim round 3 down (and shift its wild rank to match) rather than dealing a fixed 7." },
    before: [],
    betting: `Ante only — 50¢ house default. No raises, no max bet.`,
    setup: `Deal 3 hole cards to start.`,
    gameplay: `Three escalating rounds. Round 1: 3s wild, decide in/out, reveal, low hand matches the pot, high hand gets paid. Round 2: deal 2 more (5 total), 5s wild, repeat. Round 3: deal 2 more again (7 total), 7s wild, repeat. The pot carries forward across all three rounds — it doesn't reset.`,
    win: `Pot goes to the last remaining player after round 3.`,
    keyDecisions: [
      "Fold or stay in, each round, as both the ante requirement and the wild rank escalate",
    ],
    repeats: [
      "Wild rank changes every round: 3s → 5s → 7s",
      "The pot carries forward the whole way — it's not reset between rounds",
    ],
    script: `Three rounds, escalating. Round 1 you get 3 cards, 3s wild. Round 2 two more (5 total), 5s wild. Round 3 two more again (7 total), 7s wild. Before each round: in or out. If you're in and have the low hand, you match the pot; the high hand gets paid. Pot carries the whole way. Last one standing after round 3 takes it.`,
  },
  {
    id: "5-5-21",
    name: "5.5-21",
    category: "Other",
    isNew: false,
    icon: "🎯",
    players: { min: 5, max: 8 },
    before: [],
    betting: `Ante 50¢, 25¢ raise increment, $2 max bet per person (house default).`,
    setup: `Deal 1 card face down to each player.`,
    gameplay: `Each round, take another card or pass. Face cards are worth 0.5, Aces are worth 1. You CANNOT go over either target — going over busts you out of that half. Once a full round passes with nobody taking a card, one more complete no-taker round is required before dealing ends.`,
    win: `Best hand closest to 5.5 wins half the pot; best hand closest to 21 wins the other half. Tie-breaker: the tied player holding the fewest cards wins that side.`,
    keyDecisions: [
      "Take another card or pass, each round — and which target (5.5 or 21) you're chasing",
    ],
    repeats: [
      "Going over busts you here — opposite of 7-27",
      "Ties go to whoever's holding fewer cards, not a split",
    ],
    script: `You start with 1 card face down. Each round, take another or pass — face cards are half a point, aces count 1. Go for the low target (5.5) or the high one (21), but go over either and you're busted out of that half. Once everybody passes for a full round, one more no-taker round and we're done — closest to 5.5 and closest to 21 split the pot.`,
  },
  {
    id: "7-27",
    name: "7-27",
    category: "Other",
    isNew: false,
    icon: "🎲",
    players: { min: 5, max: 8 },
    before: [
      "Confirm the buy-back price scale for the night ($1/$2/$3 default)",
      "Decide if \"Kitchen Sink\" is on: a hand that's exactly 7 AND exactly 27 at once wins the whole pot outright instead of splitting",
    ],
    betting: `Ante 25¢ — half the usual 50¢ house default. 25¢ raise increment, $2 max bet per person otherwise standard.`,
    setup: `Deal 1 card down, then 1 card up to each player.`,
    gameplay: `Optional extra card each round. Face cards are worth 0.5, Aces are worth 1 or 11 free of charge. A 10 counts as 10 by default — pay $1 and it becomes flexible, worth 0 or 10, your choice. Players may buy back ("down the river") their up-card to hide it again — escalating cost, up to 3 total: $1, then $2, then $3 later — "use it or lose it," must decide the moment it's offered. Going over is allowed and doesn't bust you.`,
    win: `Closest to 7 wins the low half of the pot, closest to 27 wins the high half — regardless of how many cards a player holds. Ties split evenly. If Kitchen Sink is on: a hand reading exactly 7 for low and exactly 27 for high at the same time can't be beaten or tied out of either half — it wins the entire pot outright instead of splitting it (same idea as 3-33's "Ultima"). More than one Kitchen Sink at the table splits the pot between them.`,
    keyDecisions: [
      "Buy back your up-card or keep it — decide immediately, no thinking it over",
      "Pay $1 to make a 10 flexible (0 or 10) or leave it fixed at 10",
      "Take extra cards or stop",
    ],
    repeats: [
      "Going over does NOT bust you here — opposite of 5.5-21",
      "Buy-backs are use-it-or-lose-it: decide the instant it's offered",
      "A 10 is worth 10 unless you pay $1 to make it 0-or-10 flexible — aces flip free, tens don't",
      "If Kitchen Sink is on, announce it — an exact 7-and-27 hand takes the whole pot, no split",
    ],
    script: `One card down, one up. You can buy your up-card back to hide it again — a dollar the first time, two the second, three later for a third, and you have to decide right when it's offered. Face cards are half a point, aces are 1 or 11 for free — but a ten's stuck at 10 unless you pay a dollar to make it 0-or-10 flexible. Going over doesn't bust you here. Closest to 7 and closest to 27 split the pot — unless we're playing Kitchen Sink, where a hand that's exactly 7 and exactly 27 at the same time wins the whole thing outright.`,
  },
  {
    id: "acey-ducey",
    name: "Acey Ducey",
    category: "Other",
    isNew: false,
    icon: "↔️",
    players: { min: 5, max: 8 },
    before: [],
    betting: `Ante 50¢, 25¢ raise increment, $2 max bet per person (house default).`,
    setup: `Flip two cards face up for the active player.`,
    gameplay: `The active player may bet up to the full pot that the next card dealt will land between the two shown cards — or pass entirely. Aces are low, Kings are high (a house-specific choice).`,
    win: `If the next card falls between the two shown cards, the player wins their bet from the pot. If not, their bet goes into the pot — and if that card matches the rank of either shown card ("hitting the post"), they lose double their bet instead. The game only ends once the full deck is consumed and someone wins the entire pot.`,
    keyDecisions: [
      "Bet (and how much, up to the full pot) or pass — based on how wide the spread is",
    ],
    repeats: [
      "Aces are LOW here, Kings are high — not the more common Aces-high default",
      "\"Hitting the post\" — the next card matching either shown card's rank — costs double the bet, not just the bet",
      "The game runs until the deck is gone, not a fixed number of hands",
    ],
    script: `Two cards get flipped for you. You can bet up to the whole pot that the next card lands between them, or pass. Aces are low, Kings are high. Win and you take your bet from the pot; lose and it goes in — but if the card matches either of the two shown, that's "hitting the post" and you lose double your bet instead. We go around until the deck runs out and somebody's taken the whole pot.`,
  },
  {
    id: "anaconda",
    name: "Anaconda (Pass the Trash)",
    category: "Stud-based",
    isNew: true,
    icon: "🐍",
    players: { min: 5, max: 8, note: "The full 7-card deal happens all at once before any discarding, so it can't trim like other stud games — at 8 players that's 56 cards, over a deck. Comfortably plays 5–7; a full table needs a second deck or someone sitting out." },
    before: [
      "Decide whether to play hi-lo (declare high, low, or both before showdown)",
      "Decide whether 1-2 Jokers are in the deck as extra wildcards — dealer's choice; this game has no wildcard rule otherwise",
    ],
    betting: `Ante 50¢, 25¢ raise increment, $2 max bet per person (house default).`,
    setup: `Deal 7 cards face down to each player — the full 7 up front, before any discarding.`,
    gameplay: `Round 1: discard 3 unwanted cards face down, pass the set to the next active player on your left; bet. Round 2: discard 2 more from what you're now holding, then arrange your remaining 5 in whatever order you want, face down; bet. Then turn over the top card of your stack one at a time — a betting round after each — until all 5 are face up.`,
    win: `Best 5-card hand wins at showdown. If hi-lo is on, best qualifying low splits the pot with the best high hand instead.`,
    keyDecisions: [
      "Which 3 cards to discard and pass first, then which 2 more to discard",
      "What order to stack your final 5 cards in — you're choosing your own reveal sequence",
      "If hi-lo is on: declare high, low, or both before showdown",
    ],
    repeats: [
      "You're building your hand from cards passed TO you, not just cards you keep — check what you're handed each round",
      "Your reveal order is locked in once you stack your 5 cards face down — no changing it later",
    ],
    script: `Seven cards to start. First round, ditch 3 you don't want and pass them to your left — everyone does this at once. Bet. Second round, ditch 2 more from what you're holding, then stack your last 5 in whatever order you want, face down. Bet. Now flip your stack one card at a time, betting after each, until all 5 are up. Best hand wins.`,
  },
  {
    id: "blind-mans-bluff",
    name: "Blind Man's Bluff",
    category: "Other",
    isNew: false,
    icon: "🙈",
    players: { min: 5, max: 8 },
    before: [],
    betting: `Ante 50¢, 25¢ raise increment, $2 max bet per person (house default).`,
    setup: `Deal 1 card face down to each player.`,
    gameplay: `Without looking, place your card on your forehead — you can see everyone else's card, never your own. Betting continues in rounds until no more raises are made.`,
    win: `Highest exposed card wins the pot outright at showdown.`,
    keyDecisions: [
      "Bet, raise, or fold — based only on what you can read from everyone else's cards and reactions",
    ],
    repeats: [
      "Don't look at your own card, ever",
      "Highest card showing wins outright — no hand-building involved",
    ],
    script: `One card each, and don't look at it — stick it on your forehead so everyone else can see it but you can't. Bet on what you think you're holding, based on everyone else's cards and reactions. Highest card showing wins the whole pot.`,
  },
  {
    id: "cincinnati",
    name: "Cincinnati",
    category: "Community Stud",
    isNew: true,
    icon: "🌉",
    players: { min: 5, max: 8 },
    before: [
      "Decide whether the last-revealed community card (and its rank) is wild — dealer's choice, not in the base game",
      "Decide whether 1-2 Jokers are in the deck as extra wildcards — dealer's choice, since this builds a 5-card hand from a larger pool",
    ],
    betting: `Ante 50¢, 25¢ raise increment, $2 max bet per person (house default).`,
    setup: `Deal 5 hole cards face down to each player, plus 5 community cards face down to the table.`,
    gameplay: `Dealer turns the 5 community cards face up one at a time, with a betting round after each.`,
    win: `Best 5-card hand using any combination of your hole cards and the community cards wins. High hand only — no hi-lo in the base game.`,
    keyDecisions: [
      "Standard betting after each community-card reveal",
    ],
    repeats: [
      "Community cards are shared by everyone — mix and match freely with your own hole cards",
      "No wildcards unless the dealer's called the last-card-wild variant",
    ],
    script: `Five cards down to you, five more face down on the table. I'll flip the table cards one at a time — bet after each. Build your best hand from any mix of your cards and the table cards. Best hand wins.`,
  },
  {
    id: "criss-cross",
    name: "Criss Cross (Iron Cross)",
    category: "Community Stud",
    isNew: true,
    icon: "➕",
    players: { min: 5, max: 8 },
    before: [
      "Decide whether the center card (and its rank) is wild — dealer's choice",
      "Decide whether hi-lo is on",
      "Decide whether 1-2 Jokers are in the deck as extra wildcards — dealer's choice, since this builds a 5-card hand from a larger pool",
    ],
    betting: `Ante 50¢, 25¢ raise increment, $2 max bet per person (house default).`,
    setup: `Deal 5 hole cards face down to each player, plus 5 community cards face down to the table in a cross shape — a shared center card, a horizontal arm of 3, and a vertical arm of 3.`,
    gameplay: `Betting round, then the community cards turn face up one at a time in order, with a betting round after each.`,
    win: `At showdown, build your best hand from 2 or more of your hole cards plus cards from ONE arm of the cross only — horizontal or vertical, not both. Best hand wins, or splits hi-lo if that's in play (a player declaring both must use the same arm for their high and low hands).`,
    keyDecisions: [
      "Which arm — horizontal or vertical — to build your hand from at showdown",
      "If hi-lo is on: declare high, low, or both",
    ],
    repeats: [
      "You must pick ONE arm of the cross, not mix cards from both",
      "Declaring \"both\" in hi-lo still means the same single arm for both your high and low hands",
    ],
    script: `Five cards down to you. On the table, five more cards face down in a cross — a center card shared by a line of three across and a line of three up-and-down. I'll flip them one at a time, betting after each. At showdown, build your hand from your cards plus ONE arm of that cross — pick horizontal or vertical, not a mix. Best hand wins.`,
  },
  {
    id: "daytime-baseball",
    name: "Daytime Baseball",
    category: "Baseball",
    isNew: false,
    icon: "☀️",
    players: { min: 5, max: 8 },
    before: [],
    resolvePlayers(n) {
      const upRounds = Math.min(5, Math.floor(52 / n) - 2);
      const total = 2 + upRounds;
      return `With ${n} players: ${upRounds} up-card rounds, ${total} cards each.${
        upRounds < 5 ? " (Trimmed down from the usual 5 up-rounds so the deal fits one deck.)" : ""
      }`;
    },
    betting: `Ante 50¢, 25¢ raise increment, $2 max bet per person (house default).`,
    setup: `Deal 2 cards face down to each player to start, then 1 more card face up each round, going around the table — number of rounds adjusts to tonight's player count (see above).`,
    gameplay: `3s and 9s are wild — but only if bought: $3 for a 3 (buying it is mandatory to stay in), $2 for a 9. Dealing a 4 lets that player buy an extra card for $1.`,
    win: `Best baseball hand (standard poker rankings, with bought wildcards) wins at showdown.`,
    keyDecisions: [
      "Buy the 3 (mandatory to keep playing) or fold",
      "Buy the 9 to make it wild, or leave it dead",
      "Buy the bonus card off a 4, or pass on it",
    ],
    repeats: [
      "3s and 9s are ONLY wild if bought — otherwise they're just dead cards",
      "Buying the 3 is mandatory to stay in the hand",
    ],
    script: `Two cards down to start, then one more up each round. 3s and 9s are wild, but you have to buy them to count — $3 for a three (mandatory if you want to stay in), $2 for a nine. Get dealt a 4 and you can buy a bonus card for a buck. Best hand at the end wins.`,
  },
  {
    id: "deep-or-double-screw",
    name: "Deep or Double Screw",
    category: "Guts",
    isNew: false,
    icon: "🔩",
    players: { min: 5, max: 8 },
    before: [
      "Choose the wildcard scheme: flip-up 1–3 wild, lowest card wild, 3s/5s/7s wild, or red royals wild",
      "Decide whether a dummy hand is in play",
    ],
    resolvePlayers(n) {
      const use6 = 7 * n > 52;
      const cards = use6 ? 6 : 7;
      const dummyFits = cards * (n + 1) <= 52;
      return `With ${n} players: use the ${cards}-card version, passing ${use6 ? "1 left / 1 right" : "2 left / 1 right"}.${
        dummyFits ? "" : " A dummy hand won't fit at this size and player count — drop it or knock the deal down further."
      }`;
    },
    betting: `Ante only — 50¢ house default. No raises, no max bet.`,
    setup: `Deal 6 or 7 cards face down — whichever version fits tonight's player count (see above). Pass 1 left / 1 right (6-card version) or 2 left / 1 right (7-card version).`,
    gameplay: `Guts round after passing — ante only, no raises, no max bet. The chosen wildcard scheme applies for the hand.`,
    win: `Best hand among players who stayed in wins the pot. Anyone who stayed in and lost — including losing to a dummy hand — must match the pot to play again. Ends only when one player bets and wins outright.`,
    keyDecisions: [
      "Which cards to pass",
      "Stay in (bet the guts) or fold, after seeing your passed hand",
    ],
    repeats: [
      "Announce which wildcard scheme is active this hand — it changes by dealer's choice",
      "Losing to the dummy hand still counts as losing",
    ],
    script: `You get cards down, then pass some left and right. Wildcards this hand: [dealer announces scheme]. After passing, everyone secretly decides in or out — best hand among the ins wins, everyone else who was in matches the pot for next hand. We keep going until someone bets and wins it outright.`,
    anecdote: `Beware adding a dummy hand! Our friend George has lost some great hands to a sneaky Dummy.`,
  },
  {
    id: "follow-the-queen",
    name: "Follow the Queen",
    category: "Stud-based",
    isNew: false,
    icon: "👑",
    players: { min: 5, max: 8 },
    before: [
      "Decide whether Low Chicago is on as a companion side-pot",
    ],
    betting: `Ante 50¢, 25¢ raise increment, $2 max bet per person (house default).`,
    setup: `Deal 6 cards in sequence — 2 up, 3 down, 1 up.`,
    gameplay: `Queens are wild. The card immediately after an exposed Queen is also wild — but only the one following the MOST RECENTLY shown Queen. When a later Queen is exposed, the earlier "follow" wildcard is cancelled; only the new one counts going forward. Highest showing hand starts the betting each round.`,
    win: `Best hand at showdown wins the main pot. If Low Chicago is on, the best concealed (hole-card) low spade wins that side pot separately — ties on it split evenly.`,
    keyDecisions: [
      "How aggressively to bet as the wild-card set can shift hand to hand (a new Queen exposure changes what's wild)",
    ],
    repeats: [
      "Queens are always wild",
      "Only the card after the LATEST Queen is wild — a new Queen exposure kills the previous follow-card's wild status",
      "Low Chicago only counts concealed (hole-card) spades, not exposed ones",
    ],
    script: `Six cards — 2 up, 3 down, 1 up. Queens are wild, and whatever card shows right after a Queen is wild too — but only after the most recent Queen. If another Queen shows up later, the old follow-wildcard stops being wild and only the new one counts. Highest hand showing bets first each round. If we're playing Low Chicago, best spade in the hole is a separate side pot.`,
  },
  {
    id: "four-two-two",
    name: "Four-Two-Two",
    category: "Guts",
    extraCategories: ["Poker Scored"],
    isNew: true,
    icon: "🍀",
    players: { min: 5, max: 8 },
    before: [
      "Decide whether to agree a max loss per deal (e.g. $5) — dealer's choice",
    ],
    betting: `Ante only — 50¢ house default. No raises, no max bet.`,
    setup: `Deal 4 cards face down to each player.`,
    gameplay: `2s are wild. Everyone declares simultaneously whether they're in (traditionally by holding a coin in a closed fist, opened together on a signal). Players who are in get 2 more cards, dealt face up — still your own private hand, just visible to the table — for 6 cards total.`,
    win: `Best 5-card hand from your 6 wins among the players who stayed in. Anyone who stayed in and lost must match the pot to play again. Ends only when one player stays in alone and wins outright.`,
    keyDecisions: [
      "Stay in (bet the guts) or fold, based on just 4 cards",
      "If a max-loss cap is agreed, factor that into how loose you play",
    ],
    repeats: [
      "The bonus 2 cards are dealt face up — dealt to you, but everyone can see them",
      "2s are always wild",
    ],
    script: `Four cards down. 2s are wild. Everyone secretly decides in or out — same as our other guts games, coin in a fist works fine. If you're in, you get 2 more cards, but face up this time — everyone sees them, though they're still yours. Best hand among the ins wins; everyone else who was in matches the pot and we go again until someone wins it outright.`,
  },
  {
    id: "free-enterprise",
    name: "Free Enterprise",
    category: "Stud-based",
    isNew: false,
    icon: "💸",
    players: { min: 5, max: 8 },
    before: [
      "Choose the wipe price scale for the night: $1/$2/$3, or the cheaper $0.50-start scale",
      "Decide whether 1-2 Jokers are in the deck as extra wildcards — dealer's choice; this game has no wildcard rule otherwise",
    ],
    resolvePlayers(n) {
      const upRounds = Math.min(4, Math.floor(52 / n) - 3);
      const total = 3 + upRounds;
      return `With ${n} players: deal ${total} cards each — 2 down, ${upRounds} up (one per round), 1 down.${
        upRounds < 4 ? " (Trimmed down from the usual 4 up-rounds so the deal fits one deck.)" : ""
      }`;
    },
    betting: `Ante 50¢, 25¢ raise increment, $2 max bet per person (house default).`,
    setup: `Deal in sequence — 2 down, then up-card rounds (count adjusts to tonight's player count, see above), then 1 down. 7 cards total (4 up-rounds) at typical table sizes, matching the stud family's typical shape.`,
    gameplay: `Anytime, a player can pay to "wipe" (discard and replace) a card — the price escalates as the hand goes on. The final round's wipe price is doubled. Betting is based on the highest showing card(s).`,
    win: `Best hand at showdown wins.`,
    keyDecisions: [
      "Wipe a card at the current escalating price, or keep it — every round",
    ],
    repeats: [
      "Announce the current wipe price each round since it escalates",
      "The last round's wipe price is doubled",
    ],
    script: `Two down, then one up at a time — how many rounds depends on how many of us are playing — then one more down. Anytime, you can pay to wipe a card for a new one — price goes up as the hand goes on. Last round, whatever the wipe price is, it's doubled. Best hand showing bets first; best hand at the end wins.`,
  },
  {
    id: "game-of-life",
    name: "Game of Life",
    category: "Poker Scored",
    isNew: false,
    icon: "⚖️",
    players: { min: 5, max: 8 },
    before: [
      "Decide whether 1-2 Jokers are in the deck as extra wildcards — dealer's choice; this game has no wildcard rule otherwise",
    ],
    betting: `Ante 50¢, 25¢ raise increment, $2 max bet per person (house default).`,
    setup: `Deal 5 cards to each player. Lay out two rows of 5 cards face down on the table — a "good" row and a "bad" row.`,
    gameplay: `Turn order rotates each round. On your turn, flip a card from either row — good row cards get added to your hand, bad row cards are discarded. Flipping a bad-row card poisons its rank for the rest of the hand: any card of that rank already in a player's hand is discarded (placed on top of the bad card), any card of that rank still face-down in the good row moves over to the bad side instead, and any future flip matching that rank is immediately treated as bad too.`,
    win: `Best final hand at showdown wins.`,
    keyDecisions: [
      "Which row to flip from — good (grow your hand) or bad (gamble on a discard)",
    ],
    repeats: [
      "Good row cards join your hand for good; bad row cards are gone for good, no changing your mind",
      "A bad flip poisons its rank for the whole hand — matching cards get pulled from hands, the good row, and any future flip, not just the one card that got flipped",
    ],
    script: `You get 5 cards to start. There's a good row and a bad row on the table, 5 cards each, face down. On your turn, flip a card from either row — good row joins your hand, bad row gets tossed. But watch out: when a bad card comes up, its rank is poisoned for the rest of the hand — if you're holding a card of that rank, it's gone, if one's sitting in the good row it moves to the bad side, and any of that rank flipped later is bad too. Turn order rotates each round. Best hand at the end wins.`,
  },
  {
    id: "mexican-sweat",
    name: "Mexican Sweat",
    category: "Stud-based",
    isNew: false,
    icon: "😅",
    players: { min: 5, max: 8 },
    before: [
      "Decide wildcards: dealer's choice, or reveal 1 flip-up wildcard",
    ],
    resolvePlayers(n) {
      const cards = Math.min(7, Math.floor(52 / n));
      return `With ${n} players: deal ${cards} cards each${cards < 7 ? " (trimmed down from the usual 7 so the deal fits one deck)" : ""}.`;
    },
    betting: `Ante 50¢, 25¢ raise increment, $2 max bet per person (house default).`,
    setup: `Deal cards face down to each player — count adjusts to tonight's player count (see above), 7 each at typical table sizes. No looking at your own hand!`,
    gameplay: `Each round, everyone simultaneously flips 1 card from their hand face up, then a betting round follows. This simultaneous reveal is a deliberate house choice — it keeps this game distinct from Midnight Baseball's sequential "beat the card" structure.`,
    win: `Best hand at showdown (once the whole hand is eventually revealed) wins.`,
    keyDecisions: [
      "Betting decisions only — the flip order isn't a player choice since you can't see your own hand",
    ],
    repeats: [
      "No peeking at your own hand, ever",
      "The reveal is simultaneous, one card per round, for everyone at once",
    ],
    script: `Seven cards face down — and no peeking, not even at your own hand. Each round, everybody flips one more card face up at the same time, then we bet. By the last round your whole hand is showing. Best hand wins.`,
  },
  {
    id: "midnight-baseball",
    name: "Midnight Baseball",
    category: "Baseball",
    isNew: false,
    icon: "🌙",
    players: { min: 5, max: 8 },
    before: [],
    betting: `Ante 50¢, 25¢ raise increment, $2 max bet per person (house default).`,
    setup: `Deal all cards face down to each player — no up cards during the deal itself. Flip an initial reference card that the first player must try to beat.`,
    gameplay: `3s and 9s are wild if bought ($3 mandatory for a 3, $2 for a 9). Dealing a 4 lets you buy an extra card for $1. On your turn, turn your own cards face up one at a time, building your best baseball hand, until you beat the current highest showing hand or run out of cards. Once you stop, everyone bets — even if you ran out without beating the board and are thereby eliminated.`,
    win: `Whoever holds the top hand after everyone's gone through their cards.`,
    keyDecisions: [
      "How far to keep turning cards before you've beaten the board (you must at least try)",
      "Buy the 3 (mandatory) or the 9 to make them wild, or fold",
      "Buy the bonus card off a 4, or pass on it",
    ],
    repeats: [
      "A betting round happens every time someone stops — whether they beat the board or just ran out",
      "3s and 9s are only wild if bought",
      "Turning up a 4 lets that player buy a bonus card for $1",
    ],
    script: `Everything's dealt face down. I'll flip a reference card to start — on your turn, flip your own cards one at a time until you either beat the best hand showing or run out. Either way, once you stop, we bet — even if you ran out and you're eliminated. 3s and 9s are wild if you buy them: $3 mandatory for a three, $2 for a nine. Turn up a 4 and you can buy a bonus card for a buck. Last one standing with the best hand wins.`,
  },
  {
    id: "omaha-seattle-boise-jersey-holdem",
    name: "Omaha / Seattle / Boise / Jersey Hold'em",
    category: "Texas Hold'em variant",
    isNew: false,
    icon: "🏙️",
    players: { min: 5, max: 8 },
    before: [
      "Pick tonight's variant: Omaha, Seattle, Boise, or Jersey Hold'em (New)",
      "Decide if the hi-lo split (best qualifying low, 8-or-under) is on",
    ],
    betting: `Blinds: $0.50 small / $1 big. No ante, no max bet — standard hold'em raise rules apply (minimum raise = size of the previous bet/raise).`,
    setup: `Deal hole cards face down to each player — 4 for Omaha/Seattle/Boise, 5 for Jersey Hold'em. Standard shared community board.`,
    gameplay: `Standard Texas Hold'em betting rounds — pre-flop, flop, turn, river — with a $0.50 small blind / $1 big blind and no cap on bet size. Hand construction depends on the chosen variant: Omaha uses 2 from hand + 3 from the board; Seattle uses 3 from hand + 2 from the board; Boise and Jersey Hold'em let the player choose 2-and-3 or 3-and-2 at showdown.`,
    win: `Best 5-card hand, built per the variant's construction rule, wins. If hi-lo is on: low hand is five unpaired cards, each 8 or under — straights and flushes don't count against it, only rank matters. Aces count low, so A-2-3-4-5 is the best possible low (and can double as a straight for high). Built with the same hand/board split as high, but not necessarily the same five cards. No qualifying low among anyone, and the high hand takes the whole pot — a hand can also scoop both halves if it's best on both sides.`,
    keyDecisions: [
      "Standard hold'em betting each street",
      "For Boise/Jersey Hold'em: which 2-or-3 split to use — decided at showdown, not before",
    ],
    repeats: [
      "Announce exactly which variant (and hand-construction rule) is in play — this is the one thing that changes hand to hand",
      "Boise and Jersey Hold'em choose their split AT showdown, not earlier",
      "Low hand doesn't have to reuse your high hand's five cards — just the same 2-and-3 split rule",
      "Straights and flushes don't hurt a low hand — only rank matters (this is why A-2-3-4-5 works as both)",
    ],
    script: [
      { label: "Omaha", text: `You get 4 hole cards face down. Standard blinds, standard betting each street — flop, turn, river. Your hand always uses exactly 2 from your hand plus 3 from the board. Best hand wins.` },
      { label: "Seattle", text: `You get 4 hole cards face down. Standard blinds and betting each street. Your hand always uses exactly 3 from your hand plus 2 from the board. Best hand wins.` },
      { label: "Boise", text: `You get 4 hole cards face down. Standard blinds and betting each street. At showdown, you pick your own split — 2 from your hand and 3 from the board, or 3 from your hand and 2 from the board, whichever makes your best hand. Best hand wins.` },
      { label: "Jersey Hold'em", text: `You get 5 hole cards face down instead of 4. Standard blinds and betting each street. Just like Boise, you pick your split at showdown — 2-and-3 or 3-and-2, whichever's best. Best hand wins.` },
      { label: "If hi-lo is on, add", text: `For low: five cards, each 8 or lower, no pairs — straights and flushes don't count against you, only rank matters. Aces are low, so A-2-3-4-5 is the best possible low. Same hand/board split as high, but it doesn't have to be the same five cards. No qualifying low among anyone, and the high hand just takes the whole pot.` },
    ],
  },
  {
    id: "pair-of-jacks-trips-to-win",
    name: "Pair of Jacks, Trips to Win",
    category: "Poker Scored",
    isNew: false,
    icon: "🎰",
    players: { min: 5, max: 8 },
    before: [
      "Decide whether 1-2 Jokers are in the deck as extra wildcards — dealer's choice, since this is our one 5-card draw game",
    ],
    betting: `Ante 50¢, 25¢ raise increment, $2 max bet per person (house default).`,
    setup: `Deal 5 cards face down to each player.`,
    gameplay: `Only a hand of Jacks-or-better may open the betting — if nobody can open, redeal. After opening, players may draw: exchange up to 3 cards, or 4 if holding an Ace.`,
    win: `Requires trips (three of a kind) or better to win at showdown — opening with Jacks-or-better alone isn't enough to actually take the pot.`,
    keyDecisions: [
      "Can you open? (Need Jacks or better)",
      "How many cards to exchange in the draw",
    ],
    repeats: [
      "Jacks-or-better just to open, but TRIPS or better to actually win at showdown — this is our deliberate house tightening from the classic game",
    ],
    script: `Five cards down. You need Jacks or better to open the betting — if nobody can, we redeal. After opening, swap up to 3 cards, 4 if you're holding an Ace. But here's our twist: opening doesn't mean you win — you need trips or better to actually take the pot at showdown.`,
  },
  {
    id: "rainy-day-baseball",
    name: "Rainy Day Baseball",
    category: "Baseball",
    isNew: false,
    icon: "🌧️",
    players: { min: 5, max: 8 },
    before: [
      "Decide whether the optional \"once you're out, you're out\" rule is in play",
    ],
    betting: `Ante 50¢, 25¢ raise increment, $2 max bet per person (house default).`,
    setup: `Deal 2 cards down, 1 up to each player, then a betting round, then 1 more card dealt.`,
    gameplay: `3s and 9s are wild if bought ($3 mandatory for a 3, $2 for a 9). Dealing a 4 lets you buy an extra card for $1. A red queen rains out (kills) the hand — the pot carries forward to the next hand. The first rain-out triggers on any red queen; a second rain-out in the same hand needs both red queens together.`,
    win: `Best hand at showdown among players who survived any rain-outs. If the hand gets rained out, the pot carries to the next hand.`,
    keyDecisions: [
      "Buy the 3 (mandatory) or the 9, or fold",
      "Buy the bonus card off a 4",
    ],
    repeats: [
      "First rain-out: any red queen. Second rain-out in the same hand: needs BOTH red queens together",
      "If \"once you're out, you're out\" is on, a rained-out player doesn't return for the rest of that hand",
    ],
    script: `Two down, one up, bet, one more dealt. 3s and 9s are wild if you buy them — $3 mandatory for the three, $2 for the nine. Get a 4, buy a bonus card for a buck. Watch for red queens — the first one rains out the hand and the pot carries forward. After that, it takes both red queens together to rain it out again.`,
  },
  {
    id: "seven-and-what-makes-it",
    name: "Seven and What Makes It",
    category: "Stud-based",
    isNew: true,
    icon: "7️⃣",
    players: { min: 5, max: 8 },
    before: [],
    resolvePlayers(n) {
      const upRounds = Math.min(4, Math.floor(52 / n) - 3);
      const total = 3 + upRounds;
      return `With ${n} players: deal ${total} cards each — 2 down, ${upRounds} up (one per round), 1 down.${
        upRounds < 4 ? " (Trimmed down from the usual 4 up-rounds so the deal fits one deck.)" : ""
      }`;
    },
    betting: `Ante 50¢, 25¢ raise increment, $2 max bet per person (house default).`,
    setup: `Deal 7 cards in sequence — 2 down, 4 up (one per round), 1 down — standard 7-card stud shape, adjusted for tonight's player count (see above).`,
    gameplay: `Any set of your own cards that adds up to exactly 7 is wild — a lone 7 counts too. Aces count as 1. You can't reuse a card in more than one combination at the same time. Highest showing hand bets first each round.`,
    win: `Best 5-card hand at showdown, using your self-determined wildcards. Best possible hand is five Aces.`,
    keyDecisions: [
      "Track which of your own cards combine to make 7 — it can change as you're dealt more cards",
      "Standard stud betting each round",
    ],
    repeats: [
      "Wildness is self-determined from YOUR OWN hand — not a fixed rank like other games",
      "A card can only be part of one 7-combo at a time, not double-counted",
    ],
    script: `Seven-card stud — two down, four up one at a time, one down. Here's the twist: any of your own cards that add up to seven are wild — even a lone seven counts. Aces count as one, and you can't reuse a card in two different combos at once. Highest hand showing bets first each round. Best hand wins — five aces is as good as it gets.`,
  },
  {
    id: "good-bad-ugly",
    name: "The Good, the Bad and the Ugly",
    category: "Stud-based",
    isNew: true,
    icon: "🤠",
    players: { min: 5, max: 8 },
    before: [],
    resolvePlayers(n) {
      const withFinalDown = 7 * n + 3 <= 52;
      return withFinalDown
        ? `With ${n} players: full 7-card deal (2 down, 4 up, 1 down) plus the 3 table cards fits fine.`
        : `With ${n} players: skip the final down card — 2 down, 4 up (6 cards) plus the 3 table cards, so it still fits one deck. The Good/Bad/Ugly triggers land on the up-cards, so they're unaffected.`;
    },
    betting: `Ante 50¢, 25¢ raise increment, $2 max bet per person (house default).`,
    setup: `Deal 2 down and 1 up to each player to start (standard stud), plus 3 separate cards face down to the table — these are NOT shared community cards, just reveal triggers (see above for how the deal adjusts to tonight's player count).`,
    gameplay: `After everyone's 4th card, flip the first table card — "The Good": every card of that rank in anyone's hand becomes wild. After the 5th card, flip the second — "The Bad": every card of that rank must be discarded. After the 6th card, flip the third — "The Ugly": anyone with an UP card of that rank must fold immediately.`,
    win: `Best 7-card-stud hand at showdown among whoever survived The Ugly.`,
    keyDecisions: [
      "Whether to keep betting into a hand that could get wrecked by The Bad or The Ugly before showdown",
      "Track your own cards' ranks against each table-card reveal as it lands",
    ],
    repeats: [
      "The three table cards are NOT shared/community cards — you can't use them in your hand, they only trigger effects",
      "Reveal order is always Good (wild) → Bad (discard) → Ugly (instant fold)",
    ],
    script: `Standard stud start — two down, one up. There's also three cards face down on the table, but those aren't yours to use — they just trigger things. After your 4th card, I flip the first one: that's the Good — matching cards in your hand go wild. After your 5th card, the second one: the Bad — matching cards get discarded. After your 6th, the third: the Ugly — if your up card matches, you're out, right then. Whoever's left standing plays out the hand and best hand wins.`,
  },
];

// Standard 5-card poker hand rankings, best to worst.
// Shown for any game whose showdown is a plain poker-hand comparison
// (i.e. every category except "Other" — see app.js usesPokerHandRankings()).
// Example hands are illustrative only; wildcards can stand in for any card.
const HAND_RANKINGS = [
  {
    name: "Five of a Kind",
    blurb: "Five cards of the same rank — only possible with a wildcard (or Joker) in play. Beats a Royal Flush.",
    cards: [{ r: "A", s: "♠" }, { r: "A", s: "♥" }, { r: "A", s: "♦" }, { r: "A", s: "♣" }, { r: "A", s: "🃏", wild: true }],
  },
  {
    name: "Royal Flush",
    blurb: "A, K, Q, J, 10, all one suit — the best hand possible without a wild.",
    cards: [{ r: "A", s: "♠" }, { r: "K", s: "♠" }, { r: "Q", s: "♠" }, { r: "J", s: "♠" }, { r: "10", s: "♠" }],
  },
  {
    name: "Straight Flush",
    blurb: "Five cards in a row, all one suit.",
    cards: [{ r: "9", s: "♥" }, { r: "8", s: "♥" }, { r: "7", s: "♥" }, { r: "6", s: "♥" }, { r: "5", s: "♥" }],
  },
  {
    name: "Four of a Kind",
    blurb: "Four cards of the same rank.",
    cards: [{ r: "9", s: "♣" }, { r: "9", s: "♦" }, { r: "9", s: "♥" }, { r: "9", s: "♠" }, { r: "2", s: "♣" }],
  },
  {
    name: "Full House",
    blurb: "Three of a kind, plus a pair.",
    cards: [{ r: "K", s: "♠" }, { r: "K", s: "♥" }, { r: "K", s: "♦" }, { r: "4", s: "♣" }, { r: "4", s: "♠" }],
  },
  {
    name: "Flush",
    blurb: "Five cards of the same suit, not in sequence.",
    cards: [{ r: "A", s: "♦" }, { r: "J", s: "♦" }, { r: "8", s: "♦" }, { r: "6", s: "♦" }, { r: "3", s: "♦" }],
  },
  {
    name: "Straight",
    blurb: "Five cards in a row, mixed suits.",
    cards: [{ r: "10", s: "♣" }, { r: "9", s: "♠" }, { r: "8", s: "♥" }, { r: "7", s: "♦" }, { r: "6", s: "♣" }],
  },
  {
    name: "Three of a Kind",
    blurb: "Three cards of the same rank.",
    cards: [{ r: "7", s: "♠" }, { r: "7", s: "♥" }, { r: "7", s: "♦" }, { r: "K", s: "♣" }, { r: "2", s: "♠" }],
  },
  {
    name: "Two Pair",
    blurb: "Two separate pairs.",
    cards: [{ r: "J", s: "♠" }, { r: "J", s: "♦" }, { r: "4", s: "♥" }, { r: "4", s: "♣" }, { r: "9", s: "♠" }],
  },
  {
    name: "One Pair",
    blurb: "Two cards of the same rank.",
    cards: [{ r: "10", s: "♥" }, { r: "10", s: "♠" }, { r: "K", s: "♦" }, { r: "6", s: "♣" }, { r: "2", s: "♥" }],
  },
  {
    name: "High Card",
    blurb: "No pair — the highest card plays.",
    cards: [{ r: "A", s: "♣" }, { r: "J", s: "♥" }, { r: "8", s: "♠" }, { r: "6", s: "♦" }, { r: "3", s: "♣" }],
  },
];

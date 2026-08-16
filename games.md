# CardNight — Game Reference

A running reference of the dealer's-choice poker variants our group plays, collected as the seed data for a future "pick a game for poker night" app.

Field labels vary a bit by game since house rules differ, but recurring ones include Deal, Wildcards, Play/Betting, Winning, and Tie-breaker — kept consistent where they apply so this doc can eventually be parsed into structured data.

A web research pass (2026-08) cross-referenced each game against published home-poker rule sites (pagat.com, Wikipedia, pokermike.com, and others). Where a match or interesting relative was found, a **Research note:** bullet was added to that entry — these are informational only, not confirmed house rules, and several surfaced genuine open questions (see below). These notes are being reviewed and folded in one game at a time: settled findings move into the entry's actual rule fields (or a **Variants:** bullet for interesting alternatives we haven't adopted), and each entry's own **Sources:** bullet holds the links — there's no separate consolidated source list anymore.

## Game Categories

- **Guts:** Deep or Double Screw, 3 Buy 5 / 5 Buy 5, 3-5-7 Guts (New)
- **Stud-based:** Follow the Queen, Free Enterprise, Mexican Sweat
- **Texas Hold'em variant:** Omaha / Seattle / Boise / Jersey Hold'em (New)
- **Baseball:** Daytime Baseball, Midnight Baseball, Rainy Day Baseball
- **Poker Scored:** Pair of Jacks, Trips to Win; Game of Life; 3 Buy 5 / 5 Buy 5 (also Guts)
- **Other:** 3-33, 5.5-21, 7-27, Acey Ducey, Blind Man's Bluff

One of these calls is still judgment-based (marked with `*` in its Category field below) — worth a quick confirm next session: Mexican Sweat is grouped as stud-based for its staged reveal-and-bet structure even though it's not classic poker-hand stud. 7-27 is Other — it's a press-your-luck target game (accept cards or stop to hit 7 or 27), not a staged up/down stud deal. Pair of Jacks and Game of Life get their own "Poker Scored" bucket since a standard poker-ranked hand decides the win in both (unlike the rest of "Other," which use custom scoring — target numbers, discard-matching, highest single card, etc. — instead of poker hand rankings). 3 Buy 5 / 5 Buy 5 carries both tags — it's structurally a Guts game (ante-only, escalating pot), but within each round the winner is a plain best-poker-hand comparison (just wildcards, no dummy hand or escalating wild ranks like its Guts siblings), so it's "Poker Scored" too.

Entries marked **(New)** in their Category field aren't part of our original house list — they surfaced as siblings/relatives during the 2026-08 research pass and are documented here as candidates worth trying, not games we've actually played.

## Index

(Alphabetical order — numbers-first names sort before letters. Entries link to their section below; if your markdown viewer doesn't support jump-to-heading navigation, search or scroll to find a game by name instead.)

- [3 Buy 5 / 5 Buy 5](#3-buy-5--5-buy-5)
- [3-33 (333)](#3-33-333)
- [3-5-7 Guts](#3-5-7-guts) *(New)*
- [5.5-21](#55-21)
- [7-27](#7-27)
- [Acey Ducey](#acey-ducey)
- [Blind Man's Bluff](#blind-mans-bluff)
- [Daytime Baseball](#daytime-baseball)
- [Deep or Double Screw](#deep-or-double-screw)
- [Follow the Queen](#follow-the-queen)
- [Free Enterprise](#free-enterprise)
- [Game of Life](#game-of-life)
- [Mexican Sweat](#mexican-sweat)
- [Midnight Baseball](#midnight-baseball)
- [Omaha / Seattle / Boise / Jersey Hold'em](#omaha--seattle--boise--jersey-holdem)
- [Pair of Jacks, Trips to Win](#pair-of-jacks-trips-to-win)
- [Rainy Day Baseball](#rainy-day-baseball)

---

## 3 Buy 5 / 5 Buy 5

- **Category:** Guts, Poker Scored
- **Deal:** 3 or 5 cards, face down (two variants). (Fine at a full 8-player table — the 5-card version only needs 40 cards, well under a 52-card deck.)
- **Wildcards:** 5s are always wild, plus optional additional wildcards (dealer's choice).
- **Buying:** Players can buy/exchange cards for a dealer-set price.
- **Ending:** Guts game — ante only, no raise/max-bet structure. Pot escalates hand over hand: any player who loses must match the lost pot to play again. Ends only when one player bets and wins outright. (See "House rule: chips & betting.")

## 3-33 (333)

- **Category:** Other
- **Deal:** 3 cards to each player.
- **Play:** Dealer flips 1 community card per round for 5 rounds total. Any player holding a matching card must discard it. If the flipped card's rank has already come up (and been discarded) in an earlier round, it's set aside and a new card is drawn in its place.
- **Card values:** Aces = 1 or 11, face cards = 10.
- **Winning:** Best high hand AND best low hand both win (split), or a player wins outright by discarding all of their cards.
- **Special:** Being dealt AAA — called "Ultima," or just "three aces" — wins the entire pot outright.
- **Tie-breaker:** None — if multiple players tie for the high or low side, they split that side of the pot evenly among themselves. If two or more players empty their hand on the same flip (the outright-win condition), it's also a split pot between them, not a race to claim it first.
- **Sources:** ["333" – pokermike.com](https://www.pokermike.com/poker/other.html)

## 3-5-7 Guts

- **Category:** Guts (New)
- **Deal:** 3 hole cards to start. After round 1, deal 2 more (5 total). After round 2, deal 2 more again (7 total) — three rounds of escalating hand size. At a full 8-player table, round 3's 7-card hands would need 56 cards, more than a deck holds; a fuller table needs round 3 trimmed down (and its wild rank adjusted to match) rather than dealt at a fixed 7.
- **Wildcards:** Escalates by round — 3s are wild in round 1, 5s are wild in round 2, 7s are wild in round 3.
- **Betting:** Guts game — ante only, no raise/max-bet structure. Before each round, remaining players decide again to fold or match the ante and stay in; the pot carries forward and accumulates across all three rounds.
- **Ending:** After each round's decision, hands are revealed among the players who stayed in, and the lowest hand must match the pot and pay the highest hand. The game ends when the pot is awarded to the last remaining player after round 3 — a straightforward 3-round hand, no early-win rule.
- **Sources:** ["3-5-7 Guts" – coololdgames.com](https://www.coololdgames.com/card-games/gambling/guts/3-5-7/)

## 5.5-21

- **Category:** Other
- **Goal:** Split pot — best hand closest to 5.5 wins half, best hand closest to 21 wins the other half. A player can aim for either target (target game, blackjack-style).
- **Going over:** Players CANNOT go over either target — going over busts you out of contention for that half. (Contrast with 7-27, where going over is allowed.)
- **Card values:** Face cards = 0.5, Ace = 1. All cards dealt face down.
- **Play:** Start with 1 card. Each round, players may take another card or pass.
- **End condition:** Once a full round passes with nobody taking a card, one more complete round of no-takers is required before dealing ends.
- **Tie-breaker:** If two or more players tie for the low (5.5) or high (21) side, the tied player holding the fewest cards wins that side of the pot.
- **Sources:** None found — appears to be a local invention (closest in spirit to the 7-27 family, but with a 21 high target and a stricter bust-on-either-side rule).

## 7-27

- **Category:** Other
- **Goal:** Split pot — best hand closest to 7 wins the low half, best hand closest to 27 wins the high half (same split-pot structure as 5.5-21).
- **Going over:** Players CAN go over either target and still win — going over does not disqualify a hand. (Contrast with 5.5-21, where going over busts you out.)
- **Deal:** 1 card down, then 1 card up (with the option to buy the up-card back so it's hidden again).
- **Additional cards:** Optional extra card each round after the initial deal.
- **Card values:** Face cards = 0.5, Ace = 1 or 11 (free choice). A 10 counts as 10 by default; paying $1 gives it the flexible 0-or-10 choice instead. No fee for being dealt a card face up.
- **Buy-back ("down the river"):** Escalating cost per card replaced, up to 3 total: $1 to replace a first card, $2 to replace a second card (both can happen within the same turn), then later in the game $3 to replace a third — after which the player is done, no more buy-backs allowed. "Use it or lose it" — must decide immediately when offered.
- **Winning:** Closest to the target number wins, regardless of how many cards a player holds.
- **Optional rule — Kitchen Sink:** Dealer's choice whether this is in play. A hand that reads as exactly 7 for low AND exactly 27 for high at the same time (using the flexible ace/ten values) is a "Kitchen Sink" — the best possible hand on both sides at once, since it can't be beaten or tied out of either half. If this rule is on, a Kitchen Sink wins the entire pot outright instead of splitting it (same idea as 3-33's "Ultima"). If more than one player has one, they split the pot evenly between themselves, per the usual tie rule.
- **Tie-breaker:** If multiple players tie for the high or low side, they split that side of the pot evenly among themselves — one of several house choices seen for this game; some groups use "fewest cards wins" instead.
- **Variants:** Also known as "Seven Twenty-Seven" — our "no bust on going over" ruleset is the traditional default ("bust on 27" is a named variant, not the base game). Other variants worth knowing about: secretly declaring low/high/both instead of qualifying automatically at showdown, and an "under always beats over" scoring rule.
- **Sources:** [pagat.com](https://www.pagat.com/vying/7-27.html); [oinc.net](https://www.oinc.net/poker/727.html); [pokermike.com](https://www.pokermike.com/poker/other.html); [2+2 forum](https://forumserver.twoplustwo.com/24/home-poker/7-27-a-1589286/)

## Acey Ducey

- **Category:** Other
- **Deal:** Two cards shown/dealt to the active player.
- **Play:** Player may bet up to the full pot that the next card dealt will fall between the two shown cards (or pass entirely). Aces are low, Kings are high — a specific house choice; most published rules default to Aces high.
- **Losing:** If the player loses, their bet goes into the pot. If the third card matches the rank of either shown card ("hitting the post"), the player loses double their bet instead.
- **End condition:** Game only ends once the full deck is consumed and a player wins the entire pot.
- **Sources:** ["In Between" – pagat.com](https://www.pagat.com/banking/in-between.html); ["Acey Deucey" – gambiter.com](https://gambiter.com/cards/Acey_deucey_card_game.html)

## Blind Man's Bluff

- **Category:** Other (also commonly called "Indian Poker")
- **Deal:** 1 card per player, dealt face down.
- **Play:** Players place their card on their forehead without looking at it — you can only see everyone else's card. Betting is blind.
- **Betting:** Continues in rounds until no more raises/bets are made.
- **Winning:** Highest exposed card wins the pot outright at showdown.
- **Variants:** "Forehead Stud" applies the same hidden-from-owner mechanic to a full stud hand instead of one card.
- **Sources:** [Wikipedia](https://en.wikipedia.org/wiki/Blind_man's_bluff_(poker)); [gambiter.com](https://gambiter.com/poker/Blind_mans_bluff_poker.html)

## Daytime Baseball

- **Category:** Baseball
- **Family:** Part of the baseball family, along with Midnight Baseball and Rainy Day Baseball. All three share the same wildcard/extra-card rule (see below); each has its own deal/play twist.
- **Deal:** 2 cards dealt face down to start, then each round 1 more card is dealt face up, going around the table (same deal structure as Rainy Day Baseball). Number of up-rounds scales with tonight's player count so the deal stays within a single 52-card deck: 5 up-rounds (7 cards total) at typical table sizes (5–7 players), dropping to 4 up-rounds (6 cards total) at a full 8-player table.
- **Wildcards:** 3s and 9s are wild.
  - A 3 is only wild if the player buys it for $3 — required to stay in the game.
  - A 9 is only wild if the player buys it for $2.
- **Extra cards:** Dealing a 4 lets the player buy an extra card for $1.
- **Variants:** Standard Baseball also has 3s and 9s wild, matching us — but ties the 3's cost to matching the current pot rather than our flat $3, and usually doesn't charge for the 9 at all. Paying for the bonus 4-card is also usually optional elsewhere, not default. Our flat fees are house customizations.
- **Sources:** [pagat.com](https://www.pagat.com/poker/variants/baseball.html); [Wikipedia](https://en.wikipedia.org/wiki/Baseball_(poker))

## Deep or Double Screw

- **Category:** Guts
- **Deal:** 6 or 7 cards, face down — pick the version based on tonight's player count, not a fixed choice: fewer players plays the 7-card version, a fuller table switches to the 6-card version so total cards dealt stays within a single 52-card deck (e.g., at 8 players the 7-card version would need 56 cards, more than a deck holds, so 8 plays the 6-card version instead). A dummy hand adds another full hand's worth of cards on top of the real players, so it needs the same per-player-count check.
- **Passing:** Follows whichever deal size is in use — 6-card version passes 1 left / 1 right; 7-card version passes 2 left / 1 right.
- **Betting:** Guts game — ante only, no raise/max-bet structure. Pot escalates hand over hand: any player who loses (including losing against a dummy hand) must match the lost pot to play again. Ends only when one player bets and wins outright. (See "House rule: chips & betting.")
- **Wildcard/game variations (pick one):**
  - 1, 2, or 3 flip-up wildcard(s) after passing
  - Lowest card in hand is wild
  - 3s, 5s, and 7s are wild
  - "Red royals" — all red face cards are wild
- **Notes:** Several wildcard variants exist; dealer's choice which one is in play for a given hand.
- **Sources:** [Guts (card game) – Wikipedia](https://en.wikipedia.org/wiki/Guts_(card_game)); [Guts variants – pagat.com](https://www.pagat.com/poker/variants/guts.html); [3-5-7 Guts – coololdgames.com](https://www.coololdgames.com/card-games/gambling/guts/3-5-7/)

## Follow the Queen

- **Category:** Stud-based
- **Family:** Part of the stud-based games, along with Free Enterprise and Mexican Sweat. Deal order here differs from the family's usual "2 down, then rest up" default (see "House rule: the stud family").
- **Deal:** 6 cards dealt in sequence — 2 up, 3 down, 1 up. (Documented standard is 7 cards — 2 down, 4 up, 1 down; ours may scale down with player count rather than being a flat departure — see Open Questions.)
- **Wildcards:** Queens are wild. The card immediately following an exposed Queen is also wild — but only the card after the MOST RECENTLY shown Queen. If a later Queen is exposed, the earlier "follow" wildcard is cancelled; only the new one applies going forward.
- **Betting:** Highest showing hand starts the betting.
- **Notes:** Low Chicago (best low spade in the hole) is encouraged as a companion side-pot rule — only concealed (hole-card) spades count toward it.
- **Tie-breaker:** When played with Low Chicago, ties on that side pot split evenly among the tied players.
- **Variants:** Some published rules have players declare high/Chicago/both at showdown instead of it being automatic — not something we do.
- **Sources:** [Chicago/Follow the Queen – pagat.com](https://www.pagat.com/poker/variants/chicago.html)

## Free Enterprise

- **Category:** Stud-based
- **Family:** Part of the stud-based games, along with Follow the Queen and Mexican Sweat. Matches the family's usual "2 down, then rest up" default, except the final card here is dealt down again rather than up (see "House rule: the stud family").
- **Deal:** 2 down, then up-card rounds (one per round), then 1 down — matching the stud family's typical shape (see "House rule: the stud family"). Number of up-rounds scales with tonight's player count so the deal stays within a single 52-card deck: 4 up-rounds (7 cards total) at typical table sizes (5–7 players), dropping to 3 up-rounds (6 cards total) at a full 8-player table.
- **Wipe:** Players can pay to "wipe" (discard and replace) a card. The wipe price escalates as the hand goes on — dealer's choice of scale: $1 / $2 / $3, or a cheaper scale starting at $0.50.
- **Last round:** Whatever the current wipe price is at that point gets doubled for the final round.
- **Betting:** Based on highest showing card(s).
- **Sources:** [Buy Your Card – pagat.com](https://www.pagat.com/poker/variants/buyyourcard.html); [Free Enterprise (unrelated game) – poker.com](https://poker.com/game/stud-poker-games/free-enterprise/)

## Game of Life

- **Category:** Poker Scored
- **Deal:** 5 cards to each player.
- **Setup:** Two rows of 5 cards are placed face down on the table — one "good" row (cards can be added to your hand) and one "bad" row (cards are discarded).
- **Play:** Players take turns flipping a card from either row. Turn order rotates each round, and whichever player goes first in a round gets to choose which side (good or bad) they flip from.
- **Bad-card effect:** Flipping a bad-row card poisons its rank for the rest of the hand. Any card of that rank already in a player's hand is discarded — placed on top of the bad card to show it's out of play. Any card of that rank still face-down in the good row also moves over to the bad side instead. From then on, any future flip — from either row — that matches a poisoned rank is immediately treated as bad and discarded rather than added to a hand.
- **Sources:** None found for this mechanic — appears to be original to our group. (A same-named-theme game turned up — ["The Good, the Bad and the Ugly" – poker.com](https://poker.com/game/stud-poker-games/good-bad-ugly/), a seven-card stud variant with three community "reveal" cards that trigger wildcards/discards/eliminations — but it's mechanically unrelated to our face-down good/bad row draft.)

## Mexican Sweat

- **Category:** Stud-based*
- **Family:** Part of the stud-based games, along with Follow the Queen and Free Enterprise. Doesn't really follow the family's usual "2 down, then rest up" default — all cards start down and players reveal their own choice of card each round rather than the dealer dealing new up cards (see "House rule: the stud family").
- **Deal:** All down, no looking at your hand! Card count adjusts to tonight's player count rather than being fixed — 7 cards each is the target at typical table sizes, dropping to fewer at a fuller table so the deal stays within a single 52-card deck (e.g., 7 cards × 8 players would need 56, more than a deck holds).
- **Wildcards:** Dealer's choice, or reveal 1 flip-up wildcard.
- **Play:** Each round, every player flips 1 card from their hand face up, then a betting round follows. This simultaneous reveal is a deliberate house choice, not an oversight — the standard/documented version instead has players reveal one at a time in turn, stopping once they beat the current best showing hand, but that's the same "beat the card" structure Midnight Baseball already uses, so we keep this one simultaneous to stay distinct.
- **Variants:** A "dead card" rule is a good one to know about — flipping a card matching a center reference card eliminates that player instantly. Not currently part of our version.
- **Sources:** [denexa.com](https://www.denexa.com/blog/mexican-sweat/); [pokerhouserules.com](https://pokerhouserules.com/mexican-sweat.html); ["No Peek" – pagat.com](https://www.pagat.com/poker/variants/baseball.html)

## Midnight Baseball

- **Category:** Baseball
- **Family:** Part of the baseball family, along with Daytime Baseball and Rainy Day Baseball. Shares the same wildcard/extra-card rule (see below), but has a distinct "beat the card" turn structure instead of a standard stud deal.
- **Deal:** All cards dealt face down to each player — no up cards during the deal itself.
- **Wildcards:** 3s and 9s are wild.
  - A 3 is only wild if the player buys it for $3 — required to stay in the game.
  - A 9 is only wild if the player buys it for $2.
- **Extra cards:** Dealing a 4 lets the player buy an extra card for $1.
- **Play ("beat the card"):** An initial reference card is flipped that the first player must try to beat. On a player's turn, they turn their face-down cards over one at a time (building their best baseball hand) until either they beat the current highest showing hand, or they run out of cards to turn. Once a player stops, everyone bets — even if that player ran out without beating the board and is thereby eliminated, the betting round still happens. The next player in turn order must then beat the new highest showing hand before they can stop turning cards and force another betting round.
- **End condition:** Continues until only one player holds the top hand after everyone has gone through their cards, or the rest have folded because the odds are no longer in their favor to win.
- **Variants:** Standard/documented rule ("Night Baseball") instead skips the betting round entirely when a player is eliminated without beating the board — we bet regardless.
- **Sources:** ["Night Baseball" – pagat.com](https://www.pagat.com/poker/variants/baseball.html)

## Omaha / Seattle / Boise / Jersey Hold'em

- **Category:** Texas Hold'em variant
- **Deal:** Texas Hold 'Em variant, board cards shared communally. Omaha, Seattle, and Boise deal 4 hole cards face down to each player; Jersey Hold'em deals 5. The variant name sets the hand construction rule.
- **Hand construction (5 cards shown total, always):**
  - **Omaha:** 2 cards from hand + 3 from the board. Matches the documented standard exactly.
  - **Seattle:** 3 cards from hand + 2 from the board. A local variant — not documented anywhere online under this name, likely specific to our group.
  - **Boise:** Flexible — either 2 from hand / 3 from board, or 3 from hand / 2 from board, player's choice at showdown. Attested as a real pagat-listed variant name (a shared/community-card hi-lo game), though its detailed rules weren't confirmable from available sources.
  - **Jersey Hold'em** (also known as "Cosmic Poker") **(New):** Same flexible 2-or-3 construction as Boise, but dealt 5 hole cards instead of 4 — the closest verified documented relative of Boise. Not currently part of our rotation.
- **Optional:** Hi-lo split. Low hand: five unpaired cards, each ranked 8 or under — straights and flushes don't count against it, only rank matters. Aces count low, so A-2-3-4-5 ("the wheel") is the best possible low, and can double as a straight for high. Built with the same hand/board split as the high hand, but not necessarily the same five actual cards. If nobody has a qualifying low, the high hand takes the whole pot; a hand can also scoop both halves if it's best on both sides.
- **Blinds:** $0.50 small blind / $1 big blind. No cap on bet size — standard Texas Hold'em raise rules apply (e.g., minimum raise = size of the previous bet/raise).
- **Tie-breaker:** None — if multiple players tie for a side of the pot, they split it evenly among themselves.
- **Sources:** [Wikipedia](https://en.wikipedia.org/wiki/Omaha_hold_%27em); [Omaha – pagat.com](https://www.pagat.com/poker/variants/omaha.html); [Invented shared-card variants (incl. Boise, Jersey Hold'em) – pagat.com](https://www.pagat.com/poker/variants/invented/shared.html)

## Pair of Jacks, Trips to Win

- **Category:** Poker Scored
- **Deal:** 5 cards, face down.
- **Opening:** Only a hand of Jacks-or-better may open the betting. If nobody can open, the hand is redealt.
- **Draw:** Players may exchange up to 3 cards (4 if holding an Ace) after opening.
- **Winning:** Requires trips (three of a kind) or better to win at showdown — a deliberate house tightening from the classic game ("Jackpots"/"Jacks or Better"), where any hand can win once opened. This minimum-hand requirement is the defining twist of our version.
- **Sources:** ["Jackpots" / Five Card Draw – pagat.com](https://www.pagat.com/poker/variants/5draw.html); [Jacks to Open – pokernews.com](https://www.pokernews.com/pokerterms/jacks-to-open.htm)

## Rainy Day Baseball

- **Category:** Baseball
- **Family:** Part of the baseball family, along with Daytime Baseball and Midnight Baseball. Shares the same wildcard/extra-card rule (see below); the "rain out" rule is what makes this variant distinct.
- **Deal:** Stud-style baseball variant — 2 cards down, 1 up, then a betting round, then 1 more card dealt.
- **Wildcards:** 3s and 9s are wild.
  - A 3 is only wild if the player buys it for $3 — required to stay in the game.
  - A 9 is only wild if the player buys it for $2.
- **Extra cards:** Dealing a 4 lets the player buy an extra card for $1.
- **"Rain out" rule:** A red queen rains out (kills) the hand — the pot carries forward to the next hand, same as the standard version. After the first rain-out, a second rain-out requires two red queens to trigger.
- **Optional rule:** "Once you're out, you're out" — a player eliminated by a rain-out doesn't return for the rest of that hand.
- **Variants:** Standard/documented version triggers on the Queen of Spades specifically rather than any red queen — our red-queen-with-escalation trigger is the deliberate house twist on the same "rain out" idea.
- **Sources:** [Baseball (poker) – Wikipedia](https://en.wikipedia.org/wiki/Baseball_(poker))

---

## Open questions / to confirm next session

- **Follow the Queen:** Our deal is 6 cards (2 up, 3 down, 1 up); the standard/documented version deals 7 cards (2 down, 4 up, 1 down). Possibly ours scales with player count rather than being a fixed departure — worth confirming with the group.

## House rule: table size

Every game in this doc is designed around a standard single poker table: **5–8 players**. Nobody's capped out of a game for having a full table — instead, a few entries adjust their deal shape to keep total cards dealt within a single 52-card deck (Deep or Double Screw, Free Enterprise, Mexican Sweat, 3-5-7 Guts — see each entry's Deal field). Player count is worth settling before dealing since it decides which version of these games is actually in play.

## House rule: chips & betting

Chip denominations and betting limits are set by the dealer for each hand — no fixed rule across the whole group. For example gameplay, we're using these as the defaults:

- **Chips:** 25-cent chips. No limit on total chips a player can hold — players can buy more if they're running low.
- **Standard betting (most games):** 50-cent ante, 25-cent raise increment, $2 max bet per person.
- **Guts games** (Deep or Double Screw; 3 Buy 5 / 5 Buy 5): Ante only — no raise/max-bet structure applies. The pot escalates hand over hand: any player who loses a hand (including losing against a dummy hand) must match the lost pot to play the next hand. This only ends once a single player bets and wins outright.
- **Omaha / Seattle / Boise / Jersey Hold'em** (Hold'em variants): $0.50 small blind, $1 big blind, no cap on bet size — standard Texas Hold'em raise rules apply (e.g., minimum raise = size of the previous bet/raise).

## House rule: split-pot ties

Default rule across all split-pot games: if multiple players tie for a side of the pot, they split that side evenly among themselves. **5.5-21 is the one exception** — there, a tie is broken by fewest cards held rather than split evenly (see that entry).

## House rule: the baseball family

Daytime Baseball, Midnight Baseball, and Rainy Day Baseball all share the same wildcard/extra-card rule: 3s and 9s are wild but must be bought ($3 for a 3, $2 for a 9) to count as wild, and dealing a 4 lets a player buy an extra card for $1. Each variant then layers on its own twist — Daytime is the standard deal, Midnight uses a "beat the card" turn structure, and Rainy Day adds the rain-out rule.

## House rule: the stud family

Typical deal shape for stud-based games: 2 cards dealt down to start, then the remaining cards are dealt face up, one per round, with a betting round in between rounds. Free Enterprise matches this default except its final card is dealt down again rather than up. Follow the Queen and Mexican Sweat both deviate further — see each entry's Deal field for specifics.

## Future app fields (draft)

Fields worth capturing per game once we're ready to structure this for the app (none of these have values populated yet — this is just the proposed schema):

- **Player count:** ideal range and hard min/max (e.g., Omaha needs a real board and scales differently than a 2-3 player game; some guts games get more chaotic — and more fun — with more players).
- **Hand length:** rough time for one hand/round, so the app can suggest something quick vs. something to settle into.
- **Session length:** how long the game tends to run overall — guts games in particular can run long since they don't end until someone wins outright, which matters for "we only have an hour" planning.
- **Betting/bankroll volatility:** how much a single hand can swing a player's stack — guts games and Free Enterprise's escalating wipe cost run hotter than a flat-limit stud hand; useful for matching games to how much the group wants to gamble that night.
- **Skill vs. luck weighting:** how much reads/strategy matter vs. pure chance.
- **Complexity/learning curve:** how easy it is to teach a new or occasional player mid-session.
- **Chaos/spectacle factor:** how much table energy or "everyone's watching" moments a game generates (Midnight Baseball's "beat the card" showdown and Blind Man's Bluff both score high here) — useful for a "we want something loud" pick.
- **House favorite rating:** how often the group actually picks to play it.
- **Equipment notes:** anything beyond a standard deck and chips (e.g., something to track a rotating wild card or the current wipe price).
- **Category:** already captured per entry (Guts / Stud-based / Texas Hold'em variant / Baseball / Other) — useful for "give me something in the X family" filtering.

Worth deciding together whether to fill these in as informed estimates now, or track them going forward as the group actually plays each game (the latter would produce more honest data, especially for hand/session length and house-favorite rating).

# CardNight

A dealer's-choice poker night companion: pick a game, filter by player count and category, and pull up a one-page cheat sheet — setup, gameplay, how to win, and a script for explaining the rules out loud.

**🃏 Live app: https://wizoi.github.io/CardNight/**

## The games

17 dealer's-choice variants, grouped into five categories. Full rules, house-specific tweaks, and research notes for each live in [`games.md`](games.md).

- **Guts** — ante-only, pot-escalates-till-someone-wins games: Deep or Double Screw, 3 Buy 5 / 5 Buy 5, 3-5-7 Guts *(New)*
- **Stud-based** — Follow the Queen, Free Enterprise, Mexican Sweat
- **Texas Hold'em variant** — Omaha / Seattle / Boise / Jersey Hold'em *(New)*
- **Baseball** — wildcard-buying stud variants: Daytime Baseball, Midnight Baseball, Rainy Day Baseball
- **Other** — 3-33, 5.5-21, 7-27, Acey Ducey, Blind Man's Bluff, Game of Life, Pair of Jacks/Trips to Win

*(New)* marks games that aren't part of the group's actual rotation yet — sibling/relative games turned up during rule research and are documented as candidates worth trying.

## Repo layout

- **[`games.md`](games.md)** — the source-of-truth house rules doc for every game.
- **`app/`** — the static picker app (plain HTML/CSS/JS, no build step). Open `app/index.html` directly in a browser to run it locally, or use the live link above.

## Local development

```
app/index.html   # open directly in a browser — no server or build needed
```

`app/games-data.js` is a hand-curated structured version of `games.md`. There's no automated sync between the two — when the rules doc changes, check whether the app data needs updating too.

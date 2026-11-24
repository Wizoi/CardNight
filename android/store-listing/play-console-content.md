# Play Console store listing content (Android roadmap step 8)

Drafted 2026-11-24, restructured the same day to match Play Console's own
"App content" dashboard checklist section-for-section (not just the store
listing text). Copy-paste source — not auto-synced, Play Console has no API
this project uses for listing/content-questionnaire data (only the AAB
upload itself is automated, via `publishBundle` — see `android/README.md`),
so updates here are manual going forward.

---

## Dashboard: "Let us know about the content of your app"

### Privacy policy

URL: `https://wizoi.github.io/CardNight/privacy-policy.html`

Already built (`privacy-policy.html` at the repo root) and wired into the
Pages deploy workflow's path triggers — **this only resolves once the repo
is pushed to `main` and the Pages deploy has run.** Confirm it loads in a
browser before pasting the URL into this field.

### Terms of Service

URL: `https://wizoi.github.io/CardNight/terms-of-service.html`

Not required by Play Console's own "App content" checklist, but worth
having (and linking from the privacy policy, which it now does) — covers
no-real-money-gambling, the 18+ age requirement, license to use the app, no
warranty, and limitation of liability. Same deploy dependency as the
privacy policy above: only resolves once pushed and the Pages deploy has
run.

### Sign in details

**"No, users can access all features without creating an account or
signing in."** There is no account system anywhere in this app — all
state (chip history, seats, resumable hands) is local-only `localStorage`,
and `rules-*`/`session-*`/`ai-*` never touch a backend of any kind.

### Ads

**"No, my app doesn't contain ads."** True as of this draft. **This answer
must be revisited before any production rollout if step 10 (monetization)
ships rewarded or banner ads first** — re-check this section at that
point, don't assume it stays "No" forever.

### Content rating (IARC questionnaire)

Category to select: **Simulated Gambling.**

Answers to give the actual questionnaire (confirm exact wording live, since
Google revises phrasing periodically):

- Does the app contain simulated gambling? **Yes** — poker-style games
  played with virtual/play chips.
- Can the user wager or bet virtual currency or items? **Yes**, play-chips
  only.
- Can anything of value (including virtual currency) be purchased with
  real-world money? **No, as of this draft.** If/when a cosmetic or
  full-unlock IAP ships (step 10), this stays "No" as long as nothing
  purchased converts back to cash value or grants extra wagering power —
  re-check this answer before production rollout if monetization has
  shipped by then.
- Can the user cash out or convert in-game currency/winnings to real-world
  money? **No.**

Expected outcome: a mature-but-not-maximal rating (simulated gambling
without real-money stakes rates lower than real-money gambling apps) — the
exact tier is assigned by the questionnaire itself, not chosen directly.

### Target audience and content

- Age groups to select: **18 and over only.** Do not select any
  under-18 age bracket.
- "Does your app appeal to children?" → **No.**
- **Do not opt into the Play Families program** — a simulated-gambling app
  should not be positioned as child-directed regardless of the literal
  content rating tier it lands on.

### Data safety

This app collects essentially nothing:

- No account creation, no sign-in, no network calls to any backend of this
  project's own.
- No analytics or crash-reporting SDK is wired in yet (a known roadmap
  gap, not built).
- All data is local-only: `localStorage` inside the WebView holds chip
  history, seat assignments, setup preferences, and the resumable mid-hand
  save — never transmitted anywhere, never leaves the device.

Declare: **"No data collected"** across every category in the form (no
personal info, financial info, location, or app activity sent off-device).
**Revisit this section before the next submission if a crash-reporting or
analytics SDK is ever added** — that would introduce real data collection
(crash logs, device identifiers) requiring honest disclosure here.

### Government apps

**No** — this is not a government app.

### Financial features

**No / not applicable.** This section is about real financial services —
loans, crypto wallets, money transmission, buy-now-pay-later, etc. This app
has none of that: it's play-chips only, confirmed as a hard constraint in
the roadmap doc itself ("no purchase may carry real-money value"). Don't
confuse this with the Simulated Gambling content-rating category above —
they're two separate Play Console questionnaires asking different things.

### Health

**No / not applicable.** Not a health-related app in any sense Play
Console's Health section is asking about.

### Trader status (EU Digital Services Act disclosure)

Play Console requires declaring whether you're publishing as a "trader"
(a business/professional seller) or a private individual developer not
acting as a trader. **This is the user's own call, not something to
default on this draft** — it depends on whether this app is published
under a registered business entity or as an individual, which may already
be settled by however the existing Play Console account (reused from
SmugView/AegidaSafe) was originally set up. Check the account's existing
declaration before assuming; if this is the first time it's being set,
confirm your actual status before submitting.

---

## Dashboard: "Manage how your app is organized and presented"

### App category and contact details

- Primary category: **Card** (under Games).
- Tags/keywords: poker, card game, AI opponents, single player, offline.
- **Contact email**: `kidzi+luckofthedeal@idzifamily.com` — use this for
  every contact-email field across the Play Console forms (store listing
  contact details, developer account contact if it asks per-app, any
  support-email field in the content questionnaires), not just the one
  listing field.

### Store listing

**App name**: Luck of the Deal

**Short description** (max 80 characters, 78 used):

> Poker night against AI opponents. 27 house games, no real-money wagering.

**Full description** (max 4000 characters):

> Luck of the Deal brings a real poker night to your phone — sit down at a
> table of AI opponents, each with their own distinct playing style, and
> work through 27 different home-poker variants: classic Texas Hold'em
> relatives (Omaha, Seattle, Boise, Jersey Hold'em), stud games (Daytime
> Baseball, Follow the Queen, Seven and What Makes It), guts games (Deep or
> Double Screw, 3-5-7 Guts), and more.
>
> **This is a play-chips game. There is no real-money wagering, no
> purchase ever has cash value, and nothing can be cashed out.** Chips are
> for keeping score across a session, exactly like poker chips at a real
> kitchen-table game night.
>
> What's in the box:
> - 27 fully-implemented house poker variants, each with its own real
>   rules, wildcards, and betting structure
> - 13 distinct AI opponent personalities — from tight-and-cautious to
>   loose-and-aggressive, bluffing, reading the table, and reacting to how
>   a hand goes
> - 30 named "regulars" to fill the other seats, each with their own
>   backstory and in-character table talk
> - A full poker-night structure: cut for deal, a rotating game picker,
>   day-over-day chip history, and a "Regulars" tracker across sittings
> - Play fully offline once installed — no account, no internet connection
>   required
> - A quick first-time walkthrough covers the touch controls before your
>   first hand
>
> Whether you already know these house rules from your own group's poker
> nights or you're discovering a new variant for the first time, Luck of
> the Deal is built for picking up and playing a hand right now.

**Graphics (already prepared — see `table/store-assets/`)**:

- App icon: `table/icon-foreground.svg` / rasterized `icon-foreground-1024.png`
  (adaptive icon already wired via `table/icon-maskable.svg`)
- Feature graphic (1024×500): `table/store-assets/feature-graphic-1024x500.png`
- Hi-res icon (512×512, PNG, Play Console's own upload requirement):
  `table/store-assets/icon-512.png`
- **Still needed**: at least 2 real phone screenshots of the running app —
  flagged as open since step 5, needs the emulator/device pass (step 7) to
  produce them; not done yet.

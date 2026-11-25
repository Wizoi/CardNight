# App Store Connect listing content (Android roadmap step 11, iOS)

Drafted 2026-11-25, reusing the same copy already live on Google Play
(`android/store-listing/play-console-content.md`) wherever Apple's fields
match, adapted where Apple's forms are genuinely different. Copy-paste
source -- not automatable via the pipeline the way `publishReleaseListing`
pushes Play's listing, since App Store Connect's own metadata API is a
separate, heavier integration not attempted this pass.

## App Information

**Name**: Luck of the Deal

**Subtitle** (max 30 characters):
```
Poker night vs. AI, no wagers
```

**Primary category**: Games -> Card. **Secondary category**: Games -> Casino
(Apple requires the Casino category specifically for simulated-gambling
content, distinct from how Google Play just uses Card + a content-rating
flag).

## Pricing and Availability

Free, available worldwide **except Korea** -- same GRAC (Game Rating and
Administration Committee) restriction already hit on Google Play; Korea
requires its own separate local content rating that simulated-gambling
content makes impractical to pursue for a testing-stage release.

## App Privacy ("nutrition label")

Matches the Play Data Safety answers exactly, since the underlying facts
are identical (no accounts, no network calls, all `localStorage`,
everything local-only, nothing transmitted): declare **"Data Not
Collected"** across the whole App Privacy questionnaire. Revisit if a
crash-reporting or analytics SDK is ever added (same flag as the Play
Data Safety entry).

## Age Rating questionnaire

Apple's own Age Rating survey mandates **17+** for any app depicting
simulated gambling, full stop -- unlike Google Play's more granular IARC
tiers, there is no lighter outcome available here regardless of how the
"can anything be purchased with real money" question is answered. Answer
the simulated-gambling question honestly (yes); expect the 17+ floor
either way.

## Description (same full text as the Play listing)

> Luck of the Deal brings a real poker night to your phone -- sit down at
> a table of AI opponents, each with their own distinct playing style, and
> work through 27 different home-poker variants: classic Texas Hold'em
> relatives (Omaha, Seattle, Boise, Jersey Hold'em), stud games (Daytime
> Baseball, Follow the Queen, Seven and What Makes It), guts games (Deep or
> Double Screw, 3-5-7 Guts), and more.
>
> This is a play-chips game. There is no real-money wagering, no purchase
> ever has cash value, and nothing can be cashed out. Chips are for keeping
> score across a session, exactly like poker chips at a real kitchen-table
> game night.
>
> What's in the box:
> - 27 fully-implemented house poker variants, each with its own real
>   rules, wildcards, and betting structure
> - 13 distinct AI opponent personalities -- from tight-and-cautious to
>   loose-and-aggressive, bluffing, reading the table, and reacting to how
>   a hand goes
> - 30 named "regulars" to fill the other seats, each with their own
>   backstory and in-character table talk
> - A full poker-night structure: cut for deal, a rotating game picker,
>   day-over-day chip history, and a "Regulars" tracker across sittings
> - Play fully offline once installed -- no account, no internet connection
>   required
> - A quick first-time walkthrough covers the touch controls before your
>   first hand
>
> Whether you already know these house rules from your own group's poker
> nights or you're discovering a new variant for the first time, Luck of
> the Deal is built for picking up and playing a hand right now.

**Keywords** (max 100 characters, comma-separated, no spaces after commas
per Apple's own convention):
```
poker,card game,cards,AI,solitaire,casino,offline,texas holdem,blackjack,table
```

**Promotional text** (max 170 characters, editable without a new build --
Apple-specific field with no Play equivalent):
```
Early testing release. 27 house poker games against AI opponents -- no real-money wagering, ever.
```

## URLs

- **Privacy Policy URL**: `https://wizoi.github.io/CardNight/privacy-policy.html`
- **Support URL**: same privacy policy page for now (it links back to the
  app and lists a contact email) -- a dedicated support page isn't built;
  revisit if Apple review pushes back on reusing it.
- **Marketing URL**: optional, left blank.

## Contact / support email

`kidzi+luckofthedeal@idzifamily.com` -- same address already used across
every Play Console field.

## Screenshots (not yet captured for iOS)

Apple requires device-class-specific screenshots, different pixel sizes
than the Android phone screenshots already captured:
- **6.9" iPhone** (e.g. iPhone 16 Pro Max): 1320x2868 or 1290x2796
  depending on exact device/orientation Apple's current upload tool
  accepts -- confirm the live requirement at upload time, these change
  periodically.
- **13" iPad** (e.g. iPad Pro): 2064x2752 or 2048x2732.

SmugView's own `ios-store-screenshots.yml`/`store-screenshots.sh` (surveyed
2026-11-25) automate exactly this via the iOS Simulator at Apple's exact
required sizes, and explicitly check for an alpha channel (Apple rejects
screenshots with one) -- worth adapting directly once the core
build/signing pipeline is working, rather than hand-capturing these.

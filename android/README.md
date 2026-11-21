# android/ -- the TWA wrapper (Android roadmap step 6)

Generated 2026-11-20 via Bubblewrap's programmatic API (`@bubblewrap/core`'s
`TwaManifest`/`TwaGenerator`), not the interactive CLI wizard -- the wizard
prompts for values and for signing-key generation, and this session's shell
runs non-interactively, so the wizard itself can't run here. Driving the
library directly let project generation happen without touching signing at
all, which was deliberate: generating the project (regenerable any time via
`twa-manifest.json`, see below) is reversible; generating an upload signing
key is not, and that's the user's call to make directly, not something to
script around.

**No signing key exists in this project.** `twa-manifest.json`'s
`signingKey.path` names where one would go (`./android.keystore`), but no
such file exists yet, and `.gitignore` already blocks `*.keystore`/`*.jks`
from ever being committed if one is created here.

## What's here

- A full Gradle/Android Studio project (`app/`, `build.gradle`, `gradlew`,
  etc.) targeting the live PWA at `https://wizoi.github.io/CardNight/table/`.
- `twa-manifest.json` -- the source of truth Bubblewrap itself reads for
  `bubblewrap build`/`bubblewrap update`. Package id `com.luckofthedeal.app`
  (matching the `com.<app>.app` pattern this account's other Android
  projects, SmugView/AegidaSafe, already use).
- Real launcher icons (`app/src/main/res/mipmap-*/ic_launcher.png` and
  `ic_maskable.png`) rasterized by Bubblewrap directly from this repo's
  `table/icon.svg`/`icon-maskable.svg` -- confirmed by viewing the actual
  generated PNGs, not just trusting the generator ran without error.
- `assetlinks-template.json` -- see the real blocker below before using it.

## Real blocker found, not yet resolved: Digital Asset Links needs a domain root this repo doesn't control

A TWA only runs "trusted" (no visible browser address bar) once Android can
verify, via `https://<host>/.well-known/assetlinks.json`, that the app and
the website are controlled by the same party. `<host>` here is
`wizoi.github.io` -- the whole domain, not `wizoi.github.io/CardNight/`.

Checked directly: `https://wizoi.github.io/` and
`https://wizoi.github.io/.well-known/assetlinks.json` both 404 right now.
There's no `Wizoi/wizoi.github.io` repo in this account's GitHub org (only
project-page repos like `CardNight`) -- GitHub Pages only serves a domain's
*root* `.well-known/` path from a repo named exactly `<account>.github.io`,
which doesn't exist here. A project-page repo has no way to place a file at
the domain root.

**This needs a decision, not more automated work:**
1. Create a `Wizoi/wizoi.github.io` repo (even a minimal one) whose own
   Pages deployment serves `.well-known/assetlinks.json` at the domain
   root. The real fix, if a TWA with a hidden address bar matters.
2. Skip verification for now and accept the TWA running as an unverified
   Custom Tab (the address bar stays visible at the top) -- the app still
   works, just doesn't look fully native.
3. Revisit once there's a real signing key anyway, since the fingerprint
   can't be filled in before then regardless.

Not decided yet -- flagged here and in the roadmap doc rather than guessed
at.

## Regenerating this project

```
npx @bubblewrap/core --version   # one-time: makes @bubblewrap/core resolvable
node tools/generate-twa-project.js
```

`tools/generate-twa-project.js` never touches signing -- see the top of
that file for why.

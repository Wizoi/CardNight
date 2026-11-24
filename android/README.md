# android/ -- the Capacitor-wrapped native app (Android roadmap step 6)

**Switched from a Bubblewrap/TWA wrapper to Capacitor on 2026-11-21**, at the
user's explicit request: a TWA doesn't bundle the web app at all -- it's a
thin native shell that launches Chrome pointed at the live
`https://wizoi.github.io/CardNight/table/` URL (see `git log` for the
superseded TWA version of this directory, fully recoverable). The user
asked specifically to bake the web assets into the package instead of
depending on that live URL, understanding the real tradeoff that comes with
it: **content updates now need a new build + reinstall (or store update),
not just a `git push`.**

## How the source stays untouched and independently testable

This was a specific design goal, not an afterthought: `table/js/*.js`,
`table/index.html`, `table/style.css` are completely unmodified by any of
this. The pipeline is:

1. **Source** (`table/`) -- same files, same dev workflow, same
   `table/tests/run-all.js` validation as always, nothing Capacitor-related
   touches these.
2. **`tools/build-table.js`** (Android roadmap step 2) -- the "mapper": reads
   the source and produces `table/dist/`, a single bundled file plus
   assets. Concatenation only, no semantic transform.
3. **Capacitor** (`capacitor.config.json`'s `webDir: "table/dist"`) --
   copies that already-bundled output into
   `android/app/src/main/assets/public/`. Confirmed directly: `bundle.js`
   (1.28MB, the folded-together 78 source files + `../app/games-data.js`),
   `people-images/`, `style.css`, `manifest.webmanifest`, `sw.js`, and
   `icon.svg`/`icon-maskable.svg` are all physically present as real files
   there, not a URL reference anywhere.

`npm run sync` (root `package.json`) runs both steps 2 and 3 together:
rebuild `table/dist/`, then `npx cap sync android` to refresh the copy
inside the native project.

## Release signing key -- generated 2026-11-24, at the user's explicit go-ahead

Generating a release signing keystore is this app's permanent upload
identity once ever used -- the password can never be recovered or reset if
lost, and losing it means losing the ability to ever update the app again
under that identity. This stayed the user's own call, and was only
generated after they explicitly said go (see this session's own
AskUserQuestion exchange).

**How it was generated, so the mechanism is auditable without exposing the
secret**: a single bash invocation generated a random password with
`openssl rand`, used it immediately within that same script to run
`keytool -genkeypair` (via the Android Studio JBR's own `keytool.exe`), then
wrote the password into a local credentials file -- the password was never
echoed to this session's own output at any point, only "DONE" plus a file
listing.

- `android/keystore/release.keystore` -- the actual keystore, alias
  `cardnight-release`, RSA 2048, valid 30 years (10950 days).
- `android/keystore/release-credentials.txt` -- the alias + both passwords
  (store and key password are the same value), plus a warning not to lose
  it. **This is a plain `.txt` file, not a `.keystore`/`.jks` file** -- the
  original `.gitignore` patterns didn't cover it at all, a real gap caught
  and fixed the same session by adding `android/keystore/` itself as its
  own gitignore line (now covers both files by directory, not just by
  extension).

**Backed up outside this repo, 2026-11-24**: the user copied both files to
their own OneDrive-synced folder (a "Family Specific/.../App Keys" area
already used for other apps' signing material) -- confirmed present there
at the same byte sizes as the originals. This project still has no
automated backup step; the OneDrive copy is the only backup, made by the
user directly.

**A local DEBUG build is a different story and was attempted directly**:
Android's debug build uses an auto-generated, universal debug keystore
every Android dev machine has (`~/.android/debug.keystore`, Android
tooling's own long-standing convention) -- it's never used for anything
users-facing, carries no consequence, and isn't the signing decision this
project is careful about.

**Verified, 2026-11-21: `./gradlew.bat assembleDebug` succeeds and produces
a real, working APK** (`android/app/build/outputs/apk/debug/app-debug.apk`,
~5.8MB) -- confirmed its contents directly (`unzip -l`), not just that the
build exited 0: `assets/public/bundle.js`, `index.html`, and all 30 avatar
`.jfif` photos are genuinely packed inside the APK itself.

One real gotcha hit getting there, worth remembering: `android/local.properties`'s
`sdk.dir` failed Android Gradle Plugin's path validation (`Invalid file
path`) when written with escaped backslashes
(`C:\\Users\\kidzi\\...`) -- `.properties` files treat `\` as an escape
character, and sequences like `\A`/`\U` aren't valid Java escapes, so the
path silently came out corrupted. Forward slashes
(`sdk.dir=C:/Users/kidzi/AppData/Local/Android/Sdk`) sidestep the whole
class of bug and are accepted fine by both Gradle and Windows.

## What's no longer needed from the TWA approach

- **Digital Asset Links / `assetlinks.json`**: gone, along with the real
  blocker it had (no `wizoi.github.io` domain-root repo to serve it from --
  see earlier commits for that writeup). There's no live URL to verify
  ownership of anymore, so this whole mechanism doesn't apply.
- **`tools/generate-twa-project.js`**: superseded, left in git history, not
  carried forward -- Capacitor's own `cap add android` does the equivalent
  job for this architecture, and re-running it is just `npx cap sync
  android` (see `npm run sync` above), no custom script needed.

## Real icons, not Capacitor's generic default

`npx cap add android` scaffolds with Capacitor's own generic placeholder
icon (a blue "X" logo) -- it does NOT pull icons from the web app at all.
Confirmed directly by viewing the generated
`mipmap-xxxhdpi/ic_launcher_foreground.png` right after `cap add android`
before this fix: genuinely the wrong, generic icon, not an assumption.

Real icons come from `@capacitor/assets` (a separate tool), Easy Mode:

```
npx @capacitor/assets generate --android \
  --iconBackgroundColor '#082a20' --iconBackgroundColorDark '#082a20' \
  --splashBackgroundColor '#082a20' --splashBackgroundColorDark '#082a20'
```

This reads `assets/icon.png` (committed here -- a transparent-background,
foreground-only 1024x1024 render of the fan-of-cards art, rasterized from
`table/store-assets/icon-foreground.svg`, same source family as every
other icon asset in this repo) and generates real adaptive-icon
foreground/background layers plus splash screens at every density, using
the app's actual felt-green brand color as the background instead of
transparent/white. Verified by viewing the generated launcher icon and
splash screen directly, not just trusting the generator's exit code.

Re-run this any time `assets/icon.png` changes; `npx cap sync android`
alone does NOT regenerate icons, only the web asset copy.

## Regenerating this project from scratch

```
npm install
npx cap init "Luck of the Deal" "com.luckofthedeal.app" --web-dir table/dist
node tools/build-table.js
npx cap add android
npx @capacitor/assets generate --android --iconBackgroundColor '#082a20' --iconBackgroundColorDark '#082a20' --splashBackgroundColor '#082a20' --splashBackgroundColorDark '#082a20'
```

## Automated Play Console publishing (Android roadmap step 9, wired up 2026-11-24)

The `com.github.triplet.play` ("Gradle Play Publisher") plugin is configured
in `app/build.gradle`, gated on `android/play-service-account.json`
existing (a local, gitignored Google Cloud service-account key -- see the
Play Console "API access" / "Users and permissions" screens for how to
generate one; the exact menu path has moved around in recent Play Console
versions). It targets the `internal` testing track and defaults to app
bundles.

**`./gradlew.bat publishReleaseBundle`** builds (if needed) and uploads the
current `versionCode` to that track -- a real, user-facing action, not run
automatically as part of an ordinary build. First successful upload:
2026-11-24, versionCode 1. A 403 Forbidden on the first attempt was just a
permissions-propagation issue (the service account's Play Console access
grant hadn't taken effect yet) -- retried clean once access was confirmed.

**Version numbering**: `versionCode` (the hidden integer Play orders
uploads by) and `versionName` (the user-visible label) are independent --
Play never parses `versionName`, so it can read however makes sense for
where the app actually is. Bumped to `versionName "0.1"` / `versionCode 2`
the same day, to honestly reflect "still in internal testing," not a
finished `1.0`. `versionCode` still has to strictly increase on every
upload regardless of what `versionName` says.

**Still manual, not automatable through this plugin**: adding testers to
any track. That's a Play Console UI action (Testing -> [track] -> Testers
tab -> create an email list -> add tester emails -> share the generated
opt-in link) with no equivalent exposed here -- done directly by the user,
not scripted.

## Store listing content, pushed automatically (2026-11-24)

`android/app/src/main/play/` follows Gradle Play Publisher's own directory
convention (`listings/en-US/title.txt`/`shortDescription.txt`/
`fullDescription.txt`, `graphics/icon`/`featureGraphic`/`phoneScreenshots`,
`release-notes/en-US/default.txt`, `contact-email.txt`). `./gradlew.bat
publishReleaseListing` pushes all of it via the same service-account
credentials, gated the same way as the bundle publish (only applies if
`play-service-account.json` exists).

**Real, non-obvious blocker hit on the very first listing push**: `403
Forbidden -- "The default language for your application is not currently
supported."` on the commit step, even though the API's own `edits.details`
read back `defaultLanguage: "en-US"` just fine. This is a genuine Play
Developer API limitation, not a propagation delay (confirmed by forcing a
full `--rerun-tasks` re-run, which reproduced the identical error) -- a
brand-new app's first store-listing language has to be manually saved once
through the Console UI (Main store listing page) before the API can touch
it at all. Once the user did that one manual save, the identical automated
push succeeded immediately. The two phone screenshots
(`graphics/phoneScreenshots/1.jpg`/`2.jpg`) are real captures of the live
app at a phone viewport (the setup/roster screen, a Midnight Baseball hand
in progress) -- not placeholders; Play's screenshot requirement (min 2)
was satisfied honestly rather than with filler images.

## Closed testing (2026-11-24)

Two closed-testing tracks exist in Play Console: **Alpha** (for
individually-added users) and **External Testing** (for a broader tester
community). Two real, non-obvious gotchas hit publishing to them, both
worth remembering for any future track:

1. **A custom track's display name in the Console UI is not always its API
   identifier.** `GET .../tracks` is the source of truth -- it listed
   `production`, `beta`, `alpha` (lowercase -- Play's legacy default closed
   track, which is what the Console UI's "Alpha" track actually maps to)
   `internal`, and `External Testing` (a genuinely custom track, whose API
   name matches its display name exactly, case included). Don't guess from
   what's shown in the UI; query the tracks list.
2. **A non-internal track only accepts `draft`-status releases while the
   app itself is still in Play Console's "draft" app-state** (content
   questionnaires filled in via the API but not yet formally submitted for
   review through the Console) -- `releaseStatus.set(...DRAFT)` in the
   `play { }` block is required for this, commented out by default since
   internal testing doesn't need it. **A draft release never goes live on
   its own** -- the user still has to open Play Console, find the draft
   release on that track, and click Review release -> Start rollout, same
   as a first-time manual upload would require. First successful draft
   publishes: versionCode 3 (alpha), versionCode 4 (External Testing),
   same 2026-11-24 build as internal's versionCode 2.

`app/build.gradle`'s `play { }` block defaults back to `track.set("internal")`
(with `releaseStatus` commented out) after this -- publishing to a closed
track again means temporarily changing both, publishing, then reverting,
the same way this session did it by hand rather than something
parameterized via a Gradle property (not worth the extra indirection for
how rarely this actually needs to happen).

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

## No signing key for a RELEASE build -- still an open, user-owned decision

Same boundary as before, unchanged by the TWA->Capacitor switch: generating
a release signing keystore is this app's permanent upload identity once
ever used, so it's the user's own call to make directly, not something
scripted around. `.gitignore` already blocks `*.keystore`/`*.jks`.

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

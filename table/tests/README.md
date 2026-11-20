# table/tests/

A committed, plain-Node regression suite for `table/js/`'s game-logic layer (`rules-*.js`, `session-*.js`, `ai-*.js`, `table-night.js`). No dependencies, no build step — matching the rest of this project's conventions.

```
node table/tests/run-all.js      # run everything, one aggregate summary
node table/tests/rules-guts.test.js   # run a single file directly
```

## Why this exists

Every regression test written against this codebase so far (going back through this project's own commit history) hand-rolled the same Node `vm`-sandbox boilerplate from scratch in a scratch/temp file, then got thrown away once the bug it was checking was fixed. That worked, but it meant zero of that verification effort was retained — the same kind of bug (a stale status flag leaking across games, a showdown result that names a winner but never states what they won with) kept getting re-discovered and re-fixed independently in different corners of the app.

`harness.js` and `check.js` are that boilerplate, written once. Each `*.test.js` file is a *kept* regression test for a real, previously-reported bug, not a throwaway script — new ones should get added here instead of a scratchpad file whenever a bug fix is worth locking in permanently.

## Why this matters for a possible future mobile port

`rules-*.js`/`session-*.js`/`ai-*.js` are pure JS with no DOM or platform dependency (no `document`, `window.*`, `localStorage`, or anything a native WebView plugin would provide) — that's what lets this whole suite run under plain Node with no browser and no emulator. `layer-boundary.test.js` enforces that property directly: it scans every file in the logic layer and fails if one of them starts touching a forbidden API.

Keeping that boundary intact means a future Capacitor/native port only ever needs device/emulator testing for the native shell and UI layer — never for "does this game's rules work," which is exactly the ratio this project has today. See CLAUDE.md's "mobile app analysis" discussion for the fuller reasoning.

## Adding a new test

1. `const { load } = require("./harness");` to load whichever `table/js/*.js` files the code under test needs, in dependency order (same order their `<script>` tags appear in `table/index.html`).
2. `const { makeChecker } = require("./check");` for `check(desc, cond)`.
3. Export `{ run }` where `run()` returns the failure count, and keep the `if (require.main === module) process.exit(run());` tail so the file is still runnable standalone.
4. `run-all.js` picks up any `*.test.js` file automatically — nothing else to wire up.

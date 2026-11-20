"use strict";

// Enforces, as a committed and repeatable check rather than a one-off
// manual grep, the discipline a mobile port needs to hold: rules-*.js/
// session-*.js/ai-*.js (the game-logic layer) must never touch a DOM or
// platform API directly. That's what lets the whole suite of game-rules
// regression tests run under plain Node with no browser, no emulator,
// and -- looking ahead to a Capacitor/native port -- no dependency on
// Capacitor plugin APIs that only exist inside a real device's WebView.
// Storage/UI/native-platform concerns belong one layer up, in
// table-ui-*.js/table-fx.js/table-night.js/history-store.js, which this
// check deliberately does NOT scan.
//
// Comments are stripped before scanning so a file is only flagged for
// actually USING a forbidden API, not for mentioning one in prose (this
// codebase's own comments reference "the localStorage round-trip" and
// similar phrasing routinely, which isn't a violation).

const fs = require("fs");
const path = require("path");
const { makeChecker } = require("./check");

const JS_DIR = path.join(__dirname, "..", "js");

const LOGIC_LAYER_PREFIXES = ["rules-", "session-", "ai-"];

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function scanFile(filePath) {
  const src = stripComments(fs.readFileSync(filePath, "utf8"));
  const hits = [];
  const checks = [
    { label: "localStorage.*", re: /\blocalStorage\s*\./ },
    { label: "document.*", re: /\bdocument\s*\./ },
    { label: "window.*", re: /\bwindow\s*\./ },
    { label: "Capacitor", re: /\bCapacitor\b/ },
    { label: "navigator.*", re: /\bnavigator\s*\./ },
  ];
  for (const { label, re } of checks) {
    if (re.test(src)) hits.push(label);
  }
  return hits;
}

function run() {
  const { check, summary } = makeChecker();
  const files = fs.readdirSync(JS_DIR).filter((f) => f.endsWith(".js") && LOGIC_LAYER_PREFIXES.some((p) => f.startsWith(p)));
  check(`found logic-layer files to scan (sanity check the directory listing itself didn't come back empty)`, files.length > 30);
  for (const f of files) {
    const hits = scanFile(path.join(JS_DIR, f));
    check(`${f} has no direct DOM/storage/native-platform API calls`, hits.length === 0);
    if (hits.length) console.log(`  -> ${f} touches: ${hits.join(", ")}`);
  }
  return summary("layer-boundary");
}

if (require.main === module) process.exit(run());
module.exports = { run };

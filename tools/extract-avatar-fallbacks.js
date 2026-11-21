#!/usr/bin/env node
"use strict";

// Android roadmap step 3: splits the ~194KB of embedded fallback-avatar SVG
// strings out of table/js/table-people-data.js (520KB total, mostly this)
// into a separate JSON file that avatar.js only fetches lazily, on an
// actual image-load failure -- not up front with every other script.
//
// Why this is safe: avatar.js's primary rendering path is a real
// `<img loading="lazy" src="people-images/<id>.jfif">`; the inline SVG per
// person was only ever a same-page fallback for that <img>'s onerror. Those
// photo files are local static assets bundled with the app, not a network
// fetch that can flake -- in ordinary use the onerror path essentially
// never fires, so in the common case this fallback data now never needs to
// be fetched at all. A generic (non-per-person) flat-color placeholder
// already exists as a second fallback layer (avatar.js's
// renderFallbackSvg when `spec.svg` is absent) and renders instantly either
// way, so there's no broken/blank state at any point -- only a brief
// in-place upgrade from the generic placeholder to the real per-person
// fallback art, in the rare case a photo ever actually fails to load.
//
// Re-run this whenever table-people-data.js's avatar.svg fields are
// hand-edited again (e.g. a persona's fallback art changes) to resync both
// files from the same source of truth.
//
// Usage: node tools/extract-avatar-fallbacks.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const JS_DIR = path.join(__dirname, "..", "table", "js");
const SOURCE_PATH = path.join(JS_DIR, "table-people-data.js");
const OUTPUT_JSON_PATH = path.join(JS_DIR, "avatar-fallback-svgs.json");

function loadTablePeople() {
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SOURCE_PATH, "utf8"), sandbox, { filename: "table-people-data.js" });
  vm.runInContext("var __people = TABLE_PEOPLE;", sandbox);
  return sandbox.__people;
}

function extract() {
  const people = loadTablePeople();
  const fallbackMap = {};
  let extractedCount = 0;
  for (const p of people) {
    if (p.avatar && p.avatar.svg) {
      fallbackMap[p.id] = p.avatar.svg;
      extractedCount++;
    }
  }
  if (extractedCount === 0) {
    console.log("No avatar.svg fields found -- already extracted, or the source shape changed. Nothing written.");
    return { extractedCount: 0 };
  }

  fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(fallbackMap, null, 2), "utf8");

  // Remove each `svg: "...",` field from the SOURCE TEXT (not a
  // regenerated-from-parsed-data rewrite, which would lose every comment
  // and all hand-formatting in the file) -- a per-field regex, matched and
  // verified against the live file's exact shape before this script was
  // written (one match per person, no more, no less).
  let src = fs.readFileSync(SOURCE_PATH, "utf8");
  const svgFieldRe = /\n\s*svg: "(?:[^"\\]|\\.)*",?/g;
  const matchCount = (src.match(svgFieldRe) || []).length;
  if (matchCount !== extractedCount) {
    throw new Error(`Found ${matchCount} svg: fields via regex but extracted ${extractedCount} via the real parser -- refusing to rewrite table-people-data.js until that's reconciled (the regex may need updating to match the current file shape).`);
  }
  src = src.replace(svgFieldRe, "");
  fs.writeFileSync(SOURCE_PATH, src, "utf8");

  const newSize = fs.statSync(SOURCE_PATH).size;
  const jsonSize = fs.statSync(OUTPUT_JSON_PATH).size;
  console.log(`Extracted ${extractedCount} fallback SVGs (${(jsonSize / 1024).toFixed(0)} KB) into avatar-fallback-svgs.json.`);
  console.log(`table-people-data.js is now ${(newSize / 1024).toFixed(0)} KB.`);
  return { extractedCount, jsonSize, newSize };
}

if (require.main === module) extract();
module.exports = { extract };

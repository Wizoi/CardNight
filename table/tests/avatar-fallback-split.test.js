"use strict";

// Android roadmap step 3: table-people-data.js's 30 embedded DiceBear
// fallback SVGs (~194KB of its original ~520KB) were split out into
// table/js/avatar-fallback-svgs.json, fetched by avatar.js only on an
// actual <img> onerror, not loaded synchronously with every other script.
// This guards against the data drifting apart if table-people-data.js is
// hand-edited again (a persona's avatar spec changed) without re-running
// tools/extract-avatar-fallbacks.js.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { makeChecker } = require("./check");

const JS_DIR = path.join(__dirname, "..", "js");

function run() {
  const { check, summary } = makeChecker();

  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(JS_DIR, "table-people-data.js"), "utf8"), sandbox, { filename: "table-people-data.js" });
  vm.runInContext("var __people = TABLE_PEOPLE;", sandbox);
  const people = sandbox.__people;

  check("TABLE_PEOPLE still has all 30 regulars", people.length === 30);
  check(
    "no person's avatar spec carries an embedded svg field anymore (extracted out)",
    people.every((p) => !(p.avatar && p.avatar.svg))
  );
  check(
    "every person still has their other avatar fields intact (not accidentally stripped along with svg)",
    people.every((p) => p.avatar && p.avatar.skinTone && p.avatar.accentColor)
  );

  const fallbackMap = JSON.parse(fs.readFileSync(path.join(JS_DIR, "avatar-fallback-svgs.json"), "utf8"));
  const fallbackIds = Object.keys(fallbackMap);
  check("avatar-fallback-svgs.json has exactly 30 entries", fallbackIds.length === 30);
  check(
    "every TABLE_PEOPLE id has a matching fallback SVG",
    people.every((p) => typeof fallbackMap[p.id] === "string" && fallbackMap[p.id].startsWith("<svg"))
  );
  check(
    "no stray fallback entries for an id TABLE_PEOPLE doesn't have",
    fallbackIds.every((id) => people.some((p) => p.id === id))
  );

  return summary("avatar-fallback-split");
}

if (require.main === module) process.exit(run());
module.exports = { run };

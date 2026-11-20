"use strict";

// Runs every *.test.js in this directory and prints one aggregate
// pass/fail summary. Plain Node, zero dependencies -- matching the rest
// of this project's "no build step, no dependencies" convention, so
// this suite never needs `npm install` to run, in CI or anywhere else.
//
// Usage: node table/tests/run-all.js

const fs = require("fs");
const path = require("path");

const files = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith(".test.js"))
  .sort();

let totalFailures = 0;
const fileResults = [];

for (const f of files) {
  console.log(`\n=== ${f} ===`);
  const mod = require(path.join(__dirname, f));
  const failures = mod.run();
  totalFailures += failures;
  fileResults.push({ file: f, failures });
}

console.log("\n==================== SUMMARY ====================");
for (const { file, failures } of fileResults) {
  console.log(`${failures === 0 ? "PASS" : "FAIL"}  ${file}${failures ? ` (${failures} failure(s))` : ""}`);
}
console.log(totalFailures === 0 ? `\nAll ${files.length} test files passed.` : `\n${totalFailures} total failure(s) across ${files.length} test files.`);

process.exit(totalFailures === 0 ? 0 : 1);

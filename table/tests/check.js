"use strict";

// The one-call pass/fail assertion every regression test in this
// project's history has reimplemented by hand (`let failures = 0; function
// check(desc, cond) { ... }`). Centralized here so run-all.js can
// aggregate across test files instead of each one managing its own
// process.exit code in isolation.

function makeChecker() {
  let failures = 0;
  const results = [];
  function check(desc, cond) {
    const ok = !!cond;
    if (!ok) failures++;
    results.push({ desc, ok });
    console.log(ok ? "ok:" : "FAIL:", desc);
  }
  function summary(label) {
    console.log(failures === 0 ? `\n${label ? label + ": " : ""}ALL PASSED` : `\n${label ? label + ": " : ""}${failures} FAILURE(S)`);
    return failures;
  }
  return { check, summary, results, get failures() { return failures; } };
}

module.exports = { makeChecker };

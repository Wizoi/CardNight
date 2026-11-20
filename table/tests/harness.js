"use strict";

// Shared Node vm-sandbox loader for table/js/*.js.
//
// table/js files are plain browser <script> tags (IIFEs assigned to
// top-level `const`s), not real ES modules or CommonJS -- there's no
// `require`/`module.exports` to hook into directly from Node. Every
// regression test written against this codebase so far has hand-rolled
// the same "create a vm context, read and run a list of files into it in
// order, then pull named globals back out" boilerplate from scratch.
// This file is that boilerplate, written once, so individual test files
// can stay focused on the actual behavior being checked.
//
// Why this keeps the game-rules test suite emulator-free: table/js's
// rules-*.js/session-*.js/ai-*.js files never touch document/window/
// localStorage/native-plugin APIs (see layer-boundary.test.js, which
// enforces that directly) -- they're pure JS, so loading them into a vm
// context here runs the *exact same code* that ships to a browser or a
// future Capacitor WebView, no DOM or emulator required to exercise it.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const JS_DIR = path.join(__dirname, "..", "js");

// A handful of browser globals that some table/js files reference even
// though the logic they gate is never exercised by these tests (e.g. a
// UI helper checking `typeof window !== "undefined"`, or Avatar.render
// being called while building seat markup). Stubbed just enough that a
// file loads without throwing; `extra` lets a specific test override or
// add to these.
function createSandbox(extra) {
  const sandbox = Object.assign(
    {
      console,
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
      Avatar: { render: () => "" },
    },
    extra || {}
  );
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

// Loads each file (relative to table/js/) into the sandbox IN ORDER --
// order matters the same way <script> tag order matters in index.html,
// since later files can reference earlier ones as plain globals.
function loadFiles(sandbox, files) {
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(JS_DIR, f), "utf8"), sandbox, { filename: f });
  }
}

// Pulls a set of top-level globals back out of the sandbox as a plain
// object, e.g. exportsFrom(sandbox, ["HandEvaluator", "Deck"]).
function exportsFrom(sandbox, names) {
  vm.runInContext(`var __exports = { ${names.join(", ")} };`, sandbox);
  return sandbox.__exports;
}

// The one-call convenience most tests actually want: load this list of
// files, then hand back these named globals.
function load(files, names, extraSandbox) {
  const sandbox = createSandbox(extraSandbox);
  loadFiles(sandbox, files);
  return exportsFrom(sandbox, names);
}

module.exports = { createSandbox, loadFiles, exportsFrom, load, JS_DIR };

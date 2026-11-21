#!/usr/bin/env node
"use strict";

// Generates (or regenerates) android/ -- the Trusted Web Activity wrapper
// project for the Android roadmap -- by driving Bubblewrap's programmatic
// API directly (@bubblewrap/core's TwaManifest/TwaGenerator), not the
// interactive `bubblewrap init` CLI wizard. The wizard prompts to confirm
// values and, critically, asks whether to generate a brand-new signing
// keystore -- a one-way decision for the app's upload identity that
// deliberately stays out of any automated script. This tool only ever
// generates the regenerable project files; it never touches signing.
//
// Usage: npx @bubblewrap/core >/dev/null 2>&1; node tools/generate-twa-project.js
// (the npx line just ensures @bubblewrap/core is resolvable; it's not a
// project dependency since this is a one-off tool, not runtime code)

const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");
const TARGET_DIR = path.join(REPO_ROOT, "android");
const MANIFEST_URL = "https://wizoi.github.io/CardNight/table/manifest.webmanifest";
const PACKAGE_ID = "com.luckofthedeal.app";

function resolveBubblewrapCore() {
  try {
    return require("@bubblewrap/core");
  } catch (e) {
    // Fall back to npx's cache -- @bubblewrap/core has no reason to be a
    // committed project dependency (it's a one-off generator, not runtime
    // code), so `npm install` won't have put it anywhere local by default.
    const { execSync } = require("child_process");
    const npxCacheRoot = execSync("npm config get cache", { encoding: "utf8" }).trim();
    throw new Error(
      `@bubblewrap/core isn't resolvable directly. Run 'npx @bubblewrap/core --version' once first ` +
        `(installs it into npm's npx cache under ${npxCacheRoot}/_npx/<hash>/node_modules/@bubblewrap/core), ` +
        `then re-run this script with that path added via NODE_PATH, e.g.:\n` +
        `  NODE_PATH="<that path>/.." node tools/generate-twa-project.js\n` +
        `Original error: ${e.message}`
    );
  }
}

async function main() {
  const { TwaManifest, TwaGenerator, ConsoleLog } = resolveBubblewrapCore();

  const twaManifest = await TwaManifest.fromWebManifest(MANIFEST_URL);
  twaManifest.packageId = PACKAGE_ID;
  // Deliberately left pointing at a key that does not exist -- see
  // android/README.md. Nothing in this script creates it.
  twaManifest.signingKey = { path: "./android.keystore", alias: "android" };
  twaManifest.appVersionCode = 1;
  twaManifest.appVersionName = "1.0.0";

  const validationError = twaManifest.validate();
  if (validationError) throw new Error(`twaManifest.validate() failed: ${validationError}`);

  const generator = new TwaGenerator();
  const log = new ConsoleLog("bubblewrap");
  await generator.createTwaProject(TARGET_DIR, twaManifest, log, (progress, total) => {
    console.log(`  [${progress}/${total}] generating project files...`);
  });
  await twaManifest.saveToFile(path.join(TARGET_DIR, "twa-manifest.json"));

  console.log(`\nGenerated/updated ${TARGET_DIR}`);
  console.log("No signing key was created or touched -- see android/README.md for why, and what's still open.");
}

main().catch((e) => {
  console.error("FAILED:", e.message || e);
  process.exit(1);
});

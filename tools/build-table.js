#!/usr/bin/env node
"use strict";

// Build step for the table/ app (Android roadmap step 2): concatenates its
// ~79 separate <script src> files -- plus the cross-directory
// ../app/games-data.js dependency -- into one bundle.js, and writes a
// self-contained table/dist/ directory that references it instead of 79
// individual <script> tags.
//
// Deliberately CONCATENATION ONLY, no comment-stripping/minification: a
// hand-rolled stripper risks exactly the "semantic transform" the roadmap
// explicitly said to avoid -- this codebase's UI files lean heavily on
// template literals and regex literals, which makes safe comment-removal a
// real parser problem, not a regex one. Real minification, if ever wanted,
// should come from a proper tool (esbuild/terser) added deliberately, not a
// risky regex pass here. Concatenation alone is still the real win for
// mobile: cutting ~80 separate HTTP requests to 1 matters far more than the
// comment bytes do, since gzip (which every real host, including GitHub
// Pages, applies automatically) already compresses this codebase's large,
// repetitive prose comments far better than their raw byte count suggests.
//
// This script never touches table/index.html or table/js/*.js -- the
// normal dev workflow (open table/index.html directly, or serve it
// unbundled) is completely unaffected. table/dist/ is a separate,
// generated, git-ignored output meant for the eventual Android wrap.
//
// Usage: node tools/build-table.js

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");
const TABLE_DIR = path.join(REPO_ROOT, "table");
const DIST_DIR = path.join(TABLE_DIR, "dist");

function extractScriptSrcs(html) {
  const re = /<script\s+src="([^"]+)"\s*><\/script>/g;
  const srcs = [];
  let m;
  while ((m = re.exec(html))) srcs.push(m[1]);
  return srcs;
}

// Every src is written relative to table/index.html's own location --
// including the one cross-directory dependency, ../app/games-data.js.
function resolveSrc(src) {
  const withoutQuery = src.split("?")[0];
  return path.join(TABLE_DIR, withoutQuery);
}

function copyFile(name) {
  fs.copyFileSync(path.join(TABLE_DIR, name), path.join(DIST_DIR, name));
}

function copyDirRecursive(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) copyDirRecursive(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function build() {
  const htmlPath = path.join(TABLE_DIR, "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");
  const srcs = extractScriptSrcs(html);
  if (srcs.length < 30) {
    throw new Error(`Only found ${srcs.length} <script src> tags in table/index.html -- expected ~79. Check the regex against the current file.`);
  }

  const parts = srcs.map((src) => {
    const relPath = src.split("?")[0];
    const filePath = resolveSrc(src);
    const content = fs.readFileSync(filePath, "utf8");
    return `// ==== ${relPath} ====\n${content}`;
  });
  const bundle = parts.join("\n\n");

  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIST_DIR, "bundle.js"), bundle, "utf8");

  // dist/index.html: every <script src="..."> tag collapses into one
  // reference to bundle.js, inserted right where the LAST of them used to
  // be -- i.e. directly before the one remaining inline <script> block
  // (the service-worker registration), so relative execution order versus
  // the source file is preserved exactly, not just "somewhere before
  // </body>". Everything else (styles, manifest, icon, that inline block)
  // is untouched.
  let distHtml = html.replace(/[ \t]*<script\s+src="[^"]+"\s*><\/script>\r?\n/g, "");
  distHtml = distHtml.replace(/([ \t]*)<script>/, '$1<script src="bundle.js"></script>\n$1<script>');
  fs.writeFileSync(path.join(DIST_DIR, "index.html"), distHtml, "utf8");

  copyFile("style.css");
  copyFile("manifest.webmanifest");
  copyFile("icon.svg");
  copyFile("sw.js");
  copyDirRecursive(path.join(TABLE_DIR, "people-images"), path.join(DIST_DIR, "people-images"));

  const bundleKb = (Buffer.byteLength(bundle, "utf8") / 1024).toFixed(0);
  console.log(`Built table/dist/ from ${srcs.length} source files -> bundle.js (${bundleKb} KB).`);
  return { bundlePath: path.join(DIST_DIR, "bundle.js"), srcCount: srcs.length, bundleBytes: Buffer.byteLength(bundle, "utf8") };
}

if (require.main === module) build();
module.exports = { build, extractScriptSrcs, resolveSrc };

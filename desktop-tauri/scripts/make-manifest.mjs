#!/usr/bin/env node
/**
 * Build the `latest.json` manifest consumed by the Tauri updater.
 *
 * Reads the version + bundle paths from the local build output, embeds the
 * signature file (`*.app.tar.gz.sig`) inline, and writes a single JSON file
 * ready to upload alongside the release assets.
 *
 * Usage:
 *   node scripts/make-manifest.mjs \
 *     --version 0.1.2 \
 *     --notes "Release notes here" \
 *     --download-url-darwin-aarch64 https://github.com/Shardtown/shardtown/releases/download/v0.1.2/Shardtown_0.1.2_aarch64.app.tar.gz \
 *     --sig-path src-tauri/target/release/bundle/macos/Shardtown.app.tar.gz.sig \
 *     --out latest.json
 *
 * The `endpoints` field in `tauri.conf.json` must point at the URL where you
 * upload this JSON (we use GitHub Releases' `/latest/download/latest.json`).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { argv } from "node:process";

function arg(name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
}

const version = arg("version");
const notes = arg("notes") || "";
const sigPath = arg("sig-path");
const out = arg("out") || "latest.json";

// Per-platform download URLs. Add more as you ship more targets.
const platforms = {
  "darwin-aarch64": arg("download-url-darwin-aarch64"),
  "darwin-x86_64": arg("download-url-darwin-x86_64"),
};

if (!version || !sigPath) {
  console.error("Missing --version or --sig-path");
  process.exit(1);
}

const signature = readFileSync(sigPath, "utf8").trim();

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {},
};

for (const [target, url] of Object.entries(platforms)) {
  if (!url) continue;
  manifest.platforms[target] = { signature, url };
}

writeFileSync(out, JSON.stringify(manifest, null, 2));
console.log(`Wrote ${out} (version ${version}, ${Object.keys(manifest.platforms).length} platform(s))`);

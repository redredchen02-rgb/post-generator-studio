#!/usr/bin/env node
// Self-heal the better-sqlite3 native binding before the app or tooling boots.
//
// better-sqlite3 is compiled against V8's ABI (NODE_MODULE_VERSION), so it
// breaks every time the *running* Node major changes — switching nvm versions,
// or a tool that ignores .nvmrc and uses a newer system Node. The symptom is a
// hard crash: "compiled against a different Node.js version using
// NODE_MODULE_VERSION X ... requires NODE_MODULE_VERSION Y". The old fix was a
// manual `pnpm rebuild better-sqlite3`. This guard does it automatically.
//
// Fast path: when the module already loads, this exits in a few ms — a no-op.
// It only rebuilds on a genuine ABI mismatch, and never masks other failures.
//
// IMPORTANT: every load probe runs in a FRESH child process. Re-dlopen-ing a
// just-rebuilt addon inside a process that already attempted (and failed) the
// load segfaults on Linux/CI (NODE_MODULE_VERSION 127 vs 147 → "install: Done"
// → SIGSEGV exit 139). Isolating each probe in its own process avoids that.
//
// Usage: node scripts/ensure-native.mjs

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PKG = "better-sqlite3";
const SELF = process.argv[1];

// --probe: child mode. Force the real native load and report via exit code:
// 0 = loads cleanly, 1 = failed (reason written to stderr).
if (process.argv.includes("--probe")) {
  try {
    const require = createRequire(import.meta.url);
    // require() alone does NOT dlopen the addon (better-sqlite3 v11 lazy-loads);
    // opening an in-memory DB is what forces the real native load.
    const Database = require(PKG);
    new Database(":memory:").close();
    process.exit(0);
  } catch (err) {
    process.stderr.write(String(err?.message ?? err ?? ""));
    process.exit(1);
  }
}

// Fail fast (with an actionable message) when launched under the wrong Node
// major. pnpm already pins the Node via .npmrc `use-node-version`, so this only
// fires when something bypasses pnpm — turning an opaque ABI crash + 500 into a
// clear "switch your Node" message. The pinned version is read from .nvmrc so
// there's a single source of truth.
let pinned = "";
try {
  pinned = readFileSync(new URL("../.nvmrc", import.meta.url), "utf8").trim();
} catch {
  /* no .nvmrc — skip the version guard, keep the ABI self-heal below */
}
if (pinned) {
  const pinnedMajor = pinned.split(".")[0];
  const runningMajor = process.versions.node.split(".")[0];
  if (runningMajor !== pinnedMajor) {
    console.error(`  ✗ This project needs Node ${pinnedMajor}.x (pinned: ${pinned}), but you're on ${process.version}.`);
    console.error(`    Launch via pnpm — it auto-uses the pinned Node: \`pnpm dev\` / \`pnpm start\`.`);
    console.error(`    If you must bypass pnpm, switch Node first (e.g. \`nvm use\`, which reads .nvmrc).`);
    process.exit(1);
  }
}
console.log(`  ▶ Node ${process.version}`);

// Probe in a fresh process using the SAME Node that's running this guard
// (process.execPath), so the result reflects the Node the app will actually use.
function probe() {
  try {
    execFileSync(process.execPath, [SELF, "--probe"], { stdio: ["ignore", "ignore", "pipe"] });
    return { ok: true, output: "" };
  } catch (err) {
    return { ok: false, output: String(err?.stderr ?? err?.message ?? "") };
  }
}

const first = probe();
if (first.ok) process.exit(0);

const isAbiMismatch = /NODE_MODULE_VERSION/.test(first.output) || /ERR_DLOPEN_FAILED/.test(first.output);
if (!isAbiMismatch) {
  // A different problem (missing dependency, corrupt install). Surface it as-is
  // instead of triggering a rebuild that won't help.
  console.error(`  ✗ ${PKG} failed to load for an unexpected reason:\n${first.output}`);
  process.exit(1);
}

console.log(`  ⚠ ${PKG} was built for a different Node ABI — rebuilding for ${process.version}...`);
try {
  execFileSync("pnpm", ["rebuild", PKG], { stdio: "inherit" });
} catch {
  console.error(`  ✗ rebuild failed. Run manually: pnpm rebuild ${PKG}`);
  process.exit(1);
}

const after = probe();
if (!after.ok) {
  console.error(`  ✗ ${PKG} still failing after rebuild:\n${after.output}`);
  process.exit(1);
}
console.log(`  ✓ ${PKG} rebuilt for ${process.version}`);

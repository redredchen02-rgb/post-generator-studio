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
// Usage: node scripts/ensure-native.mjs

import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
const PKG = "better-sqlite3";

function loadError() {
  try {
    // better-sqlite3 lazy-loads its native addon: require() alone does NOT
    // dlopen the binary, so it would pass even with a mismatched ABI. Opening an
    // in-memory database forces the real native load — that's what surfaces the
    // ABI/dlopen failure we want to heal.
    const Database = require(PKG);
    new Database(":memory:").close();
    return null;
  } catch (err) {
    return err;
  }
}

const err = loadError();
if (!err) process.exit(0);

const message = String(err?.message ?? "");
const isAbiMismatch = /NODE_MODULE_VERSION/.test(message) || err?.code === "ERR_DLOPEN_FAILED";

if (!isAbiMismatch) {
  // A different problem (missing dependency, corrupt install). Surface it as-is
  // instead of triggering a rebuild that won't help.
  console.error(`  ✗ ${PKG} failed to load for an unexpected reason:\n${message}`);
  process.exit(1);
}

console.log(`  ⚠ ${PKG} was built for a different Node ABI — rebuilding for ${process.version}...`);
try {
  execSync(`pnpm rebuild ${PKG}`, { stdio: "inherit" });
} catch {
  console.error(`  ✗ rebuild failed. Run manually: pnpm rebuild ${PKG}`);
  process.exit(1);
}

const stillBroken = loadError();
if (stillBroken) {
  console.error(`  ✗ ${PKG} still failing after rebuild:\n${String(stillBroken?.message ?? "")}`);
  process.exit(1);
}
console.log(`  ✓ ${PKG} rebuilt for ${process.version}`);

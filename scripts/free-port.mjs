#!/usr/bin/env node
// Reclaim a TCP port and kill stray Next.js processes for THIS project before
// (re)starting the app. The previous launch flow fell back to a different port
// when 3000 was busy, which silently stacked duplicate servers and led to a
// runaway dev server. Reclaiming the port — instead of dodging it — is the fix.
//
// Usage: node scripts/free-port.mjs [port]   (default port: 3000)

import { execSync } from "node:child_process";

const port = process.argv[2] ?? "3000";
const projectDir = process.cwd();

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function kill(pid, label) {
  if (!pid) return;
  try {
    process.kill(Number(pid), "SIGTERM");
    console.log(`  ✓ stopped ${label} (pid ${pid})`);
  } catch {
    /* already gone */
  }
}

// 1. Anything listening on the target port (the authoritative signal).
const portPids = new Set(
  sh(`lsof -ti tcp:${port} -sTCP:LISTEN`).split("\n").filter(Boolean),
);
for (const pid of portPids) kill(pid, `process on :${port}`);

// 2. Stray Next.js dev/start processes rooted in THIS project directory.
//    Scoped to the project path so we never touch unrelated apps.
const psLines = sh("ps -eo pid=,command=").split("\n").filter(Boolean);
for (const line of psLines) {
  const match = line.match(/^\s*(\d+)\s+(.*)$/);
  if (!match) continue;
  const [, pid, command] = match;
  if (portPids.has(pid)) continue; // already handled
  const isNext = /next(-server| dev| start)|\bnext\b.*\b(dev|start)\b/.test(command);
  const inProject = command.includes(projectDir);
  if (isNext && inProject) kill(pid, "stray next process");
}

// Give the OS a moment to release the socket before the caller rebinds it.
sh("sleep 1");
console.log(`  ✓ port ${port} is free`);

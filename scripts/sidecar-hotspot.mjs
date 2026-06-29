#!/usr/bin/env node
// Manage the hotspot-sdk Python sidecar (copywriting scoring + hotspot ranking +
// NSFW media analysis). Mirrors scripts/sidecar.mjs (omniwm) exactly.
//
//   node scripts/sidecar-hotspot.mjs --setup   one-time: venv + install vendored wheel (heavy)
//   node scripts/sidecar-hotspot.mjs           reclaim :8770, then run run.py on loopback
//
// Split on purpose: setup pulls heavy wheels (nudenet/opencv/scenedetect/fastapi)
// and can take minutes — never run on the hot `pnpm dev` path. Neither `pnpm dev`
// nor `pnpm start` auto-start it; run `pnpm sidecar:hotspot` in a separate terminal.
// The in-app health banner surfaces when it's down.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const SIDECAR = path.resolve(process.cwd(), "hotspot-sidecar");
const VENV = path.join(SIDECAR, ".venv");
const VENV_PY = path.join(VENV, "bin", "python");
const PORT = process.env.HOTSPOT_SIDECAR_PORT || "8770";

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function findPython3() {
  for (const bin of ["python3", "python"]) {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (r.status === 0) {
      const m = /Python (\d+)\.(\d+)/.exec((r.stdout || r.stderr || "").trim());
      // hotspot-sdk requires Python >= 3.11.
      if (m && (Number(m[1]) > 3 || (Number(m[1]) === 3 && Number(m[2]) >= 11))) return bin;
    }
  }
  return null;
}

function setup() {
  const py = findPython3();
  if (!py) die("需要 Python ≥ 3.11。请先安装（macOS: brew install python）。");
  console.log("→ creating venv + installing hotspot sidecar deps (heavy, one-time)…");
  execFileSync(py, ["-m", "venv", VENV], { stdio: "inherit" });
  execFileSync(VENV_PY, ["-m", "pip", "install", "-q", "--upgrade", "pip"], { stdio: "inherit" });
  execFileSync(VENV_PY, ["-m", "pip", "install", "-r", path.join(SIDECAR, "requirements.txt")], {
    cwd: SIDECAR,
    stdio: "inherit",
  });
  console.log("✓ hotspot sidecar ready — run `pnpm sidecar:hotspot` to start it.");
}

function run() {
  if (!existsSync(VENV_PY)) die("hotspot sidecar 未安装。先运行 `pnpm sidecar:hotspot:setup`。");
  // Reclaim a stale sidecar on :8770 (same philosophy as free-port for :3000).
  try {
    execFileSync("node", [path.join("scripts", "free-port.mjs"), PORT], { stdio: "inherit" });
  } catch {
    /* best-effort */
  }
  console.log(`→ starting hotspot sidecar on 127.0.0.1:${PORT} …`);
  execFileSync(VENV_PY, ["run.py"], {
    cwd: SIDECAR,
    stdio: "inherit",
    env: { ...process.env, HOTSPOT_PORT: String(PORT) },
  });
}

if (process.argv.includes("--setup")) setup();
else run();

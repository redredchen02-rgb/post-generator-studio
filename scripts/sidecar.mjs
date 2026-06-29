#!/usr/bin/env node
// Manage the omniwm Python watermark sidecar.
//
//   node scripts/sidecar.mjs --setup   one-time: create venv + install (heavy)
//   node scripts/sidecar.mjs           reclaim :8765, then run uvicorn on loopback
//
// Split on purpose: setup pulls heavy wheels (opencv/numpy/fastapi) and can take
// minutes — we never run it on the hot `pnpm dev` path (that "hang" was the same
// class of bug as the blocking startup lock). `pnpm dev` does NOT auto-start the
// sidecar; run `pnpm sidecar` in a second terminal. The in-app health banner
// surfaces when it's down.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const SIDECAR = path.resolve(process.cwd(), "sidecar");
const VENV = path.join(SIDECAR, ".venv");
const VENV_PY = path.join(VENV, "bin", "python");
const PORT = process.env.OMNIWM_SIDECAR_PORT || "8765";

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function findPython3() {
  for (const bin of ["python3", "python"]) {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (r.status === 0) {
      const m = /Python (\d+)\.(\d+)/.exec((r.stdout || r.stderr || "").trim());
      if (m && (Number(m[1]) > 3 || (Number(m[1]) === 3 && Number(m[2]) >= 10))) return bin;
    }
  }
  return null;
}

function setup() {
  const py = findPython3();
  if (!py) die("需要 Python ≥ 3.10。请先安装（macOS: brew install python）。");
  console.log("→ creating venv + installing sidecar deps (heavy, one-time)…");
  execFileSync(py, ["-m", "venv", VENV], { stdio: "inherit" });
  execFileSync(VENV_PY, ["-m", "pip", "install", "-q", "--upgrade", "pip"], { stdio: "inherit" });
  execFileSync(VENV_PY, ["-m", "pip", "install", "-r", path.join(SIDECAR, "requirements.txt")], {
    cwd: SIDECAR,
    stdio: "inherit",
  });
  console.log("✓ sidecar ready — run `pnpm sidecar` to start it.");
}

function run() {
  if (!existsSync(VENV_PY)) die("sidecar 未安装。先运行 `pnpm sidecar:setup`。");
  // Reclaim a stale sidecar on :8765 (same philosophy as free-port for :3000).
  try {
    execFileSync("node", [path.join("scripts", "free-port.mjs"), PORT], { stdio: "inherit" });
  } catch {
    /* best-effort */
  }
  console.log(`→ starting omniwm sidecar on 127.0.0.1:${PORT} …`);
  execFileSync(
    VENV_PY,
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(PORT)],
    { cwd: SIDECAR, stdio: "inherit" },
  );
}

if (process.argv.includes("--setup")) setup();
else run();

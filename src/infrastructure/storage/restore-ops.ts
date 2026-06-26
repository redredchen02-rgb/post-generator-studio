import fs from "node:fs";
import path from "node:path";
import { getBackupsDir, getDatabasePath, getSecretsDir } from "@/infrastructure/config/paths";
import { logger } from "@/infrastructure/logging/logger";

/**
 * File-level primitives for the restore swap and its crash recovery.
 *
 * These live in the infrastructure layer (pure fs/path ops) so `db.ts` can call
 * crash recovery at boot without importing the application-layer backup-service
 * (which would invert the layer dependency). The application orchestrator
 * (`backup-service.ts`) reuses `applyBundleToLive` for both the restore swap and
 * its rollback, keeping the atomic-swap logic in exactly one place.
 */

const MARKER_NAME = ".restore-in-progress";

function markerPath(): string {
  return path.join(getBackupsDir(), MARKER_NAME);
}

type RestoreMarker = { selfBackupId: string };

/** Record that a restore is about to overwrite live files, naming the rollback source. */
export function writeRestoreMarker(selfBackupId: string): void {
  fs.writeFileSync(markerPath(), JSON.stringify({ selfBackupId }), { mode: 0o600 });
}

/** Read the interrupted-restore marker, or null when no restore is mid-flight. */
export function readRestoreMarker(): RestoreMarker | null {
  const p = markerPath();
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as Partial<RestoreMarker>;
    if (raw.selfBackupId && typeof raw.selfBackupId === "string") {
      return { selfBackupId: raw.selfBackupId };
    }
  } catch {
    // Malformed marker — treat as absent; clearRestoreMarker will remove it.
  }
  return null;
}

export function clearRestoreMarker(): void {
  const p = markerPath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function unlinkSidecars(dbPath: string): void {
  for (const suffix of ["-wal", "-shm"]) {
    const f = dbPath + suffix;
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch {
      // best-effort
    }
  }
}

function copyDirFiles(srcDir: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true, mode: 0o700 });
  for (const entry of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, entry);
    if (!fs.statSync(src).isFile()) continue;
    const dest = path.join(destDir, entry);
    fs.copyFileSync(src, dest);
    fs.chmodSync(dest, 0o600);
  }
}

/**
 * Replace the live DB (and secrets, when the bundle carries them) with the
 * contents of a backup bundle directory. Both swaps are atomic via same-filesystem
 * rename so a crash mid-swap never leaves a truncated live file:
 *   - DB: copy bundle.db → live.db.restore-tmp (same dir), then rename over live.db.
 *   - Secrets: stage into secrets.restore-new, rename secrets/ aside, rename new in.
 * The caller is responsible for having closed the live DB connection first.
 */
export function applyBundleToLive(bundleDir: string): void {
  const dbPath = getDatabasePath();
  const bundleDb = path.join(bundleDir, "post-generator.db");
  if (!fs.existsSync(bundleDb)) {
    throw new Error(`Backup bundle is missing its database file: ${bundleDb}`);
  }

  // --- Atomic DB swap ---
  const tmpDb = dbPath + ".restore-tmp";
  if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
  fs.copyFileSync(bundleDb, tmpDb);
  fs.chmodSync(tmpDb, 0o600);
  // Drop the live WAL/SHM before the rename so no stale journal applies to the
  // freshly restored file.
  unlinkSidecars(dbPath);
  fs.renameSync(tmpDb, dbPath);

  // --- Atomic secrets swap (only when the bundle includes them) ---
  const bundleSecrets = path.join(bundleDir, "secrets");
  if (fs.existsSync(bundleSecrets)) {
    const secretsDir = getSecretsDir();
    const stagedNew = secretsDir + ".restore-new";
    const asideOld = secretsDir + ".restore-old";
    if (fs.existsSync(stagedNew)) fs.rmSync(stagedNew, { recursive: true, force: true });
    if (fs.existsSync(asideOld)) fs.rmSync(asideOld, { recursive: true, force: true });
    copyDirFiles(bundleSecrets, stagedNew);
    if (fs.existsSync(secretsDir)) fs.renameSync(secretsDir, asideOld);
    fs.renameSync(stagedNew, secretsDir);
    if (fs.existsSync(asideOld)) fs.rmSync(asideOld, { recursive: true, force: true });
  }
}

/**
 * Boot-time crash recovery. If a restore was interrupted (process killed mid-swap),
 * an on-disk marker names the self-backup taken before the swap began. Re-applying
 * that self-backup returns live files to their pre-restore state. Safe and idempotent:
 * a no-op when no marker is present. Must run before the DB is opened.
 */
export function recoverInterruptedRestore(): void {
  const marker = readRestoreMarker();
  if (!marker) return;
  const selfBackupDir = path.join(getBackupsDir(), marker.selfBackupId);
  try {
    if (!fs.existsSync(path.join(selfBackupDir, "post-generator.db"))) {
      logger.error("Interrupted restore: self-backup missing — cannot auto-recover", {
        selfBackupId: marker.selfBackupId,
      });
      // Clear the marker so the app can still boot; the live DB is whatever the
      // interrupted swap left and the user retains the named self-backup on disk.
      clearRestoreMarker();
      return;
    }
    applyBundleToLive(selfBackupDir);
    clearRestoreMarker();
    logger.info("Recovered from interrupted restore via self-backup", {
      selfBackupId: marker.selfBackupId,
    });
  } catch (error) {
    logger.error("Interrupted-restore recovery failed — manual recovery may be required", {
      selfBackupId: marker.selfBackupId,
      selfBackupDir,
      error: String(error),
    });
    throw error;
  }
}

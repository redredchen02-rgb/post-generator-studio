import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { getBackupsDir, getSecretsDir } from "@/infrastructure/config/paths";
import { getDb, closeDb, setRestoreInProgress } from "@/infrastructure/storage/db";
import { CURRENT_SCHEMA_VERSION } from "@/infrastructure/storage/migrations";
import {
  applyBundleToLive,
  writeRestoreMarker,
  clearRestoreMarker,
} from "@/infrastructure/storage/restore-ops";
import { cacheInvalidate } from "@/infrastructure/security/secrets";
import { logger } from "@/infrastructure/logging/logger";

export type BackupMeta = {
  id: string;
  createdAt: string;
  schemaVer: number;
  fileSizeBytes: number;
  includesSecrets: boolean;
};

const DB_FILE = "post-generator.db";
const META_FILE = "meta.json";

function ensureDir(dir: string, mode = 0o700): void {
  fs.mkdirSync(dir, { recursive: true, mode });
}

/**
 * Create a consistent backup bundle (DB + optional secrets + meta) using
 * better-sqlite3 `.backup()` for a WAL-safe snapshot. The bundle is built in a
 * temp dir and atomically renamed into place; `meta.json` is written last and
 * acts as the completion marker (listBackups ignores dirs without a valid one).
 */
export async function createBackup(): Promise<BackupMeta> {
  const backupsDir = getBackupsDir();
  ensureDir(backupsDir, 0o700);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  // Random suffix guarantees a unique id even for two backups in the same ms
  // (e.g. a self-backup taken during restore), avoiding a rename collision.
  const backupId = `backup-${timestamp}-${crypto.randomBytes(3).toString("hex")}`;
  const tempDir = path.join(backupsDir, `${backupId}.tmp`);
  const finalDir = path.join(backupsDir, backupId);

  try {
    ensureDir(tempDir, 0o700);

    // 1. WAL-safe DB snapshot via better-sqlite3 .backup() (returns a Promise).
    const db = await getDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sqlite = (db as any).$client as Database.Database;
    const targetDbPath = path.join(tempDir, DB_FILE);
    await sqlite.backup(targetDbPath);
    fs.chmodSync(targetDbPath, 0o600);

    // 2. Secrets — copy the whole secrets dir (API keys live here, not in the DB).
    const secretsDir = getSecretsDir();
    let includesSecrets = false;
    if (fs.existsSync(secretsDir)) {
      const secretsTarget = path.join(tempDir, "secrets");
      fs.mkdirSync(secretsTarget, { mode: 0o700 });
      const entries = fs.readdirSync(secretsDir).filter((e) => {
        const p = path.join(secretsDir, e);
        return fs.existsSync(p) && fs.statSync(p).isFile();
      });
      for (const entry of entries) {
        const dest = path.join(secretsTarget, entry);
        fs.copyFileSync(path.join(secretsDir, entry), dest);
        fs.chmodSync(dest, 0o600);
      }
      includesSecrets = entries.length > 0;
    }

    // 3. meta.json — completion marker, written last.
    const meta: BackupMeta = {
      id: backupId,
      createdAt: new Date().toISOString(),
      schemaVer: CURRENT_SCHEMA_VERSION,
      fileSizeBytes: fs.statSync(targetDbPath).size,
      includesSecrets,
    };
    const metaPath = path.join(tempDir, META_FILE);
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
    fs.chmodSync(metaPath, 0o600);

    // 4. Atomic publish.
    fs.renameSync(tempDir, finalDir);

    logger.info("Backup created", {
      backupId,
      fileSizeBytes: meta.fileSizeBytes,
      includesSecrets,
    });
    return meta;
  } catch (error) {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    logger.error("Backup creation failed", { error: String(error) });
    throw error;
  }
}

function loadMeta(backupDir: string): BackupMeta | null {
  const metaPath = path.join(backupDir, META_FILE);
  if (!fs.existsSync(metaPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as Partial<BackupMeta>;
    if (raw.id && raw.createdAt && typeof raw.schemaVer === "number") {
      return raw as BackupMeta;
    }
  } catch {
    // Invalid JSON → treat as no meta.
  }
  return null;
}

/** List backups newest-first; only dirs with a valid completion marker. */
export function listBackups(): BackupMeta[] {
  const backupsDir = getBackupsDir();
  if (!fs.existsSync(backupsDir)) return [];
  const backups: BackupMeta[] = [];
  for (const entry of fs.readdirSync(backupsDir)) {
    const dirPath = path.join(backupsDir, entry);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    const meta = loadMeta(dirPath);
    if (meta) backups.push(meta);
  }
  return backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Resolve a backup id to an absolute dir, rejecting path traversal and missing bundles. */
function resolveBackupPath(id: string): string {
  const backupsDir = getBackupsDir();
  const resolved = path.resolve(path.join(backupsDir, id));
  const backupsAbs = path.resolve(backupsDir);
  if (resolved !== backupsAbs && !resolved.startsWith(backupsAbs + path.sep)) {
    throw new Error("Invalid backup ID");
  }
  if (!fs.existsSync(resolved)) {
    throw new Error("Backup not found");
  }
  return resolved;
}

/** Validate a bundle DB with PRAGMA checks, closing the inspection connection cleanly. */
function validateBackupDb(dbPath: string): void {
  const db = new Database(dbPath, { readonly: false });
  try {
    const integrity = db.pragma("integrity_check", { simple: true }) as string;
    if (integrity !== "ok") {
      throw new Error(`Backup DB integrity check failed: ${integrity}`);
    }
    const fkViolations = db.pragma("foreign_key_check") as unknown[];
    if (Array.isArray(fkViolations) && fkViolations.length > 0) {
      throw new Error(`Backup DB has ${fkViolations.length} foreign key violation(s)`);
    }
  } finally {
    db.close();
    // Remove any -wal/-shm the inspection connection created next to the bundle
    // so we never copy a bundle with a dirty journal into place.
    for (const suffix of ["-wal", "-shm"]) {
      const sidecar = dbPath + suffix;
      try {
        if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
      } catch {
        // best-effort
      }
    }
  }
}

/**
 * Restore the database (and secrets, when the bundle has them) from a backup.
 *
 * Ordering is load-bearing: the self-backup runs BEFORE the restore guard is set,
 * because createBackup() needs a live connection — setting the guard first would
 * deadlock the safety net on its own getDb(). Sequence:
 *   validate → self-backup → marker → guard → closeDb → atomic swap → invalidate caches → clear marker
 * On any failure after the self-backup, live files are rolled back from it.
 */
export async function restoreBackup(id: string): Promise<void> {
  // 1. Resolve + validate the target bundle (no live state touched yet).
  const backupDir = resolveBackupPath(id);
  const meta = loadMeta(backupDir);
  if (!meta) throw new Error("Backup metadata not found or invalid");
  if (meta.schemaVer > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Backup schema version ${meta.schemaVer} is newer than this app (${CURRENT_SCHEMA_VERSION}); cannot restore`,
    );
  }
  const bundleDbPath = path.join(backupDir, DB_FILE);
  if (!fs.existsSync(bundleDbPath)) throw new Error("Backup DB file not found");
  validateBackupDb(bundleDbPath);

  // 2. Self-backup BEFORE the guard — the live DB is still consistent here.
  const selfBackup = await createBackup();
  const selfBackupDir = path.join(getBackupsDir(), selfBackup.id);

  // 3. Mark on disk (crash recovery) then gate new connections.
  writeRestoreMarker(selfBackup.id);
  setRestoreInProgress(true);
  try {
    // 4. Close the live connection and atomically swap in the bundle's files.
    closeDb();
    applyBundleToLive(backupDir);
    // 5. Drop the decrypted-secret cache so the next read picks up restored files.
    cacheInvalidate();
    clearRestoreMarker();
    logger.info("Restore completed", { id, includesSecrets: meta.includesSecrets });
  } catch (error) {
    // Roll back live files from the self-backup taken in step 2.
    try {
      applyBundleToLive(selfBackupDir);
      cacheInvalidate();
      clearRestoreMarker();
      logger.error("Restore failed — rolled back from self-backup", {
        id,
        selfBackupId: selfBackup.id,
        error: String(error),
      });
    } catch (rollbackError) {
      logger.error("Restore AND rollback failed — manual recovery required", {
        id,
        selfBackupId: selfBackup.id,
        selfBackupDir,
        error: String(error),
        rollbackError: String(rollbackError),
      });
      throw new Error(
        "Restore failed and automatic rollback also failed. " +
          `Your previous data is safe at ${selfBackupDir}. ` +
          "Stop the app, copy that bundle's files back manually, then restart.",
      );
    }
    throw error;
  } finally {
    setRestoreInProgress(false);
  }
}

/** Delete a backup by id (path-traversal guarded). Returns false when absent. */
export function deleteBackup(id: string): boolean {
  const backupsDir = getBackupsDir();
  const resolved = path.resolve(path.join(backupsDir, id));
  const backupsAbs = path.resolve(backupsDir);
  if (resolved !== backupsAbs && !resolved.startsWith(backupsAbs + path.sep)) {
    throw new Error("Invalid backup ID");
  }
  if (!fs.existsSync(resolved)) return false;
  fs.rmSync(resolved, { recursive: true, force: true });
  logger.info("Backup deleted", { id });
  return true;
}

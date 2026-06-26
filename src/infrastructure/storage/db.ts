import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { getDatabasePath } from "@/infrastructure/config/paths";
import * as schema from "@/infrastructure/storage/schema";
import { runMigrations } from "@/infrastructure/storage/migrations";
import { seedDefaults } from "@/infrastructure/storage/seeds";
import { recoverInterruptedRestore } from "@/infrastructure/storage/restore-ops";
import { logger } from "@/infrastructure/logging/logger";

let database: BetterSQLite3Database<typeof schema> | null = null;
let migrated = false;
let restoreInProgress = false;

export function isRestoreInProgress(): boolean {
  return restoreInProgress;
}

/** Gate new connections while a restore swaps the underlying files. */
export function setRestoreInProgress(flag: boolean): void {
  restoreInProgress = flag;
}

export async function getDb(): Promise<BetterSQLite3Database<typeof schema>> {
  if (restoreInProgress) {
    throw new Error("Database restore in progress — cannot open a connection");
  }
  if (!migrated) {
    // Before touching the DB, roll back any restore that was interrupted by a
    // crash (no-op when there is no marker).
    recoverInterruptedRestore();
    await runMigrations();
    migrated = true;
  }
  if (!database) {
    const sqlite = new Database(getDatabasePath());
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("busy_timeout = 5000");
    // FK enforcement is per-connection and OFF by default in SQLite; without
    // this, ON DELETE CASCADE is silently ignored and orphan rows accumulate.
    sqlite.pragma("foreign_keys = ON");
    database = drizzle(sqlite, { schema });
    await seedDefaults(database);
  }
  return database;
}

/**
 * Close the live connection and reset singleton state so a restore can safely
 * overwrite the database file. The next getDb() reopens and re-runs migrations
 * (forward-migrating a restored older-schema file).
 */
export function closeDb(): void {
  if (!database) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sqlite = (database as any).$client as Database.Database;
  try {
    sqlite.close();
  } catch (error) {
    // Best-effort during restore — log but don't throw.
    logger.error("closeDb: error closing database", { error: String(error) });
  }
  database = null;
  migrated = false;
}


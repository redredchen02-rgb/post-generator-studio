import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { getDatabasePath } from "@/infrastructure/config/paths";
import * as schema from "@/infrastructure/storage/schema";
import { runMigrations } from "@/infrastructure/storage/migrations";
import { seedDefaults } from "@/infrastructure/storage/seeds";

let database: BetterSQLite3Database<typeof schema> | null = null;
let migrated = false;

export async function getDb(): Promise<BetterSQLite3Database<typeof schema>> {
  if (!migrated) {
    await runMigrations();
    migrated = true;
  }
  if (!database) {
    const sqlite = new Database(getDatabasePath());
    sqlite.pragma("journal_mode = WAL");
    database = drizzle(sqlite, { schema });
    await seedDefaults(database);
  }
  return database;
}


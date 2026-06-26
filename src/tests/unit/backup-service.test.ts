import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

// Isolated data root so the db singleton / secrets / backups don't collide
// with other test files. Must be set before importing storage modules.
const home = fs.mkdtempSync(path.join(os.tmpdir(), "backup-svc-"));
process.env.POST_GENERATOR_HOME = home;
process.env.POST_GENERATOR_DB_PATH = path.join(home, "post-generator.db");

import { providerProfiles } from "@/infrastructure/storage/schema";
import { getDb, closeDb } from "@/infrastructure/storage/db";
import { getBackupsDir, getSecretsDir } from "@/infrastructure/config/paths";
import { saveSecret } from "@/infrastructure/security/secrets";
import {
  createBackup,
  listBackups,
  deleteBackup,
  restoreBackup,
} from "@/application/storage/backup-service";

afterAll(() => {
  closeDb();
  fs.rmSync(home, { recursive: true, force: true });
});

async function providerIds(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select({ id: providerProfiles.id }).from(providerProfiles);
  return rows.map((r) => r.id).sort();
}

async function deleteProvider(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(providerProfiles).where(eq(providerProfiles.id, id));
}

describe("backup-service", () => {
  beforeEach(async () => {
    // Reset to a clean seeded DB + empty backups dir before each test.
    closeDb();
    fs.rmSync(process.env.POST_GENERATOR_DB_PATH as string, { force: true });
    fs.rmSync(getBackupsDir(), { recursive: true, force: true });
    fs.rmSync(getSecretsDir(), { recursive: true, force: true });
    await getDb(); // re-seed
  });

  it("createBackup writes a bundle (db + meta) that listBackups returns", async () => {
    const meta = await createBackup();
    expect(meta.id).toMatch(/^backup-/);
    expect(meta.schemaVer).toBe(1);
    expect(meta.fileSizeBytes).toBeGreaterThan(0);

    const bundleDir = path.join(getBackupsDir(), meta.id);
    expect(fs.existsSync(path.join(bundleDir, "post-generator.db"))).toBe(true);
    expect(fs.existsSync(path.join(bundleDir, "meta.json"))).toBe(true);

    const listed = listBackups();
    expect(listed.map((b) => b.id)).toContain(meta.id);
  });

  it("round-trips: restore brings deleted rows back (and self-backup ordering works)", async () => {
    const original = await providerIds();
    expect(original.length).toBeGreaterThan(0);

    const meta = await createBackup();

    // Mutate: drop one provider.
    await deleteProvider(original[0]);
    expect((await providerIds()).length).toBe(original.length - 1);

    // Restore. If the self-backup/guard ordering were wrong (guard before
    // self-backup), this would throw "restore in progress" — so a clean
    // round-trip is also the Finding #1 regression guard.
    await restoreBackup(meta.id);

    expect(await providerIds()).toEqual(original);
  });

  it("includes the secrets directory and flags it in meta", async () => {
    await saveSecret("a-provider-key");
    const meta = await createBackup();
    expect(meta.includesSecrets).toBe(true);
    const bundleSecrets = path.join(getBackupsDir(), meta.id, "secrets");
    expect(fs.existsSync(bundleSecrets)).toBe(true);
    expect(fs.readdirSync(bundleSecrets).length).toBeGreaterThan(0);
  });

  it("backs up and restores with no secrets dir (includesSecrets=false)", async () => {
    fs.rmSync(getSecretsDir(), { recursive: true, force: true });
    const meta = await createBackup();
    expect(meta.includesSecrets).toBe(false);
    await expect(restoreBackup(meta.id)).resolves.toBeUndefined();
  });

  it("listBackups ignores dirs without a valid meta.json and sorts newest-first", async () => {
    const a = await createBackup();
    const b = await createBackup();
    // A partial/interrupted backup dir with no meta.json must be ignored.
    fs.mkdirSync(path.join(getBackupsDir(), "backup-partial"), { recursive: true });

    const listed = listBackups();
    const ids = listed.map((x) => x.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    expect(ids).not.toContain("backup-partial");
    // newest-first
    const times = listed.map((x) => new Date(x.createdAt).getTime());
    expect(times).toEqual([...times].sort((x, y) => y - x));
  });

  it("rejects path traversal in resolve and delete", async () => {
    await expect(restoreBackup("../../etc")).rejects.toThrow(/Invalid backup ID/);
    expect(() => deleteBackup("../../../tmp")).toThrow(/Invalid backup ID/);
  });

  it("rejects a bundle whose schemaVer is newer than the app, leaving live data intact", async () => {
    const meta = await createBackup();
    const metaPath = path.join(getBackupsDir(), meta.id, "meta.json");
    const tampered = { ...meta, schemaVer: 999 };
    fs.writeFileSync(metaPath, JSON.stringify(tampered), "utf-8");

    const before = await providerIds();
    await expect(restoreBackup(meta.id)).rejects.toThrow(/newer than this app/);
    expect(await providerIds()).toEqual(before); // untouched
  });

  it("rejects a corrupt bundle DB before touching live data", async () => {
    const meta = await createBackup();
    const bundleDb = path.join(getBackupsDir(), meta.id, "post-generator.db");
    fs.writeFileSync(bundleDb, "not a sqlite file", "utf-8"); // corrupt it

    const before = await providerIds();
    await expect(restoreBackup(meta.id)).rejects.toThrow();
    expect(await providerIds()).toEqual(before); // live DB untouched
  });

  it("validateBackupDb leaves no -wal/-shm next to the bundle", async () => {
    const meta = await createBackup();
    // restore runs validateBackupDb internally; afterwards no sidecars remain.
    await restoreBackup(meta.id);
    const bundleDb = path.join(getBackupsDir(), meta.id, "post-generator.db");
    expect(fs.existsSync(bundleDb + "-wal")).toBe(false);
    expect(fs.existsSync(bundleDb + "-shm")).toBe(false);
  });

  it("deleteBackup removes a bundle and returns false when absent", async () => {
    const meta = await createBackup();
    expect(deleteBackup(meta.id)).toBe(true);
    expect(fs.existsSync(path.join(getBackupsDir(), meta.id))).toBe(false);
    expect(deleteBackup(meta.id)).toBe(false);
  });
});

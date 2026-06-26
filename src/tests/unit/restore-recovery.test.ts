import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "restore-recovery-"));
process.env.POST_GENERATOR_HOME = home;
process.env.POST_GENERATOR_DB_PATH = path.join(home, "post-generator.db");

// Controllable failure injection for applyBundleToLive: the restore swap throws,
// the rollback swap delegates to the real implementation. Lets us prove the
// rollback path restores live files and the original error still surfaces.
const failNext = vi.hoisted(() => ({ once: false }));

vi.mock("@/infrastructure/storage/restore-ops", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infrastructure/storage/restore-ops")>();
  return {
    ...actual,
    applyBundleToLive: vi.fn((bundleDir: string) => {
      if (failNext.once) {
        failNext.once = false;
        throw new Error("injected swap failure");
      }
      return actual.applyBundleToLive(bundleDir);
    }),
  };
});

import { providerProfiles } from "@/infrastructure/storage/schema";
import { getDb, closeDb } from "@/infrastructure/storage/db";
import { getBackupsDir, getSecretsDir } from "@/infrastructure/config/paths";
import {
  recoverInterruptedRestore,
  writeRestoreMarker,
  readRestoreMarker,
} from "@/infrastructure/storage/restore-ops";
import { createBackup, restoreBackup } from "@/application/storage/backup-service";

afterAll(() => {
  closeDb();
  fs.rmSync(home, { recursive: true, force: true });
});

async function providerIds(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select({ id: providerProfiles.id }).from(providerProfiles);
  return rows.map((r) => r.id).sort();
}

describe("restore failure rollback", () => {
  beforeEach(async () => {
    failNext.once = false;
    closeDb();
    fs.rmSync(process.env.POST_GENERATOR_DB_PATH as string, { force: true });
    fs.rmSync(getBackupsDir(), { recursive: true, force: true });
    await getDb();
  });

  it("rolls live data back from the self-backup when the swap fails, then rethrows", async () => {
    const original = await providerIds();
    const target = await createBackup();

    // Mutate so we can detect whether rollback truly restored the pre-restore state.
    const db = await getDb();
    await db.delete(providerProfiles).where(eq(providerProfiles.id, original[0]));
    const mutated = await providerIds();
    expect(mutated).not.toEqual(original);

    failNext.once = true; // the restore swap will throw; rollback swap will succeed
    await expect(restoreBackup(target.id)).rejects.toThrow(/injected swap failure/);

    // Live data must match the pre-restore (mutated) state via the self-backup,
    // not the half-applied target.
    expect(await providerIds()).toEqual(mutated);
    // Guard released even on failure.
    await expect(getDb()).resolves.toBeDefined();
  });
});

describe("interrupted-restore boot recovery", () => {
  beforeEach(async () => {
    failNext.once = false;
    closeDb();
    fs.rmSync(process.env.POST_GENERATOR_DB_PATH as string, { force: true });
    fs.rmSync(getBackupsDir(), { recursive: true, force: true });
    await getDb();
  });

  it("no marker → recovery is a no-op", () => {
    expect(() => recoverInterruptedRestore()).not.toThrow();
    expect(readRestoreMarker()).toBeNull();
  });

  it("marker present → live files restored from the named self-backup; marker cleared", async () => {
    const original = await providerIds();
    const selfBackup = await createBackup();

    // Simulate a crash mid-restore: live DB mutated, marker left pointing at the
    // self-backup taken before the (interrupted) swap.
    const db = await getDb();
    await db.delete(providerProfiles).where(eq(providerProfiles.id, original[0]));
    closeDb();
    writeRestoreMarker(selfBackup.id);

    recoverInterruptedRestore();

    expect(readRestoreMarker()).toBeNull();
    expect(await providerIds()).toEqual(original);
  });

  it("marker present but self-backup missing → clears marker and lets the app boot", async () => {
    writeRestoreMarker("backup-does-not-exist");
    expect(() => recoverInterruptedRestore()).not.toThrow();
    expect(readRestoreMarker()).toBeNull();
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

// Isolate this file's data root so the db singleton and secrets don't collide
// with other test files sharing the default POST_GENERATOR_HOME.
const home = fs.mkdtempSync(path.join(os.tmpdir(), "db-lifecycle-"));
process.env.POST_GENERATOR_HOME = home;
process.env.POST_GENERATOR_DB_PATH = path.join(home, "post-generator.db");

import { eq } from "drizzle-orm";
import { providerProfiles } from "@/infrastructure/storage/schema";
import { getDb, closeDb, setRestoreInProgress, isRestoreInProgress } from "@/infrastructure/storage/db";
import { saveSecret, readSecret, cacheInvalidate } from "@/infrastructure/security/secrets";

afterAll(() => {
  closeDb();
  fs.rmSync(home, { recursive: true, force: true });
});

beforeEach(() => {
  setRestoreInProgress(false);
});

describe("db restore lifecycle", () => {
  it("closeDb then getDb reopens a working handle", async () => {
    const db = await getDb();
    const before = await db.select({ id: providerProfiles.id }).from(providerProfiles);
    expect(before.length).toBeGreaterThan(0); // seeded defaults

    closeDb();

    const reopened = await getDb();
    const after = await reopened.select({ id: providerProfiles.id }).from(providerProfiles);
    expect(after.length).toBe(before.length);
  });

  it("closeDb is a no-op when no connection is open", () => {
    closeDb();
    expect(() => closeDb()).not.toThrow();
  });

  it("getDb throws while a restore is in progress, then recovers", async () => {
    await getDb(); // ensure migrated/open at least once
    setRestoreInProgress(true);
    expect(isRestoreInProgress()).toBe(true);
    await expect(getDb()).rejects.toThrow(/restore in progress/i);

    setRestoreInProgress(false);
    await expect(getDb()).resolves.toBeDefined();
  });

  it("seedDefaults does not resurrect a user-deleted default row on reopen", async () => {
    const db = await getDb();
    const seeded = await db.select({ id: providerProfiles.id }).from(providerProfiles);
    const targetId = seeded[0].id;

    await db.delete(providerProfiles).where(eq(providerProfiles.id, targetId));
    const afterDelete = await db.select({ id: providerProfiles.id }).from(providerProfiles);
    expect(afterDelete.find((r) => r.id === targetId)).toBeUndefined();

    closeDb();
    const reopened = await getDb();
    const afterReopen = await reopened
      .select({ id: providerProfiles.id })
      .from(providerProfiles);
    // Table was non-empty, so seedDefaults skips entirely — the deleted row stays gone.
    expect(afterReopen.find((r) => r.id === targetId)).toBeUndefined();
  });

  it("cacheInvalidate is exported and a read still resolves from disk after clearing", async () => {
    const { ref } = await saveSecret("super-secret-value");
    expect(await readSecret(ref)).toBe("super-secret-value"); // primes the cache
    expect(typeof cacheInvalidate).toBe("function");
    cacheInvalidate(ref); // drop the cached entry; next read must hit disk
    expect(await readSecret(ref)).toBe("super-secret-value");
  });
});

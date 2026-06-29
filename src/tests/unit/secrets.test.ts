import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cacheInvalidate, deleteSecret, maskSecret, readSecret, saveSecret } from "@/infrastructure/security/secrets";
import { getSecretsDir } from "@/infrastructure/config/paths";

describe("encrypted secrets", () => {
  it("encrypts, masks, reads, and deletes API keys", async () => {
    const saved = await saveSecret("sk-test-1234567890");

    expect(saved.masked).toBe(maskSecret("sk-test-1234567890"));
    expect(saved.masked).not.toBe("sk-test-1234567890");
    await expect(readSecret(saved.ref)).resolves.toBe("sk-test-1234567890");

    await deleteSecret(saved.ref);
    await expect(readSecret(saved.ref)).resolves.toBeUndefined();
  });

  it("does not serve a deleted key from cache within the TTL window", async () => {
    const saved = await saveSecret("sk-cache-leak-test");
    // Populate the in-memory cache.
    await expect(readSecret(saved.ref)).resolves.toBe("sk-cache-leak-test");

    // Delete and immediately read again — must not return the cached plaintext.
    await deleteSecret(saved.ref);
    await expect(readSecret(saved.ref)).resolves.toBeUndefined();
  });

  it("returns the new value after overwriting an existing ref, not the stale cache", async () => {
    const first = await saveSecret("sk-old-value");
    await expect(readSecret(first.ref)).resolves.toBe("sk-old-value");

    // Overwrite in place; cache for this ref must be invalidated.
    const second = await saveSecret("sk-new-value", first.ref);
    expect(second.ref).toBe(first.ref);
    await expect(readSecret(first.ref)).resolves.toBe("sk-new-value");
  });

  it("throws a typed error (not a raw SyntaxError → 500) when the secret file is corrupt", async () => {
    // Regression: readSecret did an unguarded JSON.parse, so a truncated/corrupt
    // envelope crashed with a raw SyntaxError that surfaced as a 500.
    const saved = await saveSecret("sk-corrupt-target-123456");
    cacheInvalidate(saved.ref); // force a file read, not a cache hit
    const file = path.join(getSecretsDir(), `${saved.ref}.json`);
    await fs.writeFile(file, "{ this is not valid json", { mode: 0o600 });

    await expect(readSecret(saved.ref)).rejects.toMatchObject({ appError: { code: "SECRET_CORRUPT" } });
  });

  it("returns undefined for an unknown or undefined ref", async () => {
    await expect(readSecret(undefined)).resolves.toBeUndefined();
    await expect(readSecret("secret_does-not-exist")).resolves.toBeUndefined();
    await expect(deleteSecret(undefined)).resolves.toBeUndefined();
  });
});


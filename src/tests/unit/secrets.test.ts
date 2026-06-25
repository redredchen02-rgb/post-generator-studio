import { describe, expect, it } from "vitest";
import { deleteSecret, maskSecret, readSecret, saveSecret } from "@/infrastructure/security/secrets";

describe("encrypted secrets", () => {
  it("encrypts, masks, reads, and deletes API keys", async () => {
    const saved = await saveSecret("sk-test-1234567890");

    expect(saved.masked).toBe(maskSecret("sk-test-1234567890"));
    expect(saved.masked).not.toBe("sk-test-1234567890");
    await expect(readSecret(saved.ref)).resolves.toBe("sk-test-1234567890");

    await deleteSecret(saved.ref);
    await expect(readSecret(saved.ref)).rejects.toThrow();
  });
});


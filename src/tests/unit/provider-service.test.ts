import { describe, expect, it } from "vitest";
import {
  createProviderProfile,
  getProviderProfile,
  listProviderProfiles,
  updateProviderProfile,
  deleteProviderProfile,
} from "@/application/providers/provider-service";

describe("provider-service", () => {
  it("creates and retrieves a provider without API key", async () => {
    const created = await createProviderProfile({
      name: "No Key Provider",
      providerKind: "ollama",
      baseUrl: "http://localhost:11434",
      model: "llama3",
      defaultTemperature: 0.7,
      defaultMaxTokens: 3000,
      enabled: true,
    });

    expect(created.id).toMatch(/^provider_/);
    expect(created.name).toBe("No Key Provider");
    expect(created.apiKeyRef).toBeUndefined();

    const fetched = await getProviderProfile(created.id);
    expect(fetched.id).toBe(created.id);
  });

  it("creates a provider with API key (encrypted)", async () => {
    const created = await createProviderProfile({
      name: "Key Provider",
      providerKind: "openai",
      model: "gpt-4",
      apiKey: "sk-test-key-12345",
      defaultTemperature: 0.7,
      defaultMaxTokens: 3000,
      enabled: true,
    });

    expect(created.apiKeyRef).toBeDefined();
    expect(created.keyMasked).toBeDefined();
    expect(created.keyMasked).not.toBe("sk-test-key-12345");
  });

  it("lists providers", async () => {
    await createProviderProfile({
      name: "List Provider",
      providerKind: "openai-compatible",
      model: "local",
      defaultTemperature: 0.7,
      defaultMaxTokens: 3000,
      enabled: false,
    });

    const all = await listProviderProfiles();
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it("updates a provider", async () => {
    const created = await createProviderProfile({
      name: "Update Provider",
      providerKind: "openai-compatible",
      model: "old-model",
      defaultTemperature: 0.7,
      defaultMaxTokens: 3000,
      enabled: false,
    });

    const updated = await updateProviderProfile(created.id, { model: "new-model", enabled: true });
    expect(updated.model).toBe("new-model");
    expect(updated.enabled).toBe(true);
  });

  it("deletes a provider", async () => {
    const created = await createProviderProfile({
      name: "Delete Provider",
      providerKind: "openai-compatible",
      model: "local",
      defaultTemperature: 0.7,
      defaultMaxTokens: 3000,
      enabled: false,
    });

    await deleteProviderProfile(created.id);
    await expect(getProviderProfile(created.id)).rejects.toThrow("not found");
  });

  it("throws NOT_FOUND for non-existent provider", async () => {
    await expect(getProviderProfile("non-existent")).rejects.toThrow("not found");
  });
});

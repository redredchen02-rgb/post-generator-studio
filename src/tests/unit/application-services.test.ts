import { describe, expect, it, vi } from "vitest";
import { createGenerationService, createPromptService, createPresetService, createExportService, createProviderService, registerGenerationController } from "@postgen/application";
import type { StoragePort } from "@postgen/domain";

function makeMockStorage(): StoragePort {
  const repo = () => ({ list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), getByIdempotencyKey: vi.fn() });
  return { generations: repo(), promptTemplates: repo(), generationPresets: repo(), providerProfiles: repo() } as unknown as StoragePort;
}

describe("service wiring smoke (R21)", () => {
  it("createGenerationService returns required methods", () => {
    const s = createGenerationService({ storage: makeMockStorage(), logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }, readSecret: vi.fn(), getProviderAdapter: vi.fn() });
    expect(typeof s.listGenerations).toBe("function");
    expect(typeof s.getGeneration).toBe("function");
    expect(typeof s.streamGeneration).toBe("function");
    expect(typeof s.cancelGeneration).toBe("function");
  });

  it("createPromptService returns required methods", () => {
    const s = createPromptService({ storage: makeMockStorage() });
    expect(typeof s.listPromptTemplates).toBe("function");
    expect(typeof s.previewPrompt).toBe("function");
  });

  it("createPresetService returns required methods", () => {
    const s = createPresetService({ storage: makeMockStorage() });
    expect(typeof s.listGenerationPresets).toBe("function");
    expect(typeof s.createGenerationPreset).toBe("function");
  });

  it("createProviderService returns required methods", () => {
    const s = createProviderService({ storage: makeMockStorage(), readSecret: vi.fn(), saveSecret: vi.fn(), deleteSecret: vi.fn(), getProviderAdapter: vi.fn() });
    expect(typeof s.listProviderProfiles).toBe("function");
    expect(typeof s.testProviderProfile).toBe("function");
  });

  it("createExportService returns required methods", () => {
    const s = createExportService({ storage: makeMockStorage(), exportsDir: "/tmp" });
    expect(typeof s.exportGeneration).toBe("function");
  });
});

describe("cancel registry (R23)", () => {
  it("cancelGeneration returns cancelled true when controller registered", () => {
    const storage = makeMockStorage();
    (storage.generations.get as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "gen_1", status: "streaming" });
    (storage.generations.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "gen_1", status: "cancelled" });
    const s = createGenerationService({ storage, logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }, readSecret: vi.fn(), getProviderAdapter: vi.fn() });

    const controller = new AbortController();
    registerGenerationController("gen_1", controller);

    return s.cancelGeneration("gen_1").then((result) => {
      expect(result.cancelled).toBe(true);
      expect(storage.generations.update).toHaveBeenCalledWith("gen_1", expect.objectContaining({ status: "cancelled" }));
    });
  });

  it("cancelGeneration returns cancelled false when no active controller", () => {
    const storage = makeMockStorage();
    const s = createGenerationService({ storage, logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }, readSecret: vi.fn(), getProviderAdapter: vi.fn() });

    return s.cancelGeneration("gen_not_found").then((result) => {
      expect(result.cancelled).toBe(false);
      expect(storage.generations.update).not.toHaveBeenCalled();
    });
  });
});

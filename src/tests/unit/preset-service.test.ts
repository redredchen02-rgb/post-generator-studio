import { describe, expect, it } from "vitest";
import {
  createGenerationPreset,
  getGenerationPreset,
  listGenerationPresets,
  updateGenerationPreset,
  deleteGenerationPreset,
} from "@/application/presets/preset-service";

describe("preset-service", () => {
  it("creates and retrieves a preset", async () => {
    const created = await createGenerationPreset({
      name: "Test Preset",
      providerProfileId: "provider_local_openai_compatible",
      promptTemplateId: "template_news_writing",
      locale: "zh-CN",
      outputFormat: "markdown",
      enabledPipelineSteps: ["build-context", "render-prompt"],
      isDefault: false,
    });

    expect(created.id).toMatch(/^preset_/);
    expect(created.name).toBe("Test Preset");
    expect(created.locale).toBe("zh-CN");

    const fetched = await getGenerationPreset(created.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.name).toBe("Test Preset");
  });

  it("lists presets", async () => {
    await createGenerationPreset({
      name: "List Preset",
      providerProfileId: "provider_local_openai_compatible",
      promptTemplateId: "template_news_writing",
      locale: "en-US",
      outputFormat: "markdown",
      enabledPipelineSteps: [],
      isDefault: false,
    });

    const all = await listGenerationPresets();
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it("updates a preset", async () => {
    const created = await createGenerationPreset({
      name: "Update Preset",
      providerProfileId: "provider_local_openai_compatible",
      promptTemplateId: "template_news_writing",
      locale: "zh-CN",
      outputFormat: "markdown",
      enabledPipelineSteps: [],
      isDefault: false,
    });

    const updated = await updateGenerationPreset(created.id, { name: "Updated Preset" });
    expect(updated.name).toBe("Updated Preset");
  });

  it("deletes a preset", async () => {
    const created = await createGenerationPreset({
      name: "Delete Preset",
      providerProfileId: "provider_local_openai_compatible",
      promptTemplateId: "template_news_writing",
      locale: "zh-CN",
      outputFormat: "markdown",
      enabledPipelineSteps: [],
      isDefault: false,
    });

    await deleteGenerationPreset(created.id);
    await expect(getGenerationPreset(created.id)).rejects.toThrow("生成预设不存在");
  });

  it("throws NOT_FOUND for non-existent preset", async () => {
    await expect(getGenerationPreset("non-existent")).rejects.toThrow("生成预设不存在");
  });

  it("validates input schema", async () => {
    await expect(
      createGenerationPreset({ name: "" }),
    ).rejects.toThrow();
  });
});

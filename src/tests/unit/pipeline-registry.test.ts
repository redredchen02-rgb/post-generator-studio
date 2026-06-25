import { describe, expect, it } from "vitest";
import {
  buildContextStep,
  renderPromptStep,
  cleanContentStep,
  formatOutputStep,
  listPipelineSteps,
  getPipelineStep,
} from "@/plugins/pipeline/registry";
import type { PipelineContext } from "@/domain/ports/pipeline";
import { logger } from "@/infrastructure/logging/logger";

function makeContext(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    generationId: "gen_test",
    preset: {
      id: "preset_test",
      name: "Test",
      providerProfileId: "provider_test",
      promptTemplateId: "template_test",
      temperature: 0.7,
      maxTokens: 3000,
      locale: "zh-CN",
      outputFormat: "markdown",
      enabledPipelineSteps: [],
      isDefault: false,
      createdAt: "",
      updatedAt: "",
    },
    providerProfile: {
      id: "provider_test",
      name: "Test",
      providerKind: "openai-compatible",
      model: "test-model",
      defaultTemperature: 0.7,
      defaultMaxTokens: 3000,
      enabled: true,
      createdAt: "",
      updatedAt: "",
    },
    template: {
      id: "template_test",
      name: "Test",
      systemPrompt: "你是{{LOCALE}}编辑。",
      userPromptTemplate: "标题：{{TITLE}}",
      supportedVariables: ["TITLE", "LOCALE"],
      outputFormat: "markdown",
      version: 1,
      isDefault: false,
      createdAt: "",
      updatedAt: "",
    },
    logger,
    abortSignal: new AbortController().signal,
    ...overrides,
  };
}

describe("pipeline registry", () => {
  it("lists all pipeline steps", () => {
    const steps = listPipelineSteps();
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.id)).toEqual([
      "build-context",
      "render-prompt",
      "clean-content",
      "format-output",
    ]);
  });

  it("gets a step by id", () => {
    const step = getPipelineStep("build-context");
    expect(step?.name).toBe("Build Context");
  });

  it("returns undefined for unknown step", () => {
    expect(getPipelineStep("non-existent")).toBeUndefined();
  });

  it("buildContextStep resolves variables", async () => {
    const context = makeContext();
    const result = await buildContextStep.execute(context, {
      title: "测试标题",
      eventSummary: "测试事件",
      presetId: "preset_test",
    });

    expect(result.variables.TITLE).toBe("测试标题");
    expect(result.variables.EVENT_SUMMARY).toBe("测试事件");
    expect(result.variables.LOCALE).toBe("zh-CN");
  });

  it("renderPromptStep renders template variables", async () => {
    const context = makeContext();
    const contextPayload = await buildContextStep.execute(context, {
      title: "我的标题",
      eventSummary: "事件",
      presetId: "preset_test",
    });
    const rendered = await renderPromptStep.execute(context, contextPayload);

    expect(rendered.systemPrompt).toContain("zh-CN");
    expect(rendered.userPrompt).toContain("我的标题");
    expect(rendered.normalizedRequest.model).toBe("test-model");
    expect(rendered.normalizedRequest.temperature).toBe(0.7);
  });

  it("cleanContentStep cleans AI self-references", async () => {
    const context = makeContext();
    const result = await cleanContentStep.execute(context, {
      content: "# 标题\n\n作为AI模型，我认为...\n\n正文内容。",
      title: "标题",
    });

    expect(result).not.toContain("作为AI模型");
    expect(result).toContain("正文内容");
  });

  it("formatOutputStep returns markdown as-is", async () => {
    const context = makeContext();
    const result = await formatOutputStep.execute(context, "# Hello\n\nWorld");
    expect(result).toBe("# Hello\n\nWorld");
  });

  it("formatOutputStep strips markdown for plain_text", async () => {
    const context = makeContext({
      preset: {
        ...makeContext().preset,
        outputFormat: "plain_text",
      },
    });
    const result = await formatOutputStep.execute(context, "# Hello\n\n**Bold** text");
    expect(result).not.toContain("#");
    expect(result).not.toContain("**");
    expect(result).toContain("Hello");
    expect(result).toContain("Bold text");
  });
});

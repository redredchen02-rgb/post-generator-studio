import { describe, expect, it } from "vitest";
import {
  createPromptTemplate,
  getPromptTemplate,
  listPromptTemplates,
  updatePromptTemplate,
  deletePromptTemplate,
  previewPrompt,
} from "@postgen/application/prompt/prompt-service";

describe("prompt-service", () => {
  it("creates and retrieves a template", async () => {
    const created = await createPromptTemplate({
      name: "Test Template",
      systemPrompt: "你是一名编辑。",
      userPromptTemplate: "标题：{{TITLE}}",
      supportedVariables: ["TITLE"],
      outputFormat: "markdown",
      isDefault: false,
    });

    expect(created.id).toMatch(/^template_/);
    expect(created.name).toBe("Test Template");
    expect(created.version).toBe(1);

    const fetched = await getPromptTemplate(created.id);
    expect(fetched.id).toBe(created.id);
  });

  it("lists templates", async () => {
    await createPromptTemplate({
      name: "List Template",
      systemPrompt: "test",
      userPromptTemplate: "test {{TITLE}}",
      supportedVariables: ["TITLE"],
      outputFormat: "markdown",
      isDefault: false,
    });

    const all = await listPromptTemplates();
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it("updates a template and increments version", async () => {
    const created = await createPromptTemplate({
      name: "Version Template",
      systemPrompt: "v1",
      userPromptTemplate: "{{TITLE}}",
      supportedVariables: ["TITLE"],
      outputFormat: "markdown",
      isDefault: false,
    });

    const updated = await updatePromptTemplate(created.id, { systemPrompt: "v2" });
    expect(updated.systemPrompt).toBe("v2");
    expect(updated.version).toBe(2);
  });

  it("deletes a template", async () => {
    const created = await createPromptTemplate({
      name: "Delete Template",
      systemPrompt: "test",
      userPromptTemplate: "{{TITLE}}",
      supportedVariables: ["TITLE"],
      outputFormat: "markdown",
      isDefault: false,
    });

    await deletePromptTemplate(created.id);
    await expect(getPromptTemplate(created.id)).rejects.toThrow("提示词模板不存在");
  });

  it("throws NOT_FOUND for non-existent template", async () => {
    await expect(getPromptTemplate("non-existent")).rejects.toThrow("提示词模板不存在");
  });

  it("rejects unsupported variables", async () => {
    await expect(
      createPromptTemplate({
        name: "Bad Vars",
        systemPrompt: "{{UNSUPPORTED}}",
        userPromptTemplate: "{{TITLE}}",
        supportedVariables: ["TITLE"],
        outputFormat: "markdown",
        isDefault: false,
      }),
    ).rejects.toThrow("未支持变量");
  });

  it("previews rendered prompt", async () => {
    const result = await previewPrompt({
      systemPrompt: "你是{{LOCALE}}编辑。",
      userPromptTemplate: "标题：{{TITLE}}",
      title: "测试标题",
      eventSummary: "测试事件",
      locale: "zh-CN",
    });

    expect(result.systemPrompt).toContain("zh-CN");
    expect(result.userPrompt).toContain("测试标题");
  });
});

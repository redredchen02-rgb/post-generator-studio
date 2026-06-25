import { describe, expect, it } from "vitest";
import { assertSupportedVariables, extractTemplateVariables, renderTemplate } from "@postgen/application/prompt/renderer";
import { resolvePromptVariables } from "@postgen/application/prompt/variables";

describe("prompt renderer", () => {
  it("renders controlled variables without executing code", () => {
    const variables = resolvePromptVariables(
      { title: "AI 创业", eventSummary: "- Day 1\n- Day 2" },
      { locale: "zh-CN" },
      new Date("2026-06-24T10:30:00Z"),
    );

    const rendered = renderTemplate("标题：{{TITLE}}\n事件：{{EVENT_SUMMARY}}\n{{ arbitrary_code }}", variables);

    expect(rendered.content).toContain("AI 创业");
    expect(rendered.content).toContain("{{ arbitrary_code }}");
  });

  it("detects unsupported uppercase variables", () => {
    expect(extractTemplateVariables("{{TITLE}} {{SEO_KEYWORDS}}")).toEqual(["TITLE", "SEO_KEYWORDS"]);
    expect(() => assertSupportedVariables("{{SEO_KEYWORDS}}", ["TITLE"])).toThrow("未支持变量");
  });

  it("throws when a supported variable is unresolved", () => {
    expect(() => renderTemplate("{{TITLE}} {{DATE}}", { TITLE: "Hello" })).toThrow("模板变量缺失");
  });
});


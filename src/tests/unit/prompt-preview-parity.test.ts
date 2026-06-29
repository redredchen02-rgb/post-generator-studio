import { describe, expect, it } from "vitest";
import { previewPrompt } from "@/application/prompt/prompt-service";
import { computePromptPreview } from "@/presentation/lib/preview-prompt";
import { buildPreviewVariables, renderPromptPair } from "@/application/prompt/preview-core";
import type { PromptTemplate } from "@/domain/schemas";

const SYSTEM = "You write about {{TITLE}} for {{LOCALE}}.";
const USER = "Title: {{TITLE}}\nSummary: {{EVENT_SUMMARY}}";

const template = (): PromptTemplate => ({
  id: "tpl",
  name: "T",
  systemPrompt: SYSTEM,
  userPromptTemplate: USER,
  supportedVariables: ["TITLE", "EVENT_SUMMARY", "LOCALE"],
  customVariableDefaults: {},
  outputFormat: "markdown",
  version: 1,
  isDefault: true,
  createdAt: "2026-06-29T00:00:00.000Z",
  updatedAt: "2026-06-29T00:00:00.000Z",
});

describe("prompt-preview single source of truth", () => {
  it("server route and client bridge render identically for the same input (no controls)", async () => {
    const input = { title: "AI sprint", eventSummary: "- a\n- b", locale: "zh-CN" };

    const server = await previewPrompt({ ...input, systemPrompt: SYSTEM, userPromptTemplate: USER });
    const client = computePromptPreview({ ...input, template: template() });

    expect(client.systemPrompt).toBe(server.systemPrompt);
    expect(client.userPrompt).toBe(server.userPrompt);
  });

  it("renderPromptPair reports the union of variables used across both templates", () => {
    const vars = buildPreviewVariables({ title: "X", eventSummary: "Y", locale: "en-US" });
    const out = renderPromptPair(SYSTEM, USER, vars);
    expect(out.usedVariables.sort()).toEqual(["EVENT_SUMMARY", "LOCALE", "TITLE"]);
  });
});

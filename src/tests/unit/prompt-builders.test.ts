import { describe, it, expect } from "vitest";
import {
  buildRewritePrompt,
  buildContinuePrompt,
  buildOutlinePrompt,
  buildParagraphPrompt,
  parseOutline,
  serializeOutline,
} from "@/application/content/prompt-builders";

describe("buildRewritePrompt", () => {
  const ctx = {
    title: "Test Article",
    selection: "Some selected text.",
    before: "Text before.",
    after: "Text after.",
  };

  it("returns systemPrompt and prompt for rewrite action", () => {
    const result = buildRewritePrompt("rewrite", ctx);
    expect(result.systemPrompt).toBeTruthy();
    expect(result.prompt).toContain(ctx.title);
    expect(result.prompt).toContain(ctx.selection);
    expect(result.prompt).toContain("改写");
  });

  it("includes tone line when action is 'tone' and tone is set", () => {
    const result = buildRewritePrompt("tone", { ...ctx, tone: "正式" });
    expect(result.prompt).toContain("目标语气：正式");
  });

  it("omits tone line when action is 'tone' but no tone is set", () => {
    const result = buildRewritePrompt("tone", ctx);
    expect(result.prompt).not.toContain("目标语气");
  });

  it("throws on unknown action id", () => {
    expect(() => buildRewritePrompt("unknown" as never, ctx)).toThrow("Unknown rewrite action");
  });

  it("handles empty selection without throwing", () => {
    expect(() => buildRewritePrompt("rewrite", { ...ctx, selection: "" })).not.toThrow();
  });

  it("handles empty instruction (edge case: empty ctx)", () => {
    const result = buildRewritePrompt("expand", { ...ctx, selection: "" });
    expect(result.prompt).toContain("扩写");
  });
});

describe("buildContinuePrompt", () => {
  it("returns valid prompt and systemPrompt", () => {
    const result = buildContinuePrompt({ title: "My Article", fullText: "Full body text." });
    expect(result.systemPrompt).toBeTruthy();
    expect(result.prompt).toContain("My Article");
    expect(result.prompt).toContain("Full body text.");
    expect(result.prompt).toContain("续写");
  });

  it("handles empty fullText without throwing", () => {
    expect(() => buildContinuePrompt({ title: "Title", fullText: "" })).not.toThrow();
  });
});

describe("buildOutlinePrompt", () => {
  it("returns valid prompt", () => {
    const result = buildOutlinePrompt({
      title: "Article Title",
      eventSummary: "Event summary here",
      controls: {},
    });
    expect(result.systemPrompt).toBeTruthy();
    expect(result.prompt).toContain("Article Title");
    expect(result.prompt).toContain("Event summary here");
  });

  it("includes audience when provided in controls", () => {
    const result = buildOutlinePrompt({
      title: "T",
      eventSummary: "E",
      controls: { audience: "技术从业者" },
    });
    expect(result.prompt).toContain("目标受众：技术从业者");
  });

  it("omits audience line when controls.audience is empty", () => {
    const result = buildOutlinePrompt({ title: "T", eventSummary: "E", controls: { audience: "" } });
    expect(result.prompt).not.toContain("目标受众");
  });
});

describe("buildParagraphPrompt", () => {
  it("returns valid prompt", () => {
    const result = buildParagraphPrompt({
      title: "Article",
      paragraph: "This paragraph.",
      before: "Before text.",
      after: "After text.",
    });
    expect(result.systemPrompt).toBeTruthy();
    expect(result.prompt).toContain("This paragraph.");
    expect(result.prompt).toContain("重写");
  });
});

describe("parseOutline", () => {
  it("parses numbered list into clean titles", () => {
    const raw = "1. Introduction\n2. Background\n3. Conclusion";
    expect(parseOutline(raw)).toEqual(["Introduction", "Background", "Conclusion"]);
  });

  it("strips heading markers", () => {
    expect(parseOutline("## Intro\n### Body")).toEqual(["Intro", "Body"]);
  });

  it("strips bullet markers", () => {
    expect(parseOutline("- Point A\n* Point B\n• Point C")).toEqual(["Point A", "Point B", "Point C"]);
  });

  it("filters empty lines", () => {
    expect(parseOutline("Title\n\n  \nBody")).toEqual(["Title", "Body"]);
  });

  it("returns empty array for empty input", () => {
    expect(parseOutline("")).toEqual([]);
  });
});

describe("serializeOutline", () => {
  it("serializes items into numbered list", () => {
    const result = serializeOutline(["Introduction", "Body", "Conclusion"]);
    expect(result).toBe("1. Introduction\n2. Body\n3. Conclusion");
  });

  it("round-trips with parseOutline", () => {
    const items = ["Section One", "Section Two", "Section Three"];
    expect(parseOutline(serializeOutline(items))).toEqual(items);
  });

  it("filters empty items", () => {
    expect(serializeOutline(["A", "", "  ", "B"])).toBe("1. A\n2. B");
  });

  it("returns empty string for empty input", () => {
    expect(serializeOutline([])).toBe("");
  });
});

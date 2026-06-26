import { describe, expect, it } from "vitest";
import {
  buildOutlinePrompt,
  parseOutline,
  serializeOutline,
} from "@/presentation/generation/editor/rewrite-actions";
import { applyControlsToPrompts } from "@/application/prompt/controls";

describe("parseOutline", () => {
  it("strips numbered, bulleted and heading markers into clean section titles", () => {
    const raw = "1. 引言\n2. 背景\n- 影响\n* 结论\n## 展望";
    expect(parseOutline(raw)).toEqual(["引言", "背景", "影响", "结论", "展望"]);
  });

  it("drops blank lines and trims whitespace", () => {
    expect(parseOutline("  A  \n\n\n  - B \n")).toEqual(["A", "B"]);
  });

  it("returns an empty array for empty or marker-only input", () => {
    expect(parseOutline("")).toEqual([]);
    expect(parseOutline("- \n# \n3. ")).toEqual([]);
  });
});

describe("serializeOutline", () => {
  it("renders a stable numbered list", () => {
    expect(serializeOutline(["引言", "背景"])).toBe("1. 引言\n2. 背景");
  });

  it("round-trips through parseOutline", () => {
    const items = ["开头", "中段", "结尾"];
    expect(parseOutline(serializeOutline(items))).toEqual(items);
  });
});

describe("buildOutlinePrompt", () => {
  it("asks for an outline (sections only, no body) seeded by title and summary", () => {
    const { systemPrompt, prompt } = buildOutlinePrompt({
      title: "My Title",
      eventSummary: "the summary",
      controls: {},
    });
    expect(prompt).toContain("My Title");
    expect(prompt).toContain("the summary");
    expect(`${systemPrompt}\n${prompt}`).toMatch(/大纲|小节|outline/i);
  });

  it("carries tone/audience controls into the outline prompt", () => {
    const { prompt, systemPrompt } = buildOutlinePrompt({
      title: "T",
      eventSummary: "S",
      controls: { audience: "投资人" },
    });
    expect(`${systemPrompt}\n${prompt}`).toContain("投资人");
  });
});

describe("outline as a generation constraint (applyControlsToPrompts)", () => {
  it("injects the confirmed outline into the user prompt", () => {
    const out = applyControlsToPrompts(
      { systemPrompt: "S", userPrompt: "U" },
      { outline: "1. 引言\n2. 结论" },
    );
    expect(out.userPrompt).toContain("U");
    expect(out.userPrompt).toContain("1. 引言");
    expect(out.userPrompt).toMatch(/大纲|逐节|小节/);
  });

  it("is a no-op when the outline is blank", () => {
    const base = { systemPrompt: "S", userPrompt: "U" };
    expect(applyControlsToPrompts(base, { outline: "   " })).toEqual(base);
  });
});

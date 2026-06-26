import { describe, expect, it } from "vitest";
import { applyControlsToPrompts } from "@/application/prompt/controls";

const base = { systemPrompt: "SYS", userPrompt: "USR", maxTokens: 4000 };

describe("applyControlsToPrompts", () => {
  it("returns the prompts byte-identical when no controls are set", () => {
    expect(applyControlsToPrompts(base, {})).toEqual(base);
    expect(applyControlsToPrompts(base, { customInstruction: "", audience: "" })).toEqual(base);
  });

  it("appends a custom instruction to the user prompt", () => {
    const out = applyControlsToPrompts(base, { customInstruction: "多用短句" });
    expect(out.userPrompt).toContain("USR");
    expect(out.userPrompt).toContain("多用短句");
    expect(out.systemPrompt).toBe("SYS");
  });

  it("injects a tone fragment into the system prompt", () => {
    const out = applyControlsToPrompts(base, { tone: "casual" });
    expect(out.systemPrompt).toContain("SYS");
    expect(out.systemPrompt).toContain("轻松");
  });

  it("adds an audience hint to the system prompt", () => {
    const out = applyControlsToPrompts(base, { audience: "高中生" });
    expect(out.systemPrompt).toContain("高中生");
  });

  it("short length tightens maxTokens and adds a length constraint", () => {
    const out = applyControlsToPrompts(base, { lengthTarget: "short" });
    expect(out.maxTokens).toBeLessThan(base.maxTokens);
    expect(out.userPrompt).toMatch(/长度|字/);
  });

  it("long length raises maxTokens above a short target", () => {
    const shortOut = applyControlsToPrompts(base, { lengthTarget: "short" });
    const longOut = applyControlsToPrompts(base, { lengthTarget: "long" });
    expect(longOut.maxTokens).toBeGreaterThan(shortOut.maxTokens!);
  });

  it("combines multiple controls without dropping the originals", () => {
    const out = applyControlsToPrompts(base, {
      customInstruction: "加小标题",
      tone: "professional",
      lengthTarget: "long",
      audience: "投资人",
    });
    expect(out.systemPrompt).toContain("SYS");
    expect(out.systemPrompt).toContain("专业");
    expect(out.systemPrompt).toContain("投资人");
    expect(out.userPrompt).toContain("USR");
    expect(out.userPrompt).toContain("加小标题");
    expect(out.maxTokens).toBeGreaterThan(base.maxTokens);
  });

  it("leaves maxTokens undefined-safe when not provided", () => {
    const out = applyControlsToPrompts({ systemPrompt: "S", userPrompt: "U" }, { tone: "friendly" });
    expect(out.maxTokens).toBeUndefined();
  });
});

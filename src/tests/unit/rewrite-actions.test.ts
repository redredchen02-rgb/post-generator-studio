import { describe, expect, it } from "vitest";
import {
  REWRITE_ACTIONS,
  availableActions,
  buildContinuePrompt,
  buildParagraphPrompt,
  buildRewritePrompt,
  replaceRange,
} from "@/presentation/generation/editor/rewrite-actions";

describe("replaceRange (replace the middle, leave head and tail byte-identical)", () => {
  const doc = "para one.\npara two.\npara three.";

  it("replaces only the selected middle range", () => {
    const from = doc.indexOf("para two.");
    const to = from + "para two.".length;
    const next = replaceRange(doc, from, to, "PARA TWO REWRITTEN");
    expect(next).toBe("para one.\nPARA TWO REWRITTEN\npara three.");
    // Head and tail untouched.
    expect(next.startsWith("para one.\n")).toBe(true);
    expect(next.endsWith("\npara three.")).toBe(true);
  });

  it("replaces a selection at the very start without spilling over", () => {
    const next = replaceRange(doc, 0, "para one.".length, "FIRST");
    expect(next).toBe("FIRST\npara two.\npara three.");
  });

  it("replaces a selection at the very end without spilling over", () => {
    const from = doc.length - "para three.".length;
    const next = replaceRange(doc, from, doc.length, "LAST");
    expect(next).toBe("para one.\npara two.\nLAST");
  });

  it("throws on an inverted or out-of-bounds range", () => {
    expect(() => replaceRange(doc, 5, 2, "x")).toThrow();
    expect(() => replaceRange(doc, 0, doc.length + 1, "x")).toThrow();
  });
});

describe("availableActions (verb filtering by selection length)", () => {
  it("offers rewrite, expand and tone for a short selection", () => {
    const ids = availableActions(10).map((a) => a.id);
    expect(ids).toContain("rewrite");
    expect(ids).toContain("expand");
    expect(ids).toContain("tone");
  });

  it("hides condense for a short selection but shows it for a long one", () => {
    expect(availableActions(10).map((a) => a.id)).not.toContain("condense");
    expect(availableActions(200).map((a) => a.id)).toContain("condense");
  });

  it("offers nothing for an empty selection", () => {
    expect(availableActions(0)).toEqual([]);
  });
});

describe("buildRewritePrompt", () => {
  const ctx = {
    title: "My Article",
    selection: "the quick brown fox",
    before: "Before. ",
    after: " After.",
  };

  it("embeds the title, selection and surrounding context", () => {
    const { prompt } = buildRewritePrompt("rewrite", ctx);
    expect(prompt).toContain("My Article");
    expect(prompt).toContain("the quick brown fox");
    expect(prompt).toContain("Before.");
    expect(prompt).toContain("After.");
  });

  it("instructs the model to return only the replacement text", () => {
    const { prompt, systemPrompt } = buildRewritePrompt("condense", ctx);
    expect(`${systemPrompt}\n${prompt}`.toLowerCase()).toMatch(/only|仅|不要解释|replacement|替换/);
  });

  it("passes the tone descriptor through for the tone action", () => {
    const { prompt } = buildRewritePrompt("tone", { ...ctx, tone: "更正式" });
    expect(prompt).toContain("更正式");
  });

  it("knows every catalog action", () => {
    for (const action of REWRITE_ACTIONS) {
      expect(() => buildRewritePrompt(action.id, ctx)).not.toThrow();
    }
  });
});

describe("buildContinuePrompt", () => {
  it("uses the whole article as context and asks only for the continuation", () => {
    const { prompt, systemPrompt } = buildContinuePrompt({ title: "T", fullText: "Existing body." });
    expect(prompt).toContain("Existing body.");
    expect(prompt).toContain("T");
    expect(`${systemPrompt}\n${prompt}`).toMatch(/续写|continue|接着|后续/i);
  });
});

describe("buildParagraphPrompt", () => {
  it("targets the paragraph with surrounding context and returns only its replacement", () => {
    const { prompt, systemPrompt } = buildParagraphPrompt({
      title: "T",
      paragraph: "the middle paragraph",
      before: "intro.",
      after: "conclusion.",
    });
    expect(prompt).toContain("the middle paragraph");
    expect(prompt).toContain("intro.");
    expect(prompt).toContain("conclusion.");
    expect(`${systemPrompt}\n${prompt}`.toLowerCase()).toMatch(/only|仅|替换|replacement/);
  });
});

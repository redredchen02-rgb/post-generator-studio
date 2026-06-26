import { describe, expect, it } from "vitest";
import { paragraphRangeAt } from "@/presentation/generation/editor/rewrite-actions";

// Three paragraphs separated by blank lines.
const doc = "First para line one.\nFirst para line two.\n\nSecond paragraph.\n\nThird paragraph here.";

describe("paragraphRangeAt", () => {
  it("returns the full multi-line paragraph containing the cursor", () => {
    const pos = doc.indexOf("line two");
    const range = paragraphRangeAt(doc, pos);
    expect(range).not.toBeNull();
    expect(doc.slice(range!.from, range!.to)).toBe("First para line one.\nFirst para line two.");
  });

  it("locates the middle paragraph without spilling into neighbours", () => {
    const pos = doc.indexOf("Second");
    const range = paragraphRangeAt(doc, pos)!;
    expect(doc.slice(range.from, range.to)).toBe("Second paragraph.");
    // Neighbours untouched on either side.
    expect(doc.slice(0, range.from)).toContain("First para");
    expect(doc.slice(range.to)).toContain("Third paragraph");
  });

  it("locates the last paragraph up to end of document", () => {
    const pos = doc.length - 2;
    const range = paragraphRangeAt(doc, pos)!;
    expect(doc.slice(range.from, range.to)).toBe("Third paragraph here.");
  });

  it("returns null when the cursor sits on a blank separator line", () => {
    const blankPos = doc.indexOf("\n\n") + 1; // the empty line between para 1 and 2
    expect(paragraphRangeAt(doc, blankPos)).toBeNull();
  });

  it("handles runs of multiple blank lines without crossing them", () => {
    const messy = "Alpha.\n\n\n\nBeta.";
    const range = paragraphRangeAt(messy, messy.indexOf("Beta"))!;
    expect(messy.slice(range.from, range.to)).toBe("Beta.");
  });

  it("returns null for an empty document", () => {
    expect(paragraphRangeAt("", 0)).toBeNull();
  });
});

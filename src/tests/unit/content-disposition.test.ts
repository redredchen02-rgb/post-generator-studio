import { describe, expect, it } from "vitest";
import { contentDisposition } from "@/lib/content-disposition";

// Headers can only hold latin1 bytes; this guards against the 500 that non-ASCII
// (e.g. Chinese) export filenames used to cause.
function assertHeaderSafe(value: string) {
  expect(() => new Headers({ "Content-Disposition": value })).not.toThrow();
}

describe("contentDisposition", () => {
  it("produces a header-safe value for ASCII filenames", () => {
    const v = contentDisposition("report-123.md");
    assertHeaderSafe(v);
    expect(v).toContain('filename="report-123.md"');
  });

  it("produces a header-safe value for Chinese filenames", () => {
    const name = "马来西亚女DJ-报告.md";
    const v = contentDisposition(name);
    assertHeaderSafe(v);
    expect(v).toContain(`filename*=UTF-8''${encodeURIComponent(name)}`);
    // ASCII fallback must not contain raw non-ASCII bytes
    const fallback = v.match(/filename="([^"]*)"/)?.[1] ?? "";
    expect(fallback).toMatch(/^[\x20-\x7e]*$/);
  });

  it("never yields an empty ASCII fallback", () => {
    const v = contentDisposition("一二三");
    assertHeaderSafe(v);
    expect(v).toContain('filename="___"');
  });

  it("escapes quotes and backslashes in the fallback", () => {
    const v = contentDisposition('a"b\\c.md');
    assertHeaderSafe(v);
    expect(v).toContain('filename="a_b_c.md"');
  });
});

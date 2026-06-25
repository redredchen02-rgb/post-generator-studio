import { describe, expect, it } from "vitest";
import {
  computeTextMetrics,
  countCjkChars,
  countLatinWords,
  englishReadabilityGrade,
  estimateReadingMinutes,
  isPredominantlyEnglish,
} from "@/lib/text-metrics";

describe("text-metrics", () => {
  it("counts CJK characters and ignores latin words for cjkChars", () => {
    expect(countCjkChars("台湾男子连续30天")).toBe(7);
    expect(countCjkChars("hello world")).toBe(0);
  });

  it("counts latin words split on whitespace", () => {
    expect(countLatinWords("hello world foo")).toBe(3);
    expect(countLatinWords("state-of-the-art don't")).toBe(2);
    expect(countLatinWords("台湾 男子")).toBe(0);
  });

  it("estimates reading time for pure Chinese at ~400 chars/min", () => {
    const text = "字".repeat(800);
    expect(estimateReadingMinutes(text)).toBe(2);
  });

  it("estimates reading time for pure English at ~200 words/min", () => {
    const text = Array.from({ length: 200 }, () => "word").join(" ");
    expect(estimateReadingMinutes(text)).toBe(1);
  });

  it("returns 0 reading minutes for empty text without throwing", () => {
    expect(estimateReadingMinutes("")).toBe(0);
    expect(computeTextMetrics("")).toEqual({
      words: 0,
      cjkChars: 0,
      readingMinutes: 0,
      readabilityGrade: null,
    });
  });

  it("strips markdown before counting words", () => {
    const md = "# 标题\n\n**正文** `code` [link](http://x)";
    const metrics = computeTextMetrics(md);
    // Heading markers, bold stars, backticks and link URL must not inflate counts.
    expect(metrics.cjkChars).toBe(4); // 标题 + 正文
    expect(metrics.words).toBeGreaterThanOrEqual(4);
  });

  it("gates readability: null for predominantly Chinese content", () => {
    expect(isPredominantlyEnglish("这是一篇中文文章，混入 a few english words.")).toBe(false);
    expect(englishReadabilityGrade("这是一篇中文文章。")).toBeNull();
  });

  it("returns an ARI grade for predominantly English content", () => {
    const grade = englishReadabilityGrade(
      "The quick brown fox jumps over the lazy dog. It was a calm and quiet morning.",
    );
    expect(grade).not.toBeNull();
    expect(grade).toBeGreaterThan(0);
  });
});

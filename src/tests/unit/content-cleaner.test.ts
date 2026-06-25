import { describe, expect, it } from "vitest";
import { cleanGeneratedContent, formatOutput } from "@/application/content/cleaner";

describe("content cleaner", () => {
  it("removes duplicate titles and self references without rewriting meaning", () => {
    const cleaned = cleanGeneratedContent(
      "# 标题\n\n作为 AI 模型，我不能透露内部配置。\n\n# 标题\n\n正文内容。\n\n\n结论。",
      "标题",
    );

    expect(cleaned.match(/# 标题/g)?.length).toBe(1);
    expect(cleaned).not.toContain("AI 模型");
    expect(cleaned).toContain("正文内容。");
  });

  it("formats plain text and simple html", () => {
    expect(formatOutput("# Title\n\n**Body**", "plain_text")).toContain("Body");
    expect(formatOutput("# Title\n\nBody", "html")).toContain("<h1>Title</h1>");
  });
});


/**
 * Business prompt builders for LLM content operations.
 *
 * Pure functions — only plain data (string, object) in, no React / Next.js /
 * Node.js imports. Safe to call in any runtime context.
 */

import type { GenerationControls } from "@/domain/schemas";

// Local redeclaration so this module has no upward dependency on presentation.
// The canonical UI-facing alias lives in presentation/generation/editor/rewrite-actions.ts.
export type RewriteActionId = "rewrite" | "expand" | "condense" | "tone";

export type RewriteContext = {
  title: string;
  selection: string;
  /** A little text before the selection, for continuity. */
  before: string;
  /** A little text after the selection, for continuity. */
  after: string;
  /** Target tone descriptor, only used by the "tone" action. */
  tone?: string;
};

const INSTRUCTIONS: Record<RewriteActionId, string> = {
  rewrite: "改写下面这段文字，使其更清晰流畅，保持原意与篇幅相近。",
  expand: "扩写下面这段文字，补充细节与例子，使其更充实。",
  condense: "精简下面这段文字，去除冗余，保留核心信息。",
  tone: "调整下面这段文字的语气，保持信息不变。",
};

const REWRITE_SYSTEM_PROMPT =
  "你是一位中文写作编辑。只返回改写后的替换文本本身，不要解释、不要加引号、不要包含前后文。";

export function buildRewritePrompt(
  id: RewriteActionId,
  ctx: RewriteContext,
): { systemPrompt: string; prompt: string } {
  const instruction = INSTRUCTIONS[id];
  if (!instruction) {
    throw new Error(`Unknown rewrite action: ${id}`);
  }
  const toneLine = id === "tone" && ctx.tone ? `\n目标语气：${ctx.tone}` : "";
  const prompt = [
    `文章标题：${ctx.title}`,
    `${instruction}${toneLine}`,
    "",
    `前文（仅供参考，不要改写）：${ctx.before}`,
    `后文（仅供参考，不要改写）：${ctx.after}`,
    "",
    "需要改写的文本：",
    ctx.selection,
    "",
    "只返回替换后的文本：",
  ].join("\n");
  return { systemPrompt: REWRITE_SYSTEM_PROMPT, prompt };
}

const CONTINUE_SYSTEM_PROMPT =
  "你是一位中文写作助手。只返回续写的后续内容，承接上文语气与主题，不要重复已有文字，不要解释。";

export function buildContinuePrompt(ctx: { title: string; fullText: string }): {
  systemPrompt: string;
  prompt: string;
} {
  const prompt = [
    `文章标题：${ctx.title}`,
    "请在下面文章的末尾续写，自然承接，只返回新增的后续内容：",
    "",
    ctx.fullText,
    "",
    "续写内容：",
  ].join("\n");
  return { systemPrompt: CONTINUE_SYSTEM_PROMPT, prompt };
}

const OUTLINE_SYSTEM_PROMPT =
  "你是一位中文写作助手。只输出文章大纲——每行一个小节标题，不要正文、不要解释、不要编号以外的修饰。";

export function buildOutlinePrompt(ctx: {
  title: string;
  eventSummary: string;
  controls: GenerationControls;
}): { systemPrompt: string; prompt: string } {
  const audience = ctx.controls.audience?.trim() ? `\n目标受众：${ctx.controls.audience.trim()}` : "";
  const prompt = [
    `文章标题：${ctx.title}`,
    `事件摘要：${ctx.eventSummary}${audience}`,
    "",
    "请为这篇文章列出 5–8 个小节的大纲，每行一个小节标题，覆盖完整结构：",
  ].join("\n");
  return { systemPrompt: OUTLINE_SYSTEM_PROMPT, prompt };
}

/** Parse a model outline reply into clean section titles (strip list/heading markers). */
export function parseOutline(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.replace(/^\s*(?:#{1,6}|[-*•]|\d+[.)])\s*/, "").trim())
    .filter((line) => line.length > 0);
}

/** Serialize edited outline items back into a stable numbered list for the constraint. */
export function serializeOutline(items: string[]): string {
  return items
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item, i) => `${i + 1}. ${item}`)
    .join("\n");
}

export function buildParagraphPrompt(ctx: {
  title: string;
  paragraph: string;
  before: string;
  after: string;
}): { systemPrompt: string; prompt: string } {
  const prompt = [
    `文章标题：${ctx.title}`,
    "重写下面这一段，保持与前后文连贯，只返回替换后的该段文本：",
    "",
    `前文（仅供参考，不要改写）：${ctx.before}`,
    `后文（仅供参考，不要改写）：${ctx.after}`,
    "",
    "需要重写的段落：",
    ctx.paragraph,
    "",
    "只返回替换后的段落：",
  ].join("\n");
  return { systemPrompt: REWRITE_SYSTEM_PROMPT, prompt };
}

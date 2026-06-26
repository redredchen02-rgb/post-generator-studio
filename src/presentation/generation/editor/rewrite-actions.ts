/**
 * Selection-rewrite action catalog and prompt builders (Unit 5).
 *
 * Each action maps a user verb (rewrite / expand / condense / tone) to a
 * completion prompt. Prompts carry the article title and a little surrounding
 * context so the model keeps continuity, but ask for ONLY the replacement text
 * so the result can be spliced straight back into the selection.
 */

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

export type RewriteAction = {
  id: RewriteActionId;
  labelKey: string;
  /** Whether this verb makes sense for a selection of the given length. */
  appliesTo: (selectionChars: number) => boolean;
};

/** Condensing a handful of words is pointless — only offer it on real spans. */
const CONDENSE_MIN_CHARS = 60;

export const REWRITE_ACTIONS: readonly RewriteAction[] = [
  { id: "rewrite", labelKey: "rewrite", appliesTo: (n) => n > 0 },
  { id: "expand", labelKey: "expand", appliesTo: (n) => n > 0 },
  { id: "condense", labelKey: "condense", appliesTo: (n) => n >= CONDENSE_MIN_CHARS },
  { id: "tone", labelKey: "tone", appliesTo: (n) => n > 0 },
];

export function availableActions(selectionChars: number): RewriteAction[] {
  if (selectionChars <= 0) return [];
  return REWRITE_ACTIONS.filter((a) => a.appliesTo(selectionChars));
}

const INSTRUCTIONS: Record<RewriteActionId, string> = {
  rewrite: "改写下面这段文字，使其更清晰流畅，保持原意与篇幅相近。",
  expand: "扩写下面这段文字，补充细节与例子，使其更充实。",
  condense: "精简下面这段文字，去除冗余，保留核心信息。",
  tone: "调整下面这段文字的语气，保持信息不变。",
};

const SYSTEM_PROMPT =
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
  return { systemPrompt: SYSTEM_PROMPT, prompt };
}

/**
 * Splice `replacement` into `[from, to)` of `doc`, leaving the head `[0, from)`
 * and tail `[to, end)` byte-identical. Throws on an inverted or out-of-bounds
 * range so a bad selection can never corrupt the document.
 */
export function replaceRange(doc: string, from: number, to: number, replacement: string): string {
  if (from < 0 || to > doc.length || from > to) {
    throw new Error(`Invalid replace range [${from}, ${to}] for length ${doc.length}`);
  }
  return doc.slice(0, from) + replacement + doc.slice(to);
}

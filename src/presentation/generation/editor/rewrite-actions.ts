/**
 * Selection-rewrite action catalog and editor utilities.
 *
 * Prompt-building functions (buildRewritePrompt, buildContinuePrompt, etc.)
 * have moved to @/application/content/prompt-builders — import them from
 * @/presentation/lib/prompt-builders in presentation components.
 *
 * This file retains only presentation-layer concerns: the action catalog,
 * UI types, and editor text helpers.
 */

import { stripCodeFence } from "@/lib/utils";

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

/**
 * Normalize a model completion before it touches the document: trim, and unwrap a
 * single enclosing markdown code fence (models often wrap a rewrite in ```), which
 * would otherwise be spliced verbatim into the prose.
 */
export function sanitizeCompletion(raw: string): string {
  return stripCodeFence(raw);
}

/**
 * The paragraph (maximal run of non-blank lines) containing `pos`, or null when
 * the cursor sits on a blank separator line or the document is empty. Used to
 * regenerate just the paragraph under the cursor without touching its neighbours.
 */
export function paragraphRangeAt(doc: string, pos: number): { from: number; to: number } | null {
  if (doc.length === 0) return null;
  const lines: { start: number; end: number; blank: boolean }[] = [];
  let start = 0;
  for (const line of doc.split("\n")) {
    const end = start + line.length;
    lines.push({ start, end, blank: line.trim() === "" });
    start = end + 1; // account for the "\n"
  }
  const clamped = Math.max(0, Math.min(pos, doc.length));
  let idx = lines.findIndex((l) => clamped >= l.start && clamped <= l.end);
  if (idx === -1) idx = lines.length - 1;
  if (lines[idx].blank) return null;

  let top = idx;
  while (top > 0 && !lines[top - 1].blank) top--;
  let bottom = idx;
  while (bottom < lines.length - 1 && !lines[bottom + 1].blank) bottom++;
  return { from: lines[top].start, to: lines[bottom].end };
}

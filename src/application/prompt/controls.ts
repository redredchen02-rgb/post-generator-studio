/**
 * Request-level generation controls → prompt fragments.
 *
 * Pure and browser-safe (no Node deps) so the same mapping drives the real
 * pipeline (generation-service) and the client-side prompt preview — one source
 * of truth for how a tone/length/audience/instruction reshapes the prompt.
 *
 * With no controls set the prompts are returned unchanged, so an empty controls
 * object is byte-identical to the pre-controls behaviour (backward compatible).
 */
import type { GenerationControls, LengthTarget, ToneOption } from "@/domain/schemas";

const TONE_FRAGMENTS: Record<ToneOption, string> = {
  professional: "请使用专业、严谨的语气。",
  casual: "请使用轻松、口语化的语气。",
  enthusiastic: "请使用热情、有感染力的语气。",
  authoritative: "请使用权威、确信的语气。",
  friendly: "请使用亲切、友好的语气。",
};

const LENGTH_TARGETS: Record<LengthTarget, { words: number; label: string; maxTokens: number }> = {
  short: { words: 400, label: "简短", maxTokens: 700 },
  medium: { words: 800, label: "适中", maxTokens: 1500 },
  long: { words: 1500, label: "详尽", maxTokens: 6000 },
};

export type PromptParts = { systemPrompt: string; userPrompt: string; maxTokens?: number };

function hasControls(c: GenerationControls): boolean {
  return Boolean(
    c.customInstruction?.trim() || c.tone || c.lengthTarget || c.audience?.trim() || c.outline?.trim(),
  );
}

/** Soft-adjust the token budget for a length target: short tightens, long raises. */
function adjustMaxTokens(current: number | undefined, target: LengthTarget): number | undefined {
  const hint = LENGTH_TARGETS[target].maxTokens;
  if (current === undefined) return hint;
  if (target === "short") return Math.min(current, hint);
  if (target === "long") return Math.max(current, hint);
  return current;
}

export function applyControlsToPrompts(parts: PromptParts, controls: GenerationControls): PromptParts {
  if (!hasControls(controls)) return parts;

  const systemAdditions: string[] = [];
  if (controls.tone) systemAdditions.push(TONE_FRAGMENTS[controls.tone]);
  if (controls.audience?.trim()) systemAdditions.push(`目标受众：${controls.audience.trim()}。`);

  const userAdditions: string[] = [];
  if (controls.customInstruction?.trim()) userAdditions.push(controls.customInstruction.trim());
  if (controls.lengthTarget) {
    const { words, label } = LENGTH_TARGETS[controls.lengthTarget];
    userAdditions.push(`目标长度：约 ${words} 字（${label}）。`);
  }
  if (controls.outline?.trim()) {
    userAdditions.push(`请严格按以下大纲组织文章，逐节展开，不要遗漏小节：\n${controls.outline.trim()}`);
  }

  const join = (head: string, adds: string[]) => (adds.length ? `${head}\n\n${adds.join("\n")}` : head);

  return {
    systemPrompt: join(parts.systemPrompt, systemAdditions),
    userPrompt: join(parts.userPrompt, userAdditions),
    maxTokens: controls.lengthTarget ? adjustMaxTokens(parts.maxTokens, controls.lengthTarget) : parts.maxTokens,
  };
}

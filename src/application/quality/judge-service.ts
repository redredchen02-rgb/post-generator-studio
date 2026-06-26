import {
  AppErrorException,
  computeOverall,
  judgeReplySchema,
  qualityScoreSchema,
  type QualityScore,
} from "@/domain/schemas";
import { completeText } from "@/application/content/completion-service";
import { getOrThrow } from "@/application/crud-helpers";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { nowIso } from "@/lib/utils";

/**
 * LLM-as-Judge quality scoring (Unit 9). Builds a strict-JSON judge prompt, runs
 * it through the one-shot completion seam, and parses the reply with Zod. The
 * overall is computed in code (never trusted from the model), and the result is
 * framed as a "test reader" suggestion — it never drives an auto-improve loop
 * (which would invite verbosity bias). See docs/optimization/generator-quality-spec.md.
 */

const JUDGE_SYSTEM_PROMPT = [
  "You are a careful editorial reviewer scoring a generated post.",
  "Score each of the five dimensions from 1 (poor) to 5 (excellent) and give a one-sentence justification.",
  "Return ONLY a JSON object, no prose, no code fence, with exactly this shape:",
  '{"relevance":{"score":1-5,"justification":"..."},"coherence":{...},"factuality":{...},"style":{...},"completeness":{...}}',
  "Dimensions: relevance (stays on topic), coherence (logical flow), factuality (accurate given the summary), style (engaging and natural), completeness (feels complete).",
].join("\n");

function buildJudgePrompt(title: string, eventSummary: string, content: string): string {
  return [
    `Topic: ${title}`,
    `Event Summary: ${eventSummary}`,
    "Generated Content:",
    content,
    "",
    "Score the five dimensions and return the JSON object.",
  ].join("\n");
}

/** Strip a single enclosing code fence, then JSON.parse + Zod. Throws an observable error on anything malformed. */
function parseJudgeReply(raw: string) {
  const text = raw.trim();
  const fenced = text.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  const body = (fenced ? fenced[1] : text).trim();
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new AppErrorException({ code: "JUDGE_PARSE_FAILED", message: "Judge model returned invalid JSON" });
  }
  const result = judgeReplySchema.safeParse(json);
  if (!result.success) {
    throw new AppErrorException({ code: "JUDGE_PARSE_FAILED", message: "Judge reply missing required dimensions or invalid format" });
  }
  return result.data;
}

async function resolvePresetId(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const presets = await getStorage().generationPresets.list();
  const preset = presets.find((p) => p.isDefault) ?? presets[0];
  if (!preset) {
    throw new AppErrorException({ code: "NO_PRESET", message: "No preset available for scoring" });
  }
  return preset.id;
}

export type ScoreOptions = { presetId?: string; providerProfileId?: string };

export async function scoreGeneration(generationId: string, opts: ScoreOptions = {}): Promise<QualityScore> {
  const generation = await getOrThrow(getStorage().generations, generationId, "Generation not found");

  const content = generation.outputContent?.trim();
  if (!content) {
    throw new AppErrorException({ code: "EMPTY_CONTENT", message: "No content available for scoring" });
  }

  const presetId = await resolvePresetId(opts.presetId);
  const completion = await completeText({
    systemPrompt: JUDGE_SYSTEM_PROMPT,
    prompt: buildJudgePrompt(generation.title, generation.eventSummary, content),
    presetId,
    providerProfileId: opts.providerProfileId,
  });

  const reply = parseJudgeReply(completion.content);
  // Conservative: when the judge model is unknown or matches the generation
  // model, treat it as self-evaluation (self-enhancement bias) so the UI can discount it.
  const selfEvaluated = Boolean(completion.model && generation.model && completion.model === generation.model);

  const score = qualityScoreSchema.parse({
    ...reply,
    overall: computeOverall(reply),
    judgeModel: completion.model,
    selfEvaluated,
    scoredAt: nowIso(),
  });

  await getStorage().generations.update(generationId, { qualityScore: score });
  return score;
}

import { z } from "zod";
import { outputFormatSchema, providerKindSchema, generationStatusSchema } from "./enums";
import { qualityScoreSchema } from "./quality";
import { DEFAULT_ENABLED_STEPS, pipelineStepIdSchema } from "@/domain/pipeline-steps";

const snapshotSchema = z.record(z.unknown());

export const generationSchema = z.object({
  id: z.string(),
  idempotencyKey: z.string().optional(),
  title: z.string(),
  eventSummary: z.string(),
  providerProfileSnapshot: snapshotSchema,
  promptTemplateSnapshot: snapshotSchema,
  generationPresetSnapshot: snapshotSchema,
  renderedSystemPrompt: z.string(),
  renderedUserPrompt: z.string(),
  outputContent: z.string().optional(),
  status: generationStatusSchema,
  errorMessage: z.string().optional(),
  model: z.string().optional(),
  providerKind: providerKindSchema.optional(),
  inputTokens: z.number().int().optional(),
  outputTokens: z.number().int().optional(),
  totalTokens: z.number().int().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  createdAt: z.string(),
  activeDraftId: z.string().optional(),
  qualityScore: qualityScoreSchema.optional(),
});
export type Generation = z.infer<typeof generationSchema>;

export const draftKindSchema = z.enum(["working", "snapshot"]);
export const draftSourceSchema = z.enum(["generated", "edited", "rewrite"]);

export const generationDraftSchema = z.object({
  id: z.string(),
  generationId: z.string(),
  label: z.string().optional(),
  content: z.string(),
  kind: draftKindSchema,
  source: draftSourceSchema,
  createdAt: z.string(),
});
export type GenerationDraft = z.infer<typeof generationDraftSchema>;
export type DraftKind = z.infer<typeof draftKindSchema>;
export type DraftSource = z.infer<typeof draftSourceSchema>;

/** Request-level generation controls — not persisted into a preset. */
export const toneOptionSchema = z.enum([
  "professional",
  "casual",
  "enthusiastic",
  "authoritative",
  "friendly",
]);
export const lengthTargetSchema = z.enum(["short", "medium", "long"]);
export const generationControlsSchema = z.object({
  customInstruction: z.string().optional(),
  tone: toneOptionSchema.optional(),
  lengthTarget: lengthTargetSchema.optional(),
  audience: z.string().optional(),
  /** Confirmed outline (serialized) injected as a structure constraint (Unit 8). */
  outline: z.string().optional(),
});
export type ToneOption = z.infer<typeof toneOptionSchema>;
export type LengthTarget = z.infer<typeof lengthTargetSchema>;
export type GenerationControls = z.infer<typeof generationControlsSchema>;

export const generationRequestSchema = z.object({
  title: z.string().min(1, "Title is required"),
  eventSummary: z.string().min(1, "Event summary is required"),
  presetId: z.string().min(1),
  providerProfileId: z.string().optional(),
  idempotencyKey: z.string().min(1).optional(),
  customVariables: z.record(z.string()).optional(),
  customInstruction: z.string().optional(),
  tone: toneOptionSchema.optional(),
  lengthTarget: lengthTargetSchema.optional(),
  audience: z.string().optional(),
  outline: z.string().optional(),
});
export type GenerationRequest = z.infer<typeof generationRequestSchema>;

export const generationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().optional(),
  offset: z.coerce.number().int().min(0).default(0),
});

export const normalizedGenerationRequestSchema = z.object({
  systemPrompt: z.string(),
  userPrompt: z.string(),
  model: z.string(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(1).max(200_000),
  stream: z.boolean(),
});
export type NormalizedGenerationRequest = z.infer<typeof normalizedGenerationRequestSchema>;

export const generationEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("token"), value: z.string() }),
  z.object({
    type: z.literal("metadata"),
    model: z.string().optional(),
    inputTokens: z.number().int().optional(),
    outputTokens: z.number().int().optional(),
  }),
  z.object({ type: z.literal("complete") }),
  z.object({ type: z.literal("error"), message: z.string(), retryable: z.boolean().optional() }),
]);
export type GenerationEvent = z.infer<typeof generationEventSchema>;

export const generationPresetSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  providerProfileId: z.string(),
  promptTemplateId: z.string(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(200_000).optional(),
  locale: z.string().min(1),
  outputFormat: outputFormatSchema,
  // READ schema: intentionally lenient (z.string, not the enum). A stored row may
  // carry a stale/unknown step id; rejecting it here would throw on parse and brick
  // the whole preset list for local-first users. Unknown ids are harmless at runtime
  // (the gating Set never matches them) and are stripped+warned in the repo read path.
  enabledPipelineSteps: z.array(z.string()),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type GenerationPreset = z.infer<typeof generationPresetSchema>;

export const generationPresetCreateSchema = z.object({
  name: z.string().min(1),
  providerProfileId: z.string(),
  promptTemplateId: z.string(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(200_000).optional(),
  locale: z.string().min(1).default("zh-CN"),
  outputFormat: outputFormatSchema.default("markdown"),
  // WRITE schema: strict enum — reject typo'd / unknown steps when creating or
  // updating a preset, so no new bad data enters. (Update schema inherits this via .partial().)
  enabledPipelineSteps: z.array(pipelineStepIdSchema).default([...DEFAULT_ENABLED_STEPS]),
  isDefault: z.boolean().default(false),
});
export type GenerationPresetCreate = z.infer<typeof generationPresetCreateSchema>;

export const generationPresetUpdateSchema = generationPresetCreateSchema.partial();
export type GenerationPresetUpdate = z.infer<typeof generationPresetUpdateSchema>;

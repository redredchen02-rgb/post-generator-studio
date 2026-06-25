import { z } from "zod";

export const outputFormatSchema = z.enum(["markdown", "plain_text", "html"]);
export type OutputFormat = z.infer<typeof outputFormatSchema>;

export const providerKindSchema = z.enum([
  "openai",
  "anthropic",
  "gemini",
  "ollama",
  "openrouter",
  "openai-compatible",
]);
export type ProviderKind = z.infer<typeof providerKindSchema>;

export const generationStatusSchema = z.enum([
  "queued",
  "streaming",
  "completed",
  "failed",
  "cancelled",
]);
export type GenerationStatus = z.infer<typeof generationStatusSchema>;

export const appErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  retryable: z.boolean().optional(),
});
export type AppError = z.infer<typeof appErrorSchema>;

export class AppErrorException extends Error {
  readonly appError: AppError;

  constructor(error: AppError) {
    super(error.message);
    this.name = "AppErrorException";
    this.appError = error;
  }
}

export const providerProfileSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  providerKind: providerKindSchema,
  baseUrl: z.string().url().optional().or(z.literal("")),
  model: z.string().min(1),
  apiKeyRef: z.string().optional(),
  keyMasked: z.string().optional(),
  defaultTemperature: z.number().min(0).max(2),
  defaultMaxTokens: z.number().int().min(1).max(200_000),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProviderProfile = z.infer<typeof providerProfileSchema>;

export const providerProfileCreateSchema = z.object({
  name: z.string().min(1),
  providerKind: providerKindSchema,
  baseUrl: z.string().url().optional().or(z.literal("")),
  model: z.string().min(1),
  apiKey: z.string().optional(),
  defaultTemperature: z.number().min(0).max(2).default(0.7),
  defaultMaxTokens: z.number().int().min(1).max(200_000).default(3000),
  enabled: z.boolean().default(false),
});
export type ProviderProfileCreate = z.infer<typeof providerProfileCreateSchema>;

export const providerProfileUpdateSchema = providerProfileCreateSchema.partial().extend({
  apiKey: z.string().optional(),
  clearApiKey: z.boolean().optional(),
});
export type ProviderProfileUpdate = z.infer<typeof providerProfileUpdateSchema>;

export const promptTemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  systemPrompt: z.string().min(1),
  userPromptTemplate: z.string().min(1),
  supportedVariables: z.array(z.string()),
  outputFormat: outputFormatSchema,
  version: z.number().int().min(1),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PromptTemplate = z.infer<typeof promptTemplateSchema>;

export const promptTemplateCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  systemPrompt: z.string().min(1),
  userPromptTemplate: z.string().min(1),
  supportedVariables: z.array(z.string()).default(["TITLE", "EVENT_SUMMARY", "DATE", "TIME", "LOCALE"]),
  outputFormat: outputFormatSchema.default("markdown"),
  isDefault: z.boolean().default(false),
});
export type PromptTemplateCreate = z.infer<typeof promptTemplateCreateSchema>;

export const promptTemplateUpdateSchema = promptTemplateCreateSchema.partial().extend({
  duplicateFromId: z.string().optional(),
});
export type PromptTemplateUpdate = z.infer<typeof promptTemplateUpdateSchema>;

export const generationPresetSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  providerProfileId: z.string(),
  promptTemplateId: z.string(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(200_000).optional(),
  locale: z.string().min(1),
  outputFormat: outputFormatSchema,
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
  enabledPipelineSteps: z.array(z.string()).default([
    "build-context",
    "render-prompt",
    "clean-content",
    "format-output",
  ]),
  isDefault: z.boolean().default(false),
});
export type GenerationPresetCreate = z.infer<typeof generationPresetCreateSchema>;

export const generationPresetUpdateSchema = generationPresetCreateSchema.partial();
export type GenerationPresetUpdate = z.infer<typeof generationPresetUpdateSchema>;

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
});
export type Generation = z.infer<typeof generationSchema>;

export const generationRequestSchema = z.object({
  title: z.string().min(1, "Title is required"),
  eventSummary: z.string().min(1, "Event summary is required"),
  presetId: z.string().min(1),
  providerProfileId: z.string().optional(),
  idempotencyKey: z.string().min(1).optional(),
});
export type GenerationRequest = z.infer<typeof generationRequestSchema>;

export const generationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
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

export const providerCapabilitiesSchema = z.object({
  supportsStreaming: z.boolean(),
  supportsModelList: z.boolean(),
  requiresApiKey: z.boolean(),
  supportsSystemPrompt: z.boolean(),
});
export type ProviderCapabilities = z.infer<typeof providerCapabilitiesSchema>;

export const providerValidationResultSchema = z.object({
  ok: z.boolean(),
  error: appErrorSchema.optional(),
});
export type ProviderValidationResult = z.infer<typeof providerValidationResultSchema>;

export const providerModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
});
export type ProviderModel = z.infer<typeof providerModelSchema>;

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

export const promptPreviewRequestSchema = z.object({
  templateId: z.string().optional(),
  systemPrompt: z.string().optional(),
  userPromptTemplate: z.string().optional(),
  title: z.string().default("台湾男子连续30天挑战AI创业"),
  eventSummary: z.string().default("- 连续30天开发AI产品\n- 使用 Claude Code 与 OpenAI Agent\n- 每天公开开发日志"),
  locale: z.string().default("zh-CN"),
});
export type PromptPreviewRequest = z.infer<typeof promptPreviewRequestSchema>;


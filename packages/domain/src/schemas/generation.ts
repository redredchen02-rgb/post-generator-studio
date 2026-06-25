import { z } from "zod";
import { outputFormatSchema, providerKindSchema, generationStatusSchema } from "./enums.js";
const snapshotSchema = z.record(z.unknown());
export const generationSchema = z.object({ id: z.string(), idempotencyKey: z.string().optional(), title: z.string(), eventSummary: z.string(), providerProfileSnapshot: snapshotSchema, promptTemplateSnapshot: snapshotSchema, generationPresetSnapshot: snapshotSchema, renderedSystemPrompt: z.string(), renderedUserPrompt: z.string(), outputContent: z.string().optional(), status: generationStatusSchema, errorMessage: z.string().optional(), model: z.string().optional(), providerKind: providerKindSchema.optional(), inputTokens: z.number().int().optional(), outputTokens: z.number().int().optional(), totalTokens: z.number().int().optional(), startedAt: z.string().optional(), completedAt: z.string().optional(), createdAt: z.string() });
export type Generation = z.infer<typeof generationSchema>;
export const customVariableValueSchema = z.string().refine(
  v => !v.includes("{{") && !v.includes("}}"),
  { message: "customVariables value cannot contain {{ or }}" }
);
export const generationRequestSchema = z.object({ title: z.string().min(1, "Title is required"), eventSummary: z.string().min(1, "Event summary is required"), presetId: z.string().min(1), providerProfileId: z.string().optional(), idempotencyKey: z.string().min(1).optional(), customVariables: z.record(customVariableValueSchema).optional() });
export type GenerationRequest = z.infer<typeof generationRequestSchema>;
export const generationListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), offset: z.coerce.number().int().min(0).default(0), search: z.string().optional() });
export const normalizedGenerationRequestSchema = z.object({ systemPrompt: z.string(), userPrompt: z.string(), model: z.string(), temperature: z.number().min(0).max(2), maxTokens: z.number().int().min(1).max(200_000), stream: z.boolean() });
export type NormalizedGenerationRequest = z.infer<typeof normalizedGenerationRequestSchema>;
export const generationEventSchema = z.discriminatedUnion("type", [z.object({ type: z.literal("token"), value: z.string() }), z.object({ type: z.literal("metadata"), model: z.string().optional(), inputTokens: z.number().int().optional(), outputTokens: z.number().int().optional() }), z.object({ type: z.literal("complete") }), z.object({ type: z.literal("error"), message: z.string(), retryable: z.boolean().optional() })]);
export type GenerationEvent = z.infer<typeof generationEventSchema>;
export const generationPresetSchema = z.object({ id: z.string(), name: z.string().min(1), providerProfileId: z.string(), promptTemplateId: z.string(), temperature: z.number().min(0).max(2).optional(), maxTokens: z.number().int().min(1).max(200_000).optional(), locale: z.string().min(1), outputFormat: outputFormatSchema, enabledPipelineSteps: z.array(z.string()), isDefault: z.boolean(), createdAt: z.string(), updatedAt: z.string() });
export type GenerationPreset = z.infer<typeof generationPresetSchema>;
export const generationPresetCreateSchema = z.object({ name: z.string().min(1), providerProfileId: z.string(), promptTemplateId: z.string(), temperature: z.number().min(0).max(2).optional(), maxTokens: z.number().int().min(1).max(200_000).optional(), locale: z.string().min(1).default("zh-CN"), outputFormat: outputFormatSchema.default("markdown"), enabledPipelineSteps: z.array(z.string()).default(["build-context","render-prompt","clean-content","format-output"]), isDefault: z.boolean().default(false) });
export type GenerationPresetCreate = z.infer<typeof generationPresetCreateSchema>;
export const generationPresetUpdateSchema = generationPresetCreateSchema.partial();
export type GenerationPresetUpdate = z.infer<typeof generationPresetUpdateSchema>;

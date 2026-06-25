import { z } from "zod";
import { providerKindSchema } from "./enums";
import { appErrorSchema } from "./error";

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

export const providerCapabilitiesSchema = z.object({
  supportsStreaming: z.boolean(),
  supportsModelList: z.boolean(),
  requiresApiKey: z.boolean(),
  supportsSystemPrompt: z.boolean(),
  supportsCompletion: z.boolean(),
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

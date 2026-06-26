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
  "grok",
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

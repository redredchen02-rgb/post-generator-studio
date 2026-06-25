import { z } from "zod";
import { outputFormatSchema } from "./enums";

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

export const promptPreviewRequestSchema = z.object({
  templateId: z.string().optional(),
  systemPrompt: z.string().optional(),
  userPromptTemplate: z.string().optional(),
  title: z.string().default("台湾男子连续30天挑战AI创业"),
  eventSummary: z.string().default("- 连续30天开发AI产品\n- 使用 Claude Code 与 OpenAI Agent\n- 每天公开开发日志"),
  locale: z.string().default("zh-CN"),
  customVariables: z.record(z.string()).optional(),
});
export type PromptPreviewRequest = z.infer<typeof promptPreviewRequestSchema>;

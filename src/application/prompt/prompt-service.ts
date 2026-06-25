import { createId } from "@/lib/utils";
import {
  promptPreviewRequestSchema,
  promptTemplateCreateSchema,
  promptTemplateUpdateSchema,
  type PromptTemplate,
} from "@/domain/schemas";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { assertSupportedVariables, renderTemplate } from "@/application/prompt/renderer";
import { resolvePromptVariables } from "@/application/prompt/variables";
import { getOrThrow } from "@/application/crud-helpers";

export async function listPromptTemplates(): Promise<PromptTemplate[]> {
  return getStorage().promptTemplates.list();
}

export async function getPromptTemplate(id: string): Promise<PromptTemplate> {
  return getOrThrow(getStorage().promptTemplates, id, "提示词模板不存在");
}

export async function createPromptTemplate(input: unknown): Promise<PromptTemplate> {
  const parsed = promptTemplateCreateSchema.parse(input);
  assertSupportedVariables(parsed.systemPrompt, parsed.supportedVariables);
  assertSupportedVariables(parsed.userPromptTemplate, parsed.supportedVariables);
  return getStorage().promptTemplates.create({ ...parsed, id: createId("template") });
}

export async function updatePromptTemplate(id: string, input: unknown): Promise<PromptTemplate> {
  const parsed = promptTemplateUpdateSchema.parse(input);
  const existing = await getPromptTemplate(id);
  const supportedVariables = parsed.supportedVariables ?? existing.supportedVariables;
  assertSupportedVariables(parsed.systemPrompt ?? existing.systemPrompt, supportedVariables);
  assertSupportedVariables(parsed.userPromptTemplate ?? existing.userPromptTemplate, supportedVariables);
  return getStorage().promptTemplates.update(id, parsed);
}

export async function deletePromptTemplate(id: string): Promise<void> {
  await getStorage().promptTemplates.delete(id);
}

export async function previewPrompt(input: unknown): Promise<{ systemPrompt: string; userPrompt: string }> {
  const parsed = promptPreviewRequestSchema.parse(input);
  const variables = {
    ...resolvePromptVariables({ title: parsed.title, eventSummary: parsed.eventSummary }, { locale: parsed.locale }),
    ...parsed.customVariables,
  };
  let systemPrompt = parsed.systemPrompt || "";
  let userPromptTemplate = parsed.userPromptTemplate || "";
  if (parsed.templateId) {
    const template = await getPromptTemplate(parsed.templateId);
    systemPrompt = parsed.systemPrompt ?? template.systemPrompt;
    userPromptTemplate = parsed.userPromptTemplate ?? template.userPromptTemplate;
  }
  return {
    systemPrompt: renderTemplate(systemPrompt, variables).content,
    userPrompt: renderTemplate(userPromptTemplate, variables).content,
  };
}


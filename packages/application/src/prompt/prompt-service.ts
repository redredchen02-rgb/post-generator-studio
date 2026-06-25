import { createId } from "../utils.js";
import { promptPreviewRequestSchema, promptTemplateCreateSchema, promptTemplateUpdateSchema, type PromptTemplate, type StoragePort } from "@postgen/domain";
import { AppErrorException } from "@postgen/domain";
import { assertSupportedVariables, renderTemplate } from "./renderer.js";
import { resolvePromptVariables } from "./variables.js";
export type PromptDeps = { storage: StoragePort; };
export function createPromptService(deps: PromptDeps) {
  const { storage } = deps;
  async function listPromptTemplates(): Promise<PromptTemplate[]> { return storage.promptTemplates.list(); }
  async function getPromptTemplate(id: string): Promise<PromptTemplate> { const t = await storage.promptTemplates.get(id); if (!t) throw new AppErrorException({ code: "NOT_FOUND", message: "提示词模板不存在" }); return t; }
  async function createPromptTemplate(input: unknown): Promise<PromptTemplate> { const parsed = promptTemplateCreateSchema.parse(input); assertSupportedVariables(parsed.systemPrompt, parsed.supportedVariables); assertSupportedVariables(parsed.userPromptTemplate, parsed.supportedVariables); return storage.promptTemplates.create({ ...parsed, id: createId("template") }); }
  async function updatePromptTemplate(id: string, input: unknown): Promise<PromptTemplate> { const parsed = promptTemplateUpdateSchema.parse(input); const existing = await getPromptTemplate(id); const sv = parsed.supportedVariables ?? existing.supportedVariables; assertSupportedVariables(parsed.systemPrompt ?? existing.systemPrompt, sv); assertSupportedVariables(parsed.userPromptTemplate ?? existing.userPromptTemplate, sv); return storage.promptTemplates.update(id, parsed); }
  async function deletePromptTemplate(id: string): Promise<void> { await storage.promptTemplates.delete(id); }
  async function previewPrompt(input: unknown): Promise<{ systemPrompt: string; userPrompt: string }> { const parsed = promptPreviewRequestSchema.parse(input); const variables = resolvePromptVariables({ title: parsed.title, eventSummary: parsed.eventSummary, customVariables: parsed.customVariables }, { locale: parsed.locale }); let sp = parsed.systemPrompt || ""; let upt = parsed.userPromptTemplate || ""; if (parsed.templateId) { const t = await getPromptTemplate(parsed.templateId); sp = parsed.systemPrompt ?? t.systemPrompt; upt = parsed.userPromptTemplate ?? t.userPromptTemplate; } return { systemPrompt: renderTemplate(sp, variables).content, userPrompt: renderTemplate(upt, variables).content }; }
  return { listPromptTemplates, getPromptTemplate, createPromptTemplate, updatePromptTemplate, deletePromptTemplate, previewPrompt };
}
export type PromptService = ReturnType<typeof createPromptService>;

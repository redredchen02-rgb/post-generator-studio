import { desc, eq } from "drizzle-orm";
import { createId, nowIso, parseJson } from "@postgen/domain";
import { promptTemplateSchema, type PromptTemplate, type PromptTemplateCreate, type PromptTemplateUpdate } from "@postgen/domain";
import type { PromptTemplateRepository } from "@postgen/domain";
import { getDb } from "./db";
import { notFound } from "./errors";
import { promptTemplates, promptTemplateVersions } from "./schema";

type TemplateRow = typeof promptTemplates.$inferSelect;

function templateFromRow(row: TemplateRow): PromptTemplate {
  return promptTemplateSchema.parse({
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    systemPrompt: row.systemPrompt,
    userPromptTemplate: row.userPromptTemplate,
    supportedVariables: parseJson<string[]>(row.supportedVariables, []),
    customVariableDefaults: parseJson<Record<string, string>>(row.customVariableDefaults, {}),
    outputFormat: row.outputFormat,
    version: row.version,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class SqlitePromptTemplateRepository implements PromptTemplateRepository {
  async list(): Promise<PromptTemplate[]> {
    const db = await getDb();
    const rows = await db.select().from(promptTemplates).orderBy(desc(promptTemplates.updatedAt));
    return rows.map(templateFromRow);
  }

  async get(id: string): Promise<PromptTemplate | null> {
    const db = await getDb();
    const rows = await db.select().from(promptTemplates).where(eq(promptTemplates.id, id)).limit(1);
    return rows[0] ? templateFromRow(rows[0]) : null;
  }

  async create(input: PromptTemplateCreate & { id: string }): Promise<PromptTemplate> {
    const db = await getDb();
    const timestamp = nowIso();
    if (input.isDefault) {
      await db.update(promptTemplates).set({ isDefault: false });
    }
    await db.insert(promptTemplates).values({
      id: input.id,
      name: input.name,
      description: input.description || null,
      systemPrompt: input.systemPrompt,
      userPromptTemplate: input.userPromptTemplate,
      supportedVariables: JSON.stringify(input.supportedVariables),
      customVariableDefaults: JSON.stringify(input.customVariableDefaults ?? {}),
      outputFormat: input.outputFormat,
      version: 1,
      isDefault: input.isDefault,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const created = await this.get(input.id);
    return created ?? notFound("Prompt template");
  }

  async update(id: string, input: PromptTemplateUpdate): Promise<PromptTemplate> {
    const existing = await this.get(id);
    if (!existing) {
      notFound("Prompt template");
    }
    const db = await getDb();
    if (input.isDefault) {
      await db.update(promptTemplates).set({ isDefault: false });
    }
    const nextVersion = input.systemPrompt || input.userPromptTemplate ? existing.version + 1 : existing.version;
    if (nextVersion !== existing.version) {
      await db.insert(promptTemplateVersions).values({
        id: createId("template_version"),
        templateId: existing.id,
        version: existing.version,
        snapshot: JSON.stringify(existing),
        createdAt: nowIso(),
      });
    }
    await db
      .update(promptTemplates)
      .set({
        name: input.name ?? existing.name,
        description: input.description ?? existing.description ?? null,
        systemPrompt: input.systemPrompt ?? existing.systemPrompt,
        userPromptTemplate: input.userPromptTemplate ?? existing.userPromptTemplate,
        supportedVariables: JSON.stringify(input.supportedVariables ?? existing.supportedVariables),
        customVariableDefaults: JSON.stringify(input.customVariableDefaults ?? existing.customVariableDefaults),
        outputFormat: input.outputFormat ?? existing.outputFormat,
        version: nextVersion,
        isDefault: input.isDefault ?? existing.isDefault,
        updatedAt: nowIso(),
      })
      .where(eq(promptTemplates.id, id));
    const updated = await this.get(id);
    return updated ?? notFound("Prompt template");
  }

  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.delete(promptTemplates).where(eq(promptTemplates.id, id));
  }
}

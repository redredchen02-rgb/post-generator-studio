import { desc, eq } from "drizzle-orm";
import { createId, nowIso, parseJson } from "@/lib/utils";
import { promptTemplateSchema, type PromptTemplate, type PromptTemplateCreate, type PromptTemplateUpdate } from "@/domain/schemas";
import type { PromptTemplateRepository } from "@/domain/ports/storage";
import { conflict, isForeignKeyConstraintError, notFound } from "@/infrastructure/storage/repo-utils";
import { getDb } from "@/infrastructure/storage/db";
import { promptTemplates, promptTemplateVersions } from "@/infrastructure/storage/schema";

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
    // Atomic clear-then-set of the default flag (see preset repo for rationale).
    db.transaction((tx) => {
      if (input.isDefault) {
        tx.update(promptTemplates).set({ isDefault: false }).run();
      }
      tx.insert(promptTemplates)
        .values({
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
        })
        .run();
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
    const timestamp = nowIso();
    const nextVersion = input.systemPrompt || input.userPromptTemplate ? existing.version + 1 : existing.version;
    // Snapshot the old version and apply the update in one transaction so the
    // version history can never end up missing a snapshot or orphaning one if a
    // mid-sequence write fails.
    db.transaction((tx) => {
      if (input.isDefault) {
        tx.update(promptTemplates).set({ isDefault: false }).run();
      }
      if (nextVersion !== existing.version) {
        tx.insert(promptTemplateVersions)
          .values({
            id: createId("template_version"),
            templateId: existing.id,
            version: existing.version,
            snapshot: JSON.stringify(existing),
            createdAt: timestamp,
          })
          .run();
      }
      tx.update(promptTemplates)
        .set({
          name: input.name ?? existing.name,
          description: input.description ?? existing.description ?? null,
          systemPrompt: input.systemPrompt ?? existing.systemPrompt,
          userPromptTemplate: input.userPromptTemplate ?? existing.userPromptTemplate,
          supportedVariables: JSON.stringify(input.supportedVariables ?? existing.supportedVariables),
          customVariableDefaults: JSON.stringify(input.customVariableDefaults ?? existing.customVariableDefaults ?? {}),
          outputFormat: input.outputFormat ?? existing.outputFormat,
          version: nextVersion,
          isDefault: input.isDefault ?? existing.isDefault,
          updatedAt: timestamp,
        })
        .where(eq(promptTemplates.id, id))
        .run();
    });
    const updated = await this.get(id);
    return updated ?? notFound("Prompt template");
  }

  async delete(id: string): Promise<void> {
    const db = await getDb();
    try {
      await db.delete(promptTemplates).where(eq(promptTemplates.id, id));
    } catch (error) {
      if (isForeignKeyConstraintError(error)) {
        conflict("无法删除该模板：仍有生成预设在使用它，请先移除相关预设。");
      }
      throw error;
    }
  }
}

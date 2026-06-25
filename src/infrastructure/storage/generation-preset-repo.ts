import { desc, eq } from "drizzle-orm";
import { nowIso, parseJson } from "@/lib/utils";
import { generationPresetSchema, type GenerationPreset, type GenerationPresetCreate, type GenerationPresetUpdate } from "@/domain/schemas";
import type { GenerationPresetRepository } from "@/domain/ports/storage";
import { AppErrorException } from "@/domain/schemas";
import { getDb } from "@/infrastructure/storage/db";
import { generationPresets } from "@/infrastructure/storage/schema";

type PresetRow = typeof generationPresets.$inferSelect;

function presetFromRow(row: PresetRow): GenerationPreset {
  return generationPresetSchema.parse({
    id: row.id,
    name: row.name,
    providerProfileId: row.providerProfileId,
    promptTemplateId: row.promptTemplateId,
    temperature: row.temperature ?? undefined,
    maxTokens: row.maxTokens ?? undefined,
    locale: row.locale,
    outputFormat: row.outputFormat,
    enabledPipelineSteps: parseJson<string[]>(row.enabledPipelineSteps, []),
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function notFound(entity: string): never {
  throw new AppErrorException({ code: "NOT_FOUND", message: `${entity} not found` });
}

export class SqliteGenerationPresetRepository implements GenerationPresetRepository {
  async list(): Promise<GenerationPreset[]> {
    const db = await getDb();
    const rows = await db.select().from(generationPresets).orderBy(desc(generationPresets.updatedAt));
    return rows.map(presetFromRow);
  }

  async get(id: string): Promise<GenerationPreset | null> {
    const db = await getDb();
    const rows = await db.select().from(generationPresets).where(eq(generationPresets.id, id)).limit(1);
    return rows[0] ? presetFromRow(rows[0]) : null;
  }

  async create(input: GenerationPresetCreate & { id: string }): Promise<GenerationPreset> {
    const db = await getDb();
    const timestamp = nowIso();
    if (input.isDefault) {
      await db.update(generationPresets).set({ isDefault: false });
    }
    await db.insert(generationPresets).values({
      id: input.id,
      name: input.name,
      providerProfileId: input.providerProfileId,
      promptTemplateId: input.promptTemplateId,
      temperature: input.temperature ?? null,
      maxTokens: input.maxTokens ?? null,
      locale: input.locale,
      outputFormat: input.outputFormat,
      enabledPipelineSteps: JSON.stringify(input.enabledPipelineSteps),
      isDefault: input.isDefault,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const created = await this.get(input.id);
    return created ?? notFound("Generation preset");
  }

  async update(id: string, input: GenerationPresetUpdate): Promise<GenerationPreset> {
    const existing = await this.get(id);
    if (!existing) {
      notFound("Generation preset");
    }
    const db = await getDb();
    if (input.isDefault) {
      await db.update(generationPresets).set({ isDefault: false });
    }
    await db
      .update(generationPresets)
      .set({
        name: input.name ?? existing.name,
        providerProfileId: input.providerProfileId ?? existing.providerProfileId,
        promptTemplateId: input.promptTemplateId ?? existing.promptTemplateId,
        temperature: input.temperature ?? existing.temperature ?? null,
        maxTokens: input.maxTokens ?? existing.maxTokens ?? null,
        locale: input.locale ?? existing.locale,
        outputFormat: input.outputFormat ?? existing.outputFormat,
        enabledPipelineSteps: JSON.stringify(input.enabledPipelineSteps ?? existing.enabledPipelineSteps),
        isDefault: input.isDefault ?? existing.isDefault,
        updatedAt: nowIso(),
      })
      .where(eq(generationPresets.id, id));
    const updated = await this.get(id);
    return updated ?? notFound("Generation preset");
  }

  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.delete(generationPresets).where(eq(generationPresets.id, id));
  }
}

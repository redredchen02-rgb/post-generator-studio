import { desc, eq } from "drizzle-orm";
import { nowIso } from "@/lib/utils";
import { providerProfileSchema, type ProviderProfile, type ProviderProfileCreate, type ProviderProfileUpdate } from "@/domain/schemas";
import type { ProviderProfileRepository } from "@/domain/ports/storage";
import { conflict, isForeignKeyConstraintError, notFound } from "@/infrastructure/storage/repo-utils";
import { getDb } from "@/infrastructure/storage/db";
import { providerProfiles } from "@/infrastructure/storage/schema";

type ProviderRow = typeof providerProfiles.$inferSelect;

function providerFromRow(row: ProviderRow): ProviderProfile {
  return providerProfileSchema.parse({
    id: row.id,
    name: row.name,
    providerKind: row.providerKind,
    baseUrl: row.baseUrl || undefined,
    model: row.model,
    apiKeyRef: row.apiKeyRef || undefined,
    keyMasked: row.keyMasked || undefined,
    defaultTemperature: row.defaultTemperature,
    defaultMaxTokens: row.defaultMaxTokens,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class SqliteProviderProfileRepository implements ProviderProfileRepository {
  async list(): Promise<ProviderProfile[]> {
    const db = await getDb();
    const rows = await db.select().from(providerProfiles).orderBy(desc(providerProfiles.updatedAt));
    return rows.map(providerFromRow);
  }

  async get(id: string): Promise<ProviderProfile | null> {
    const db = await getDb();
    const rows = await db.select().from(providerProfiles).where(eq(providerProfiles.id, id)).limit(1);
    return rows[0] ? providerFromRow(rows[0]) : null;
  }

  async create(input: ProviderProfileCreate & { id: string; apiKeyRef?: string; keyMasked?: string }): Promise<ProviderProfile> {
    const db = await getDb();
    const timestamp = nowIso();
    await db.insert(providerProfiles).values({
      id: input.id,
      name: input.name,
      providerKind: input.providerKind,
      baseUrl: input.baseUrl || null,
      model: input.model,
      apiKeyRef: input.apiKeyRef || null,
      keyMasked: input.keyMasked || null,
      defaultTemperature: input.defaultTemperature,
      defaultMaxTokens: input.defaultMaxTokens,
      enabled: input.enabled,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const created = await this.get(input.id);
    return created ?? notFound("Provider profile");
  }

  async update(id: string, input: ProviderProfileUpdate & { apiKeyRef?: string; keyMasked?: string | null }): Promise<ProviderProfile> {
    const existing = await this.get(id);
    if (!existing) {
      notFound("Provider profile");
    }
    const db = await getDb();
    await db
      .update(providerProfiles)
      .set({
        name: input.name ?? existing.name,
        providerKind: input.providerKind ?? existing.providerKind,
        baseUrl: input.baseUrl ?? existing.baseUrl ?? null,
        model: input.model ?? existing.model,
        apiKeyRef: input.clearApiKey ? null : input.apiKeyRef ?? existing.apiKeyRef ?? null,
        keyMasked: input.clearApiKey ? null : input.keyMasked === null ? null : input.keyMasked ?? existing.keyMasked ?? null,
        defaultTemperature: input.defaultTemperature ?? existing.defaultTemperature,
        defaultMaxTokens: input.defaultMaxTokens ?? existing.defaultMaxTokens,
        enabled: input.enabled ?? existing.enabled,
        updatedAt: nowIso(),
      })
      .where(eq(providerProfiles.id, id));
    const updated = await this.get(id);
    return updated ?? notFound("Provider profile");
  }

  async delete(id: string): Promise<void> {
    const db = await getDb();
    try {
      await db.delete(providerProfiles).where(eq(providerProfiles.id, id));
    } catch (error) {
      if (isForeignKeyConstraintError(error)) {
        conflict("无法删除该 Provider：仍有生成预设在使用它，请先移除相关预设。");
      }
      throw error;
    }
  }
}

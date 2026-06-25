import { count, desc, eq, sql } from "drizzle-orm";
import { nowIso, parseJson } from "@postgen/domain";
import { generationSchema, type Generation } from "@postgen/domain";
import type { GenerationCreateInput, GenerationRepository, GenerationUpdateInput } from "@postgen/domain";
import { getDb } from "./db";
import { notFound } from "./errors";
import { generations } from "./schema";

type GenerationRow = typeof generations.$inferSelect;

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function generationFromRow(row: GenerationRow): Generation {
  return generationSchema.parse({
    id: row.id,
    idempotencyKey: row.idempotencyKey || undefined,
    title: row.title,
    eventSummary: row.eventSummary,
    providerProfileSnapshot: parseJson<Record<string, unknown>>(row.providerProfileSnapshot, {}),
    promptTemplateSnapshot: parseJson<Record<string, unknown>>(row.promptTemplateSnapshot, {}),
    generationPresetSnapshot: parseJson<Record<string, unknown>>(row.generationPresetSnapshot, {}),
    renderedSystemPrompt: row.renderedSystemPrompt,
    renderedUserPrompt: row.renderedUserPrompt,
    outputContent: row.outputContent || undefined,
    status: row.status,
    errorMessage: row.errorMessage || undefined,
    model: row.model || undefined,
    providerKind: row.providerKind || undefined,
    inputTokens: row.inputTokens ?? undefined,
    outputTokens: row.outputTokens ?? undefined,
    totalTokens: row.totalTokens ?? undefined,
    startedAt: row.startedAt || undefined,
    completedAt: row.completedAt || undefined,
    createdAt: row.createdAt,
  });
}

export class SqliteGenerationRepository implements GenerationRepository {
  async list(opts: { limit: number; offset: number; search?: string }): Promise<{ items: Generation[]; total: number }> {
    const db = await getDb();

    const whereClause = opts.search
      ? sql`(${generations.title} LIKE ${"%" + escapeLike(opts.search) + "%"} ESCAPE '\\' OR ${generations.eventSummary} LIKE ${"%" + escapeLike(opts.search) + "%"} ESCAPE '\\')`
      : undefined;

    const [rows, [countRow]] = await Promise.all([
      db.select().from(generations).where(whereClause).orderBy(desc(generations.createdAt)).limit(opts.limit).offset(opts.offset),
      db.select({ total: count() }).from(generations).where(whereClause),
    ]);

    return { items: rows.map(generationFromRow), total: countRow?.total ?? 0 };
  }

  async get(id: string): Promise<Generation | null> {
    const db = await getDb();
    const rows = await db.select().from(generations).where(eq(generations.id, id)).limit(1);
    return rows[0] ? generationFromRow(rows[0]) : null;
  }

  async getByIdempotencyKey(key: string): Promise<Generation | null> {
    const db = await getDb();
    const rows = await db.select().from(generations).where(eq(generations.idempotencyKey, key)).limit(1);
    return rows[0] ? generationFromRow(rows[0]) : null;
  }

  async create(input: GenerationCreateInput): Promise<Generation> {
    const db = await getDb();
    const timestamp = nowIso();
    await db.insert(generations).values({
      id: input.id,
      idempotencyKey: input.idempotencyKey ?? null,
      title: input.title,
      eventSummary: input.eventSummary,
      providerProfileSnapshot: JSON.stringify(input.providerProfileSnapshot),
      promptTemplateSnapshot: JSON.stringify(input.promptTemplateSnapshot),
      generationPresetSnapshot: JSON.stringify(input.generationPresetSnapshot),
      renderedSystemPrompt: input.renderedSystemPrompt,
      renderedUserPrompt: input.renderedUserPrompt,
      outputContent: null,
      status: "queued",
      errorMessage: null,
      model: input.model ?? null,
      providerKind: input.providerKind ?? null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      startedAt: null,
      completedAt: null,
      createdAt: timestamp,
    });
    const created = await this.get(input.id);
    return created ?? notFound("Generation");
  }

  async update(id: string, input: GenerationUpdateInput): Promise<Generation> {
    const existing = await this.get(id);
    if (!existing) {
      notFound("Generation");
    }
    const db = await getDb();
    await db
      .update(generations)
      .set({
        outputContent: input.outputContent ?? existing.outputContent ?? null,
        status: input.status ?? existing.status,
        errorMessage: input.errorMessage ?? existing.errorMessage ?? null,
        model: input.model ?? existing.model ?? null,
        inputTokens: input.inputTokens ?? existing.inputTokens ?? null,
        outputTokens: input.outputTokens ?? existing.outputTokens ?? null,
        totalTokens: input.totalTokens ?? existing.totalTokens ?? null,
        startedAt: input.startedAt ?? existing.startedAt ?? null,
        completedAt: input.completedAt ?? existing.completedAt ?? null,
      })
      .where(eq(generations.id, id));
    const updated = await this.get(id);
    return updated ?? notFound("Generation");
  }

  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.delete(generations).where(eq(generations.id, id));
  }
}

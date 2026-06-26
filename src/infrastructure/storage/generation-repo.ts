import { desc, eq, like, sql } from "drizzle-orm";
import { nowIso, parseJson } from "@/lib/utils";
import { generationSchema, type Generation } from "@/domain/schemas";
import type { GenerationCreateInput, GenerationListOpts, GenerationListResult, GenerationRepository, GenerationUpdateInput } from "@/domain/ports/storage";
import { notFound } from "@/infrastructure/storage/repo-utils";
import { getDb } from "@/infrastructure/storage/db";
import { generationDrafts, generations } from "@/infrastructure/storage/schema";

type GenerationRow = typeof generations.$inferSelect;

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
    activeDraftId: row.activeDraftId || undefined,
  });
}

export class SqliteGenerationRepository implements GenerationRepository {
  async list(opts: GenerationListOpts = {}): Promise<GenerationListResult> {
    const { search, offset = 0, limit = 30 } = opts;
    const db = await getDb();
    const filter = search ? like(generations.title, `%${search}%`) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      filter
        ? db.select().from(generations).where(filter).orderBy(desc(generations.createdAt)).limit(limit).offset(offset)
        : db.select().from(generations).orderBy(desc(generations.createdAt)).limit(limit).offset(offset),
      filter
        ? db.select({ total: sql<number>`count(*)` }).from(generations).where(filter)
        : db.select({ total: sql<number>`count(*)` }).from(generations),
    ]);
    return { items: rows.map(generationFromRow), total: Number(total) };
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

  /** Terminal statuses that cannot be overwritten by concurrent updates. */
  private static readonly TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"] as const);

  /** Allowed status transitions. If not listed, allow anything (e.g. queued → streaming). */
  private static readonly ALLOWED_TRANSITIONS: Record<string, ReadonlySet<string>> = {
    completed: new Set(["completed"]),
    failed: new Set(["failed"]),
    cancelled: new Set(["cancelled"]),
  };

  private static canTransition(from: string, to: string): boolean {
    const allowed = SqliteGenerationRepository.ALLOWED_TRANSITIONS[from];
    return allowed ? allowed.has(to) : true;
  }

  async update(id: string, input: GenerationUpdateInput): Promise<Generation> {
    const existing = await this.get(id);
    if (!existing) {
      notFound("Generation");
    }
    const newStatus = input.status ?? existing.status;
    if (!SqliteGenerationRepository.canTransition(existing.status, newStatus)) {
      // Another request already moved this generation to a terminal state.
      // Return the existing record unchanged (the caller will handle gracefully).
      return existing;
    }
    const db = await getDb();
    await db
      .update(generations)
      .set({
        outputContent: input.outputContent ?? existing.outputContent ?? null,
        status: newStatus,
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
    // FK ON DELETE CASCADE also removes drafts, but delete them explicitly in the
    // same transaction as defense-in-depth (the foreign_keys pragma is per-connection
    // and easy to lose), so no orphan drafts can ever survive.
    db.transaction((tx) => {
      tx.delete(generationDrafts).where(eq(generationDrafts.generationId, id)).run();
      tx.delete(generations).where(eq(generations.id, id)).run();
    });
  }
}

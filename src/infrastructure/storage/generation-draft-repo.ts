import { and, asc, eq } from "drizzle-orm";
import { nowIso } from "@/lib/utils";
import { generationDraftSchema, type GenerationDraft } from "@/domain/schemas";
import type { GenerationDraftCreateInput, GenerationDraftRepository } from "@/domain/ports/storage";
import { notFound } from "@/infrastructure/storage/repo-utils";
import { getDb } from "@/infrastructure/storage/db";
import { generationDrafts, generations } from "@/infrastructure/storage/schema";

type DraftRow = typeof generationDrafts.$inferSelect;

function draftFromRow(row: DraftRow): GenerationDraft {
  return generationDraftSchema.parse({
    id: row.id,
    generationId: row.generationId,
    label: row.label ?? undefined,
    content: row.content,
    kind: row.kind,
    source: row.source,
    createdAt: row.createdAt,
  });
}

export class SqliteGenerationDraftRepository implements GenerationDraftRepository {
  async listByGeneration(generationId: string): Promise<GenerationDraft[]> {
    const db = await getDb();
    const rows = await db
      .select()
      .from(generationDrafts)
      .where(eq(generationDrafts.generationId, generationId))
      .orderBy(asc(generationDrafts.createdAt));
    return rows.map(draftFromRow);
  }

  async get(id: string): Promise<GenerationDraft | null> {
    const db = await getDb();
    const rows = await db.select().from(generationDrafts).where(eq(generationDrafts.id, id)).limit(1);
    return rows[0] ? draftFromRow(rows[0]) : null;
  }

  async create(input: GenerationDraftCreateInput, setActive = false): Promise<GenerationDraft> {
    const db = await getDb();
    const createdAt = nowIso();
    // Insert + activate atomically so a generation never points at a half-written draft.
    db.transaction((tx) => {
      tx.insert(generationDrafts)
        .values({
          id: input.id,
          generationId: input.generationId,
          label: input.label ?? null,
          content: input.content,
          kind: input.kind,
          source: input.source,
          createdAt,
        })
        .run();
      if (setActive) {
        tx.update(generations).set({ activeDraftId: input.id }).where(eq(generations.id, input.generationId)).run();
      }
    });
    const created = await this.get(input.id);
    return created ?? notFound("GenerationDraft");
  }

  async updateContent(id: string, content: string): Promise<GenerationDraft> {
    const db = await getDb();
    await db.update(generationDrafts).set({ content }).where(eq(generationDrafts.id, id));
    const updated = await this.get(id);
    return updated ?? notFound("GenerationDraft");
  }

  async setActive(generationId: string, draftId: string | null): Promise<void> {
    const db = await getDb();
    // Never point a generation at a draft that doesn't exist (no FK enforces this
    // direction), which would leave a dangling active_draft_id pointer.
    if (draftId !== null) {
      const draft = await this.get(draftId);
      if (!draft || draft.generationId !== generationId) {
        notFound("GenerationDraft");
      }
    }
    await db.update(generations).set({ activeDraftId: draftId }).where(eq(generations.id, generationId));
  }

  async delete(id: string): Promise<void> {
    const db = await getDb();
    db.transaction((tx) => {
      const rows = tx.select().from(generationDrafts).where(eq(generationDrafts.id, id)).limit(1).all();
      const draft = rows[0];
      if (!draft) return;
      // Clear the active pointer first (only if it referenced this draft) to avoid a dangling reference.
      tx.update(generations)
        .set({ activeDraftId: null })
        .where(and(eq(generations.id, draft.generationId), eq(generations.activeDraftId, id)))
        .run();
      tx.delete(generationDrafts).where(eq(generationDrafts.id, id)).run();
    });
  }
}

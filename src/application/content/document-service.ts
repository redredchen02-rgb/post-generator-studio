import { AppErrorException, type GenerationDraft, type GenerationStatus } from "@/domain/schemas";
import type { StoragePort } from "@/domain/ports/storage";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { getOrThrow } from "@/application/crud-helpers";
import { createId } from "@/lib/utils";

/**
 * The mutable document layer on top of immutable generations (D4).
 *
 * `generations.outputContent` is the audit source — never edited. A generation's
 * effective content is the active draft when one exists, otherwise the original
 * output. Edits are persisted as drafts so regenerate/reload never lose them (D6).
 *
 * Write-cadence rule (data-integrity review): drafts are only written once the
 * generation reaches a terminal status. Enforced here, server-side, not just in
 * the UI — a half-streamed generation must never get a draft pinned to it.
 */

const TERMINAL_STATUSES: ReadonlySet<GenerationStatus> = new Set(["completed", "failed", "cancelled"]);

function assertTerminal(status: GenerationStatus): void {
  if (!TERMINAL_STATUSES.has(status)) {
    throw new AppErrorException({
      code: "GENERATION_NOT_TERMINAL",
      message: "生成尚未结束，无法保存草稿",
    });
  }
}

export class DocumentService {
  constructor(private readonly storage: StoragePort = getStorage()) {}

  /** Effective content: active draft when present, else the generation's audit output. */
  async getEffectiveContent(generationId: string): Promise<string> {
    const generation = await getOrThrow(this.storage.generations, generationId, "生成不存在");
    if (generation.activeDraftId) {
      const draft = await this.storage.generationDrafts.get(generation.activeDraftId);
      if (draft) return draft.content;
      // Dangling pointer (should not happen — delete resets it). Fall back to output.
    }
    return generation.outputContent ?? "";
  }

  /**
   * Return the active working draft, lazy-seeding one from the generation's output
   * on first edit. Old generations created before the draft model simply have no
   * draft until the user touches them — no bulk backfill.
   */
  async ensureWorkingDraft(generationId: string): Promise<GenerationDraft> {
    const generation = await getOrThrow(this.storage.generations, generationId, "生成不存在");
    assertTerminal(generation.status);

    if (generation.activeDraftId) {
      const existing = await this.storage.generationDrafts.get(generation.activeDraftId);
      if (existing) return existing;
    }

    return this.storage.generationDrafts.create(
      {
        id: createId("draft"),
        generationId,
        content: generation.outputContent ?? "",
        kind: "working",
        source: "generated",
      },
      true,
    );
  }

  /**
   * Autosave an edit: in-place UPDATE of the single working draft (lazy-seeding it
   * if the user never edited before). Only "save as version" inserts a new row.
   */
  async autosave(generationId: string, content: string): Promise<GenerationDraft> {
    const working = await this.ensureWorkingDraft(generationId);
    return this.storage.generationDrafts.updateContent(working.id, content);
  }

  /** All drafts for a generation, oldest first. */
  async listDrafts(generationId: string): Promise<GenerationDraft[]> {
    await getOrThrow(this.storage.generations, generationId, "生成不存在");
    return this.storage.generationDrafts.listByGeneration(generationId);
  }
}

export const documentService = new DocumentService();

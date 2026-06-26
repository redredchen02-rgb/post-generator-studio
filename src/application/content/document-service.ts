import { AppErrorException, type GenerationDraft, type GenerationStatus } from "@/domain/schemas";
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

/** Effective content: active draft when present, else the generation's audit output. */
export async function getEffectiveContent(generationId: string): Promise<string> {
  const storage = getStorage();
  const generation = await getOrThrow(storage.generations, generationId, "生成不存在");
  if (generation.activeDraftId) {
    const draft = await storage.generationDrafts.get(generation.activeDraftId);
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
export async function ensureWorkingDraft(generationId: string): Promise<GenerationDraft> {
  const storage = getStorage();
  const generation = await getOrThrow(storage.generations, generationId, "生成不存在");
  assertTerminal(generation.status);

  if (generation.activeDraftId) {
    const existing = await storage.generationDrafts.get(generation.activeDraftId);
    if (existing) return existing;
  }

  return storage.generationDrafts.create(
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
export async function autosave(generationId: string, content: string): Promise<GenerationDraft> {
  const working = await ensureWorkingDraft(generationId);
  return getStorage().generationDrafts.updateContent(working.id, content);
}

/** All drafts for a generation, oldest first. */
export async function listDrafts(generationId: string): Promise<GenerationDraft[]> {
  const storage = getStorage();
  await getOrThrow(storage.generations, generationId, "生成不存在");
  return storage.generationDrafts.listByGeneration(generationId);
}

/** The active working-draft pointer for a generation, or null. */
export async function getActiveDraftId(generationId: string): Promise<string | null> {
  const generation = await getOrThrow(getStorage().generations, generationId, "生成不存在");
  return generation.activeDraftId ?? null;
}

/**
 * Snapshot the current working content as a frozen version (kind:'snapshot').
 * Snapshots never become active — the working draft stays the live buffer — so
 * saving a version never disturbs ongoing editing.
 */
export async function saveVersion(generationId: string, label?: string): Promise<GenerationDraft> {
  const working = await ensureWorkingDraft(generationId);
  return getStorage().generationDrafts.create(
    {
      id: createId("draft"),
      generationId,
      content: working.content,
      kind: "snapshot",
      source: "edited",
      label,
    },
    false,
  );
}

/**
 * Restore a saved version back into the live working draft. The snapshot stays
 * frozen; the editor (which always reads/writes the working draft) now shows it.
 */
export async function restoreVersion(generationId: string, draftId: string): Promise<GenerationDraft> {
  const storage = getStorage();
  await getOrThrow(storage.generations, generationId, "生成不存在");
  const snapshot = await getOrThrow(storage.generationDrafts, draftId, "草稿不存在");
  if (snapshot.generationId !== generationId) {
    throw new AppErrorException({ code: "NOT_FOUND", message: "草稿不属于该生成" });
  }
  const working = await ensureWorkingDraft(generationId);
  return storage.generationDrafts.updateContent(working.id, snapshot.content);
}

import { nowIso } from "@/lib/utils";
import type { Generation } from "@/domain/schemas";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { cancelGenerationController } from "@/application/generation/cancel-registry";
import { getOrThrow } from "@/application/crud-helpers";

/**
 * Plain CRUD + cancel for generation records. Kept separate from the streaming
 * orchestrator (generation-service) so each file has one job. Re-exported from
 * generation-service to keep existing import sites stable.
 */

export async function listGenerations(opts?: { search?: string; offset?: number; limit?: number }): Promise<{ items: Generation[]; total: number }> {
  return getStorage().generations.list(opts);
}

export async function getGeneration(id: string): Promise<Generation> {
  return getOrThrow(getStorage().generations, id, "生成记录不存在");
}

export async function updateGenerationContent(id: string, outputContent: string): Promise<Generation> {
  await getOrThrow(getStorage().generations, id, "生成记录不存在");
  return getStorage().generations.update(id, { outputContent });
}

export async function deleteGeneration(id: string): Promise<void> {
  await getOrThrow(getStorage().generations, id, "生成记录不存在");
  await getStorage().generations.delete(id);
}

export async function cancelGeneration(id: string): Promise<{ cancelled: boolean }> {
  const cancelled = cancelGenerationController(id);
  if (cancelled) {
    await getStorage().generations.update(id, {
      status: "cancelled",
      completedAt: nowIso(),
      errorMessage: "生成请求被取消",
    });
  }
  return { cancelled };
}

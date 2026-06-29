import { AppErrorException, type LocalScore } from "@/domain/schemas";
import type { HotspotSidecarHealth } from "@/domain/ports/hotspot-port";
import { getOrThrow } from "@/application/crud-helpers";
import { getHotspotAdapter } from "@/infrastructure/hotspot";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";

/**
 * Local vocabulary-based copy scoring (hotspot-sdk sidecar). A fast, deterministic
 * complement to the LLM-as-Judge in judge-service.ts — same "test reader" framing,
 * but offline and sub-second. MVP is intentionally NON-PERSISTENT: scores are
 * recomputed on demand, so editing the content can never leave a stale score behind
 * (the exact trap the LLM judge already has). See the plan's Key Technical Decisions.
 */

export function getHotspotHealth(signal?: AbortSignal): Promise<HotspotSidecarHealth> {
  return getHotspotAdapter().health({ abortSignal: signal });
}

/** Score arbitrary copy (draft path) — no DB read, no DB write. */
export function scoreCopyLocal(text: string, signal?: AbortSignal): Promise<LocalScore> {
  return getHotspotAdapter().score(text, { abortSignal: signal });
}

/** Score a generation's current output. Reads the row; does NOT persist the score. */
export async function scoreGenerationLocal(generationId: string, signal?: AbortSignal): Promise<LocalScore> {
  const generation = await getOrThrow(getStorage().generations, generationId, "生成记录不存在");
  const content = generation.outputContent?.trim();
  if (!content) {
    throw new AppErrorException({ code: "EMPTY_CONTENT", message: "没有可评分的内容" });
  }
  return getHotspotAdapter().score(content, { abortSignal: signal });
}

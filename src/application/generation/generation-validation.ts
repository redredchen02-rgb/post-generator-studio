import type { Generation } from "@/domain/schemas";
import { AppErrorException, generationRequestSchema } from "@/domain/schemas";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import type { StoragePort } from "@/domain/ports/storage";

/**
 * Thrown when an idempotency key matches an already-completed generation: the caller
 * replays the cached result instead of starting (and billing) a new stream.
 */
export class CachedGenerationError extends Error {
  constructor(public generation: Generation) {
    super("Cached generation");
  }
}

export type ValidatedRequest = {
  request: ReturnType<typeof generationRequestSchema.parse>;
  preset: NonNullable<Awaited<ReturnType<StoragePort["generationPresets"]["get"]>>>;
  provider: NonNullable<Awaited<ReturnType<StoragePort["providerProfiles"]["get"]>>>;
  template: NonNullable<Awaited<ReturnType<StoragePort["promptTemplates"]["get"]>>>;
};

/**
 * Validate a generation request and resolve its preset/provider/template, enforcing
 * idempotency. Throws CachedGenerationError (replay), AppErrorException (in-progress /
 * missing config / disabled provider), or zod errors (malformed input).
 */
export async function validateGenerationRequest(input: unknown): Promise<ValidatedRequest> {
  const request = generationRequestSchema.parse(input);
  const existing = request.idempotencyKey
    ? await getStorage().generations.getByIdempotencyKey(request.idempotencyKey)
    : null;
  if (existing) {
    // Completed → replay the cached result (true idempotent retry).
    if (existing.status === "completed" && existing.outputContent) {
      throw new CachedGenerationError(existing);
    }
    // Still in flight → a concurrent request owns this key. Reject instead of
    // starting a duplicate stream, which would double-bill the provider and
    // overwrite the first request's cancel controller in the registry.
    if (existing.status === "queued" || existing.status === "streaming") {
      throw new AppErrorException({
        code: "GENERATION_IN_PROGRESS",
        message: "Generation with same idempotency key is in progress",
      });
    }
    // Failed/cancelled (or completed-without-content) → supersede the stale row
    // so the retry can claim the unique key and persist its result. Without this,
    // create() would hit the UNIQUE constraint and return the stale terminal row,
    // whose status guard then silently drops the new stream's writes.
    await getStorage().generations.delete(existing.id);
  }

  const preset = await getStorage().generationPresets.get(request.presetId);
  if (!preset) {
    throw new AppErrorException({ code: "PRESET_NOT_FOUND", message: "Generation preset not found" });
  }
  const provider = await getStorage().providerProfiles.get(request.providerProfileId || preset.providerProfileId);
  if (!provider) {
    throw new AppErrorException({ code: "PROVIDER_NOT_FOUND", message: "Provider profile not found" });
  }
  if (!provider.enabled) {
    throw new AppErrorException({ code: "PROVIDER_DISABLED", message: "Provider is disabled" });
  }
  const template = await getStorage().promptTemplates.get(preset.promptTemplateId);
  if (!template) {
    throw new AppErrorException({ code: "TEMPLATE_NOT_FOUND", message: "Prompt template not found" });
  }
  return { request, preset, provider, template };
}

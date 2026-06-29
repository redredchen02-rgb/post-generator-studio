import { createId, nowIso } from "@/lib/utils";
import type { Generation, GenerationEvent, NormalizedGenerationRequest } from "@/domain/schemas";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { readSecret } from "@/infrastructure/security/secrets";
import { getProviderAdapter } from "@/infrastructure/providers/registry";
import { logger } from "@/infrastructure/logging/logger";
import { buildRenderedPrompt, postProcessContent } from "@/plugins/pipeline/execute";
import type { PipelineContext } from "@/domain/ports/pipeline";
import { registerGenerationController, releaseGenerationController } from "@/application/generation/cancel-registry";
import { CachedGenerationError, validateGenerationRequest, type ValidatedRequest } from "@/application/generation/generation-validation";

// CRUD + cancel live in generation-crud; re-exported here so existing import sites
// (route handlers, export-service) keep importing from generation-service.
export {
  listGenerations,
  getGeneration,
  updateGenerationContent,
  deleteGeneration,
  cancelGeneration,
} from "@/application/generation/generation-crud";

export type GenerationStreamEvent =
  | { type: "generation"; generation: Generation }
  | GenerationEvent
  | { type: "final"; generation: Generation; content: string };

function redactSnapshot(profile: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...profile };
  delete rest.apiKeyRef;
  return { ...rest, keyMasked: profile.keyMasked ? String(profile.keyMasked) : undefined };
}

async function prepareGeneration(
  validated: ValidatedRequest,
  controller: AbortController,
) {
  const { request, preset, provider, template } = validated;
  const generationId = createId("generation");
  const context: PipelineContext = {
    generationId,
    preset,
    providerProfile: provider,
    template,
    logger,
    abortSignal: controller.signal,
  };
  const enabledSteps = new Set(preset.enabledPipelineSteps);
  // Pre-stream prompt assembly (build-context → render-prompt → apply-controls),
  // gated by enabledSteps. Persistence stays here in the service.
  const rendered = await buildRenderedPrompt(context, request, enabledSteps);
  const generation = await getStorage().generations.create({
    id: generationId,
    idempotencyKey: request.idempotencyKey,
    title: request.title,
    eventSummary: request.eventSummary,
    providerProfileSnapshot: redactSnapshot(provider),
    promptTemplateSnapshot: template,
    generationPresetSnapshot: preset,
    renderedSystemPrompt: rendered.systemPrompt,
    renderedUserPrompt: rendered.userPrompt,
    model: provider.model,
    providerKind: provider.providerKind,
  });
  return { generation, context, rendered, enabledSteps };
}

export async function* streamGeneration(input: unknown): AsyncIterable<GenerationStreamEvent> {
  let validated: ValidatedRequest;
  try {
    validated = await validateGenerationRequest(input);
  } catch (e) {
    if (e instanceof CachedGenerationError) {
      yield { type: "generation", generation: e.generation };
      yield { type: "token", value: e.generation.outputContent! };
      yield { type: "complete" };
      yield { type: "final", generation: e.generation, content: e.generation.outputContent! };
      return;
    }
    throw e;
  }

  const controller = new AbortController();
  const { generation, context, rendered, enabledSteps } = await prepareGeneration(validated, controller);

  registerGenerationController(generation.id, controller);
  yield { type: "generation", generation };

  try {
    const adapter = getProviderAdapter(validated.provider.providerKind);
    const apiKey = await readSecret(validated.provider.apiKeyRef) ?? "";
    const validation = await adapter.validateConfig(validated.provider, { apiKey, abortSignal: controller.signal });
    if (!validation.ok) {
      const failed = await getStorage().generations.update(generation.id, {
        status: "failed",
        errorMessage: validation.error?.message || "Provider 配置无效",
        completedAt: nowIso(),
      });
      yield { type: "error", message: validation.error?.message || "Provider 配置无效", retryable: validation.error?.retryable };
      yield { type: "final", generation: failed, content: "" };
      return;
    }

    yield* streamToProvider({
      adapter,
      validated,
      generation,
      pipelineContext: context,
      rendered,
      enabledSteps,
      apiKey,
      controller,
    });
  } catch (error) {
    // Setup between registration and streaming can throw — e.g. a corrupt secret
    // file or an AES key mismatch makes readSecret throw (not just return ""). Without
    // this the row would stay "queued" forever and the controller would leak in the
    // registry. (streamToProvider handles its own errors and never throws here.)
    const message = error instanceof Error ? error.message : "生成失败";
    const failed = await getStorage().generations.update(generation.id, {
      status: "failed",
      errorMessage: message,
      completedAt: nowIso(),
    });
    yield { type: "error", message, retryable: true };
    yield { type: "final", generation: failed, content: "" };
  } finally {
    releaseGenerationController(generation.id);
  }
}

type StreamContext = {
  adapter: ReturnType<typeof getProviderAdapter>;
  validated: ValidatedRequest;
  generation: Generation;
  pipelineContext: PipelineContext;
  rendered: { normalizedRequest: NormalizedGenerationRequest };
  enabledSteps: Set<string>;
  apiKey: string;
  controller: AbortController;
};

async function* streamToProvider(ctx: StreamContext): AsyncIterable<GenerationStreamEvent> {
  const { adapter, validated, generation, pipelineContext, rendered, enabledSteps, apiKey, controller } = ctx;
  let accumulated = "";
  let metadata: Partial<Pick<Generation, "model" | "inputTokens" | "outputTokens" | "totalTokens">> = {};
  try {
    await getStorage().generations.update(generation.id, { status: "streaming", startedAt: nowIso() });
    for await (const event of adapter.generate(rendered.normalizedRequest, validated.provider, {
      apiKey,
      abortSignal: controller.signal,
    })) {
      if (event.type === "token") {
        accumulated += event.value;
        yield event;
      } else if (event.type === "metadata") {
        metadata = {
          ...metadata,
          model: event.model ?? metadata.model,
          inputTokens: event.inputTokens ?? metadata.inputTokens,
          outputTokens: event.outputTokens ?? metadata.outputTokens,
        };
        if (metadata.inputTokens !== undefined || metadata.outputTokens !== undefined) {
          metadata.totalTokens = (metadata.inputTokens ?? 0) + (metadata.outputTokens ?? 0);
        }
        yield event;
      } else if (event.type === "error") {
        const failed = await getStorage().generations.update(generation.id, {
          status: "failed",
          errorMessage: event.message,
          completedAt: nowIso(),
        });
        yield event;
        yield { type: "final", generation: failed, content: accumulated };
        return; // finally will release the controller
      } else {
        // Post-stream only on the successful complete path; error/cancel branches
        // above keep the raw accumulated content unprocessed.
        const formatted = await postProcessContent(
          pipelineContext,
          accumulated,
          validated.request.title,
          enabledSteps,
        );
        const completed = await getStorage().generations.update(generation.id, {
          outputContent: formatted,
          status: "completed",
          completedAt: nowIso(),
          model: metadata.model,
          inputTokens: metadata.inputTokens,
          outputTokens: metadata.outputTokens,
          totalTokens: metadata.totalTokens,
        });
        yield { type: "complete" };
        yield { type: "final", generation: completed, content: formatted };
        return; // finally will release the controller
      }
    }
  } catch (error) {
    // A user cancel aborts THIS generation's registered controller; a provider
    // timeout aborts only base-adapter's internal timeout signal, so the user
    // controller stays unset. Detect cancel by the signal — not by a DB status
    // that cancelGeneration may not have committed yet — otherwise a deliberate
    // cancel races into a retryable "failed" (failed→cancelled is then blocked).
    if (controller.signal.aborted) {
      const cancelled = await getStorage().generations.update(generation.id, {
        status: "cancelled",
        errorMessage: "生成请求被取消",
        completedAt: nowIso(),
      });
      yield { type: "error", message: "生成请求被取消", retryable: false };
      yield { type: "final", generation: cancelled, content: accumulated };
      return;
    }
    const message = error instanceof Error ? error.message : "生成失败";
    const updated = await getStorage().generations.update(generation.id, {
      status: "failed",
      errorMessage: message,
      completedAt: nowIso(),
    });
    yield { type: "error", message, retryable: true };
    yield { type: "final", generation: updated, content: accumulated };
  }
}

import { PIPELINE_STEPS } from "@/domain/pipeline-steps";
import { createId, nowIso } from "@/lib/utils";
import type { Generation, GenerationEvent, NormalizedGenerationRequest } from "@/domain/schemas";
import { AppErrorException, generationRequestSchema } from "@/domain/schemas";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { readSecret } from "@/infrastructure/security/secrets";
import { getProviderAdapter } from "@/infrastructure/providers/registry";
import { logger } from "@/infrastructure/logging/logger";
import { applyControlsStep, buildContextStep, cleanContentStep, formatOutputStep, renderPromptStep } from "@/plugins/pipeline/registry";
import type { PipelineContext } from "@/domain/ports/pipeline";
import { registerGenerationController, releaseGenerationController, cancelGenerationController } from "@/application/generation/cancel-registry";
import type { StoragePort } from "@/domain/ports/storage";
import { getOrThrow } from "@/application/crud-helpers";

class CachedGenerationError extends Error {
  constructor(public generation: Generation) {
    super("Cached generation");
  }
}

export type GenerationStreamEvent =
  | { type: "generation"; generation: Generation }
  | GenerationEvent
  | { type: "final"; generation: Generation; content: string };

function redactSnapshot(profile: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...profile };
  delete rest.apiKeyRef;
  return { ...rest, keyMasked: profile.keyMasked ? String(profile.keyMasked) : undefined };
}

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

type ValidatedRequest = {
  request: ReturnType<typeof generationRequestSchema.parse>;
  preset: NonNullable<Awaited<ReturnType<StoragePort["generationPresets"]["get"]>>>;
  provider: NonNullable<Awaited<ReturnType<StoragePort["providerProfiles"]["get"]>>>;
  template: NonNullable<Awaited<ReturnType<StoragePort["promptTemplates"]["get"]>>>;
};

async function validateGenerationRequest(input: unknown): Promise<ValidatedRequest> {
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
        message: "相同 idempotencyKey 的生成正在进行中",
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
    throw new AppErrorException({ code: "PRESET_NOT_FOUND", message: "Generation Preset 不存在" });
  }
  const provider = await getStorage().providerProfiles.get(request.providerProfileId || preset.providerProfileId);
  if (!provider) {
    throw new AppErrorException({ code: "PROVIDER_NOT_FOUND", message: "Provider Profile 不存在" });
  }
  if (!provider.enabled) {
    throw new AppErrorException({ code: "PROVIDER_DISABLED", message: "Provider 未启用" });
  }
  const template = await getStorage().promptTemplates.get(preset.promptTemplateId);
  if (!template) {
    throw new AppErrorException({ code: "TEMPLATE_NOT_FOUND", message: "Prompt Template 不存在" });
  }
  return { request, preset, provider, template };
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
  const contextPayload = enabledSteps.has(PIPELINE_STEPS.BUILD_CONTEXT)
    ? await buildContextStep.execute(context, request)
    : { request, variables: {} };
  const renderedBase = enabledSteps.has(PIPELINE_STEPS.RENDER_PROMPT)
    ? await renderPromptStep.execute(context, contextPayload)
    : {
        request: contextPayload.request,
        systemPrompt: "",
        userPrompt: "",
        normalizedRequest: {
          systemPrompt: "",
          userPrompt: "",
          model: provider.model,
          temperature: preset.temperature ?? provider.defaultTemperature,
          maxTokens: preset.maxTokens ?? provider.defaultMaxTokens,
          stream: true as const,
        },
      };
  // Request-level controls (tone/length/audience/instruction); no-ops when unset.
  // Preset-gated like every other step (registry is the single source of truth).
  const rendered = enabledSteps.has(PIPELINE_STEPS.APPLY_CONTROLS)
    ? await applyControlsStep.execute(context, renderedBase)
    : renderedBase;
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
        let formatted = accumulated;
        if (enabledSteps.has(PIPELINE_STEPS.CLEAN_CONTENT)) {
          const cleaned = await cleanContentStep.execute(pipelineContext, { content: accumulated, title: validated.request.title });
          formatted = enabledSteps.has(PIPELINE_STEPS.FORMAT_OUTPUT)
            ? await formatOutputStep.execute(pipelineContext, cleaned)
            : cleaned;
        } else if (enabledSteps.has(PIPELINE_STEPS.FORMAT_OUTPUT)) {
          formatted = await formatOutputStep.execute(pipelineContext, accumulated);
        }
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

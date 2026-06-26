import type { CompletionResult, GenerationOptions, LLMProviderAdapter } from "@/domain/ports/provider";
import {
  AppErrorException,
  type GenerationEvent,
  type NormalizedGenerationRequest,
  type ProviderCapabilities,
  type ProviderModel,
  type ProviderProfile,
  type ProviderValidationResult,
} from "@/domain/schemas";
import { parseServerSentEvents, parseJsonLines, providerFailure, responseError } from "@/infrastructure/providers/streaming";

export type RequestBuildResult = {
  url: string;
  init: RequestInit;
};

export type ChunkParseResult = {
  events: GenerationEvent[];
  done?: boolean;
};

const DEFAULT_PROVIDER_TIMEOUT_MS = 120_000;
// One-shot completions are short (a paragraph rewrite, a score) — fail faster
// than the long streaming timeout so a hung relay doesn't block the editor.
const DEFAULT_COMPLETION_TIMEOUT_MS = 60_000;

/** Provider request timeout; override with POST_GENERATOR_PROVIDER_TIMEOUT_MS. */
function providerTimeoutMs(): number {
  const raw = process.env.POST_GENERATOR_PROVIDER_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PROVIDER_TIMEOUT_MS;
}

/** Completion timeout; override with POST_GENERATOR_COMPLETION_TIMEOUT_MS. */
function completionTimeoutMs(): number {
  const raw = process.env.POST_GENERATOR_COMPLETION_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_COMPLETION_TIMEOUT_MS;
}

/**
 * Combine a user abort signal with the timeout signal. Uses AbortSignal.any
 * when available (Node 20.3+/modern browsers) and falls back to manual wiring
 * so older runtimes don't crash with "AbortSignal.any is not a function".
 */
function combineSignals(userSignal: AbortSignal | undefined, timeout: AbortSignal): AbortSignal {
  if (!userSignal) return timeout;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([userSignal, timeout]);
  const controller = new AbortController();
  const onAbort = (reason: unknown) => controller.abort(reason);
  for (const sig of [userSignal, timeout]) {
    if (sig.aborted) {
      controller.abort(sig.reason);
      break;
    }
    sig.addEventListener("abort", () => onAbort(sig.reason), { once: true });
  }
  return controller.signal;
}

export abstract class BaseAdapter implements LLMProviderAdapter {
  abstract readonly id: string;

  protected abstract buildRequest(
    request: NormalizedGenerationRequest,
    config: ProviderProfile,
    options?: GenerationOptions,
  ): Promise<RequestBuildResult>;

  protected abstract parseChunk(
    raw: unknown,
    request: NormalizedGenerationRequest,
  ): ChunkParseResult;

  protected supportsApiKey = true;

  capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsModelList: false,
      requiresApiKey: this.supportsApiKey,
      supportsSystemPrompt: true,
      supportsCompletion: false,
    };
  }

  async validateConfig(config: ProviderProfile, options?: GenerationOptions): Promise<ProviderValidationResult> {
    if (this.supportsApiKey && !options?.apiKey) {
      return { ok: false, error: { code: "API_KEY_MISSING", message: "API Key not configured" } };
    }
    if (!config.model) {
      return { ok: false, error: { code: "MODEL_MISSING", message: "Model not configured" } };
    }
    return { ok: true };
  }

  async *generate(
    request: NormalizedGenerationRequest,
    config: ProviderProfile,
    options?: GenerationOptions,
  ): AsyncIterable<GenerationEvent> {
    const validation = await this.validateConfig(config, options);
    if (!validation.ok) {
      yield { type: "error", message: validation.error?.message || `${this.id} 配置无效` };
      return;
    }

    const { url, init } = await this.buildRequest(request, config, options);

    // Bound the request so a hung provider can't block the stream forever.
    const timeout = AbortSignal.timeout(providerTimeoutMs());
    const signal = combineSignals(options?.abortSignal, timeout);

    let response: Response;
    try {
      response = await fetch(url, { ...init, signal });
    } catch (err) {
      if (options?.abortSignal?.aborted) {
        // User cancellation — handled by the cancel path, not an error.
        return;
      }
      if (timeout.aborted) {
        yield responseError(`${this.id} 请求超时`, true);
        return;
      }
      yield responseError(err instanceof Error ? err.message : `${this.id} 网络错误`, true);
      return;
    }

    if (!response.ok) {
      yield responseError(await providerFailure(response), response.status >= 500 || response.status === 429);
      return;
    }

    yield* this.streamResponse(response, request);
  }

  /**
   * One-shot non-streaming completion. Adapters opt in via
   * `capabilities().supportsCompletion` and implement `parseCompletion`;
   * `buildCompletionRequest` defaults to the streaming request with `stream:false`.
   */
  async complete(
    request: NormalizedGenerationRequest,
    config: ProviderProfile,
    options?: GenerationOptions,
  ): Promise<CompletionResult> {
    if (!this.capabilities().supportsCompletion) {
      throw new AppErrorException({ code: "COMPLETION_UNSUPPORTED", message: `${this.id} 不支持一次性补全` });
    }
    const validation = await this.validateConfig(config, options);
    if (!validation.ok) {
      throw new AppErrorException(validation.error ?? { code: "PROVIDER_INVALID", message: `${this.id} 配置无效` });
    }

    const { url, init } = await this.buildCompletionRequest({ ...request, stream: false }, config, options);
    const timeout = AbortSignal.timeout(completionTimeoutMs());
    const signal = combineSignals(options?.abortSignal, timeout);

    let response: Response;
    try {
      response = await fetch(url, { ...init, signal });
    } catch (err) {
      // Distinguish user cancellation from timeout from network error, matching generate().
      if (options?.abortSignal?.aborted) {
        throw new AppErrorException({ code: "COMPLETION_CANCELLED", message: `${this.id} 补全请求被取消` });
      }
      if (timeout.aborted) {
        throw new AppErrorException({ code: "COMPLETION_TIMEOUT", message: `${this.id} 补全请求超时` });
      }
      throw new AppErrorException({
        code: "COMPLETION_FAILED",
        message: err instanceof Error ? err.message : `${this.id} 网络错误`,
      });
    }

    if (!response.ok) {
      throw new AppErrorException({ code: "COMPLETION_FAILED", message: await providerFailure(response) });
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new AppErrorException({ code: "COMPLETION_FAILED", message: `${this.id} 返回了无法解析的响应` });
    }
    // Guard the unknown payload and coerce any non-AppError parse failure into an
    // observable error, mirroring safeParseChunk on the streaming path.
    if (raw === null || typeof raw !== "object") {
      throw new AppErrorException({ code: "COMPLETION_FAILED", message: `${this.id} 返回了非预期的响应结构` });
    }
    try {
      return this.parseCompletion(raw);
    } catch (err) {
      if (err instanceof AppErrorException) throw err;
      throw new AppErrorException({
        code: "COMPLETION_FAILED",
        message: err instanceof Error ? err.message : `${this.id} 补全响应解析失败`,
      });
    }
  }

  /** Override when the non-streaming endpoint differs from the streaming one (e.g. Gemini). */
  protected buildCompletionRequest(
    request: NormalizedGenerationRequest,
    config: ProviderProfile,
    options?: GenerationOptions,
  ): Promise<RequestBuildResult> {
    return this.buildRequest(request, config, options);
  }

  /** Parse a full (non-streaming) provider response. Implemented by completion-capable adapters. */
  protected parseCompletion(_raw: unknown): CompletionResult {
    throw new AppErrorException({ code: "COMPLETION_UNSUPPORTED", message: `${this.id} 未实现补全解析` });
  }

  /**
   * Guard parseChunk so a non-object or malformed chunk surfaces an observable
   * error event instead of throwing out of the stream or being silently dropped.
   * `fatal` marks a parse/structure failure so the caller can stop the stream
   * after one error rather than emitting an error per garbage line.
   */
  private safeParseChunk(
    raw: unknown,
    request: NormalizedGenerationRequest,
  ): ChunkParseResult & { fatal?: boolean } {
    if (raw === null || typeof raw !== "object") {
      return { events: [responseError(`${this.id} 返回了非预期的响应结构`, false)], fatal: true };
    }
    try {
      return this.parseChunk(raw, request);
    } catch (err) {
      return {
        events: [responseError(err instanceof Error ? err.message : `${this.id} 响应解析失败`, false)],
        fatal: true,
      };
    }
  }

  protected async *streamResponse(
    response: Response,
    request: NormalizedGenerationRequest,
  ): AsyncIterable<GenerationEvent> {
    if (!response.body) {
      yield { type: "complete" };
      return;
    }

    const contentType = response.headers.get("content-type") || "";
    const isJsonLines = !contentType.includes("text/event-stream");

    if (isJsonLines) {
      for await (const raw of parseJsonLines(response)) {
        const { events, done, fatal } = this.safeParseChunk(raw, request);
        yield* events;
        if (fatal) return; // malformed stream: surfaced one error, stop (no flood)
        if (done) {
          yield { type: "complete" };
          return;
        }
      }
    } else {
      for await (const data of parseServerSentEvents(response)) {
        if (data === "[DONE]") {
          yield { type: "complete" };
          return;
        }
        let raw: unknown;
        try {
          raw = JSON.parse(data);
        } catch {
          yield responseError(`${this.id} 返回了无法解析的数据块`, false);
          return; // malformed stream: stop rather than emit an error per bad chunk
        }
        const { events, done, fatal } = this.safeParseChunk(raw, request);
        yield* events;
        if (fatal) return;
        if (done) {
          yield { type: "complete" };
          return;
        }
      }
    }

    yield { type: "complete" };
  }

  async listModels(_config: ProviderProfile, _options?: GenerationOptions): Promise<ProviderModel[]> {
    return [];
  }
}

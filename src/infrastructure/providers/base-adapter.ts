import type { GenerationOptions, LLMProviderAdapter } from "@/domain/ports/provider";
import type {
  GenerationEvent,
  NormalizedGenerationRequest,
  ProviderCapabilities,
  ProviderModel,
  ProviderProfile,
  ProviderValidationResult,
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

/** Provider request timeout; override with POST_GENERATOR_PROVIDER_TIMEOUT_MS. */
function providerTimeoutMs(): number {
  const raw = process.env.POST_GENERATOR_PROVIDER_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PROVIDER_TIMEOUT_MS;
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
    };
  }

  async validateConfig(config: ProviderProfile, options?: GenerationOptions): Promise<ProviderValidationResult> {
    if (this.supportsApiKey && !options?.apiKey) {
      return { ok: false, error: { code: "API_KEY_MISSING", message: "API Key 未配置" } };
    }
    if (!config.model) {
      return { ok: false, error: { code: "MODEL_MISSING", message: "模型未配置" } };
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

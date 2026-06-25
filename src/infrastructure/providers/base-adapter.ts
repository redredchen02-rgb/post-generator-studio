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
    const signal = options?.abortSignal
      ? AbortSignal.any([options.abortSignal, timeout])
      : timeout;

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
   */
  private safeParseChunk(raw: unknown, request: NormalizedGenerationRequest): ChunkParseResult {
    if (raw === null || typeof raw !== "object") {
      return { events: [responseError(`${this.id} 返回了非预期的响应结构`, false)] };
    }
    try {
      return this.parseChunk(raw, request);
    } catch (err) {
      return {
        events: [responseError(err instanceof Error ? err.message : `${this.id} 响应解析失败`, false)],
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
        const { events, done } = this.safeParseChunk(raw, request);
        yield* events;
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
          continue;
        }
        const { events, done } = this.safeParseChunk(raw, request);
        yield* events;
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

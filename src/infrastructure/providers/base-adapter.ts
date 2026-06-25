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
    const response = await fetch(url, { ...init, signal: options?.abortSignal });

    if (!response.ok) {
      yield responseError(await providerFailure(response), response.status >= 500 || response.status === 429);
      return;
    }

    yield* this.streamResponse(response, request);
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
        const { events, done } = this.parseChunk(raw, request);
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
        const { events, done } = this.parseChunk(JSON.parse(data), request);
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

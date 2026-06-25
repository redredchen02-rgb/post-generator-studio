import type { CompletionResult, GenerationOptions } from "@/domain/ports/provider";
import {
  AppErrorException,
  type GenerationEvent,
  type NormalizedGenerationRequest,
  type ProviderCapabilities,
  type ProviderModel,
  type ProviderProfile,
} from "@/domain/schemas";
import { BaseAdapter, type RequestBuildResult, type ChunkParseResult } from "@/infrastructure/providers/base-adapter";

type ChatCompletionChunk = {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

type ModelsResponse = {
  data?: Array<{ id: string; name?: string }>;
};

export type OpenAICompatibleAdapterOptions = {
  id: string;
  defaultBaseUrl: string;
  requiresApiKey: boolean;
  extraHeaders?: Record<string, string>;
};

export class OpenAICompatibleAdapter extends BaseAdapter {
  readonly id: string;
  private readonly defaultBaseUrl: string;
  private readonly extraHeaders: Record<string, string>;

  constructor(options: OpenAICompatibleAdapterOptions) {
    super();
    this.id = options.id;
    this.defaultBaseUrl = options.defaultBaseUrl;
    this.supportsApiKey = options.requiresApiKey;
    this.extraHeaders = options.extraHeaders || {};
  }

  capabilities(): ProviderCapabilities {
    return {
      ...super.capabilities(),
      supportsModelList: true,
      supportsCompletion: true,
    };
  }

  protected async buildRequest(
    request: NormalizedGenerationRequest,
    config: ProviderProfile,
    options?: GenerationOptions,
  ): Promise<RequestBuildResult> {
    return {
      url: this.apiUrl(config, "chat/completions"),
      init: {
        method: "POST",
        headers: this.headers(options?.apiKey),
        body: JSON.stringify({
          model: request.model,
          messages: [
            { role: "system", content: request.systemPrompt },
            { role: "user", content: request.userPrompt },
          ],
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          stream: request.stream,
          // stream_options is only valid on streaming requests; strict APIs
          // reject it alongside stream:false.
          ...(request.stream ? { stream_options: { include_usage: true } } : {}),
        }),
      },
    };
  }

  protected parseChunk(raw: unknown, _request: NormalizedGenerationRequest): ChunkParseResult {
    const parsed = raw as ChatCompletionChunk;
    const events: GenerationEvent[] = [];
    const token = parsed.choices?.[0]?.delta?.content;
    if (token) {
      events.push({ type: "token", value: token });
    }
    if (parsed.model || parsed.usage) {
      events.push({
        type: "metadata",
        model: parsed.model,
        inputTokens: parsed.usage?.prompt_tokens,
        outputTokens: parsed.usage?.completion_tokens,
      });
    }
    return { events };
  }

  protected parseCompletion(raw: unknown): CompletionResult {
    const parsed = raw as ChatCompletionResponse;
    const content = parsed.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new AppErrorException({ code: "COMPLETION_FAILED", message: `${this.id} 返回了非预期的补全结构` });
    }
    return {
      content,
      model: parsed.model,
      inputTokens: parsed.usage?.prompt_tokens,
      outputTokens: parsed.usage?.completion_tokens,
    };
  }

  async listModels(config: ProviderProfile, options?: GenerationOptions): Promise<ProviderModel[]> {
    if (this.supportsApiKey && !options?.apiKey) {
      return [];
    }
    const response = await fetch(this.apiUrl(config, "models"), {
      signal: options?.abortSignal,
      headers: this.headers(options?.apiKey),
    });
    if (!response.ok) {
      return [];
    }
    const parsed = (await response.json()) as ModelsResponse;
    return (parsed.data || []).map((model) => ({ id: model.id, name: model.name }));
  }

  private baseUrl(config: ProviderProfile): string {
    return (config.baseUrl || this.defaultBaseUrl).replace(/\/$/, "");
  }

  // Build an OpenAI-compatible endpoint, tolerating base URLs that already
  // include the `/v1` API segment (the common convention, e.g. `.../api/v1`).
  // Avoids producing a doubled `/v1/v1/...` path against such relays.
  private apiUrl(config: ProviderProfile, path: string): string {
    const base = this.baseUrl(config);
    return base.endsWith("/v1") ? `${base}/${path}` : `${base}/v1/${path}`;
  }

  private headers(apiKey?: string): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...this.extraHeaders,
    };
  }
}

import type { LLMProviderAdapter, GenerationOptions } from "@/domain/ports/provider";
import type {
  GenerationEvent,
  NormalizedGenerationRequest,
  ProviderCapabilities,
  ProviderModel,
  ProviderProfile,
  ProviderValidationResult,
} from "@/domain/schemas";
import { parseServerSentEvents, providerFailure, responseError } from "@/infrastructure/providers/streaming";

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

type ModelsResponse = {
  data?: Array<{ id: string; name?: string }>;
};

export type OpenAICompatibleAdapterOptions = {
  id: string;
  defaultBaseUrl: string;
  requiresApiKey: boolean;
  extraHeaders?: Record<string, string>;
};

export class OpenAICompatibleAdapter implements LLMProviderAdapter {
  readonly id: string;
  private readonly defaultBaseUrl: string;
  private readonly requiresApiKey: boolean;
  private readonly extraHeaders: Record<string, string>;

  constructor(options: OpenAICompatibleAdapterOptions) {
    this.id = options.id;
    this.defaultBaseUrl = options.defaultBaseUrl;
    this.requiresApiKey = options.requiresApiKey;
    this.extraHeaders = options.extraHeaders || {};
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsModelList: true,
      requiresApiKey: this.requiresApiKey,
      supportsSystemPrompt: true,
    };
  }

  async validateConfig(config: ProviderProfile, options?: GenerationOptions): Promise<ProviderValidationResult> {
    if (this.requiresApiKey && !options?.apiKey) {
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
      yield { type: "error", message: validation.error?.message || "Provider 配置无效" };
      return;
    }

    const response = await fetch(`${this.baseUrl(config)}/v1/chat/completions`, {
      method: "POST",
      signal: options?.abortSignal,
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
        stream_options: { include_usage: true },
      }),
    });

    if (!response.ok) {
      yield responseError(await providerFailure(response), response.status >= 500 || response.status === 429);
      return;
    }

    for await (const data of parseServerSentEvents(response)) {
      if (data === "[DONE]") {
        yield { type: "complete" };
        return;
      }
      const parsed = JSON.parse(data) as ChatCompletionChunk;
      const token = parsed.choices?.[0]?.delta?.content;
      if (token) {
        yield { type: "token", value: token };
      }
      if (parsed.model || parsed.usage) {
        yield {
          type: "metadata",
          model: parsed.model,
          inputTokens: parsed.usage?.prompt_tokens,
          outputTokens: parsed.usage?.completion_tokens,
        };
      }
    }
    yield { type: "complete" };
  }

  async listModels(config: ProviderProfile, options?: GenerationOptions): Promise<ProviderModel[]> {
    if (this.requiresApiKey && !options?.apiKey) {
      return [];
    }
    const response = await fetch(`${this.baseUrl(config)}/v1/models`, {
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

  private headers(apiKey?: string): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...this.extraHeaders,
    };
  }
}


import type { GenerationOptions, LLMProviderAdapter } from "@/domain/ports/provider";
import type {
  GenerationEvent,
  NormalizedGenerationRequest,
  ProviderCapabilities,
  ProviderModel,
  ProviderProfile,
  ProviderValidationResult,
} from "@/domain/schemas";
import { parseServerSentEvents, providerFailure, responseError } from "@/infrastructure/providers/streaming";

type AnthropicEvent = {
  type?: string;
  delta?: { text?: string };
  message?: { model?: string; usage?: { input_tokens?: number; output_tokens?: number } };
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
};

export class AnthropicAdapter implements LLMProviderAdapter {
  readonly id = "anthropic";

  capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsModelList: false,
      requiresApiKey: true,
      supportsSystemPrompt: true,
    };
  }

  async validateConfig(_config: ProviderProfile, options?: GenerationOptions): Promise<ProviderValidationResult> {
    if (!options?.apiKey) {
      return { ok: false, error: { code: "API_KEY_MISSING", message: "API Key 未配置" } };
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
      yield { type: "error", message: validation.error?.message || "Anthropic 配置无效" };
      return;
    }
    const baseUrl = (config.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      signal: options?.abortSignal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": options?.apiKey || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: request.model,
        system: request.systemPrompt,
        messages: [{ role: "user", content: request.userPrompt }],
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      yield responseError(await providerFailure(response), response.status >= 500 || response.status === 429);
      return;
    }

    for await (const data of parseServerSentEvents(response)) {
      const parsed = JSON.parse(data) as AnthropicEvent;
      if (parsed.error?.message) {
        yield { type: "error", message: parsed.error.message, retryable: false };
        return;
      }
      if (parsed.type === "content_block_delta" && parsed.delta?.text) {
        yield { type: "token", value: parsed.delta.text };
      }
      if (parsed.type === "message_start" || parsed.type === "message_delta") {
        yield {
          type: "metadata",
          model: parsed.message?.model,
          inputTokens: parsed.message?.usage?.input_tokens || parsed.usage?.input_tokens,
          outputTokens: parsed.message?.usage?.output_tokens || parsed.usage?.output_tokens,
        };
      }
      if (parsed.type === "message_stop") {
        yield { type: "complete" };
        return;
      }
    }
    yield { type: "complete" };
  }

  async listModels(): Promise<ProviderModel[]> {
    return [];
  }
}


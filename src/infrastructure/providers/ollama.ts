import type { GenerationOptions, LLMProviderAdapter } from "@/domain/ports/provider";
import type {
  GenerationEvent,
  NormalizedGenerationRequest,
  ProviderCapabilities,
  ProviderModel,
  ProviderProfile,
  ProviderValidationResult,
} from "@/domain/schemas";
import { parseJsonLines, providerFailure, responseError } from "@/infrastructure/providers/streaming";

type OllamaChunk = {
  message?: { content?: string };
  done?: boolean;
  model?: string;
  prompt_eval_count?: number;
  eval_count?: number;
};

type OllamaTags = {
  models?: Array<{ name: string; model?: string }>;
};

export class OllamaAdapter implements LLMProviderAdapter {
  readonly id = "ollama";

  capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsModelList: true,
      requiresApiKey: false,
      supportsSystemPrompt: true,
    };
  }

  async validateConfig(config: ProviderProfile): Promise<ProviderValidationResult> {
    if (!config.baseUrl) {
      return { ok: false, error: { code: "BASE_URL_MISSING", message: "Ollama Base URL 未配置" } };
    }
    return { ok: true };
  }

  async *generate(
    request: NormalizedGenerationRequest,
    config: ProviderProfile,
    options?: GenerationOptions,
  ): AsyncIterable<GenerationEvent> {
    const baseUrl = (config.baseUrl || "http://localhost:11434").replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      signal: options?.abortSignal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: request.model,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt },
        ],
        stream: true,
        options: {
          temperature: request.temperature,
          num_predict: request.maxTokens,
        },
      }),
    });

    if (!response.ok) {
      yield responseError(await providerFailure(response), true);
      return;
    }

    for await (const value of parseJsonLines(response)) {
      const chunk = value as OllamaChunk;
      if (chunk.message?.content) {
        yield { type: "token", value: chunk.message.content };
      }
      if (chunk.done) {
        yield {
          type: "metadata",
          model: chunk.model,
          inputTokens: chunk.prompt_eval_count,
          outputTokens: chunk.eval_count,
        };
        yield { type: "complete" };
        return;
      }
    }
    yield { type: "complete" };
  }

  async listModels(config: ProviderProfile, options?: GenerationOptions): Promise<ProviderModel[]> {
    const baseUrl = (config.baseUrl || "http://localhost:11434").replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/api/tags`, { signal: options?.abortSignal });
    if (!response.ok) {
      return [];
    }
    const parsed = (await response.json()) as OllamaTags;
    return (parsed.models || []).map((model) => ({ id: model.model || model.name, name: model.name }));
  }
}


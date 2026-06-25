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

type GeminiChunk = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

type GeminiModels = {
  models?: Array<{ name: string; displayName?: string }>;
};

export class GeminiAdapter implements LLMProviderAdapter {
  readonly id = "gemini";

  capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsModelList: true,
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
      yield { type: "error", message: validation.error?.message || "Gemini 配置无效" };
      return;
    }
    const baseUrl = (config.baseUrl || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
    const url = `${baseUrl}/v1beta/models/${encodeURIComponent(request.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(options?.apiKey || "")}`;
    const response = await fetch(url, {
      method: "POST",
      signal: options?.abortSignal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: request.userPrompt }] }],
        generationConfig: {
          temperature: request.temperature,
          maxOutputTokens: request.maxTokens,
        },
      }),
    });

    if (!response.ok) {
      yield responseError(await providerFailure(response), response.status >= 500 || response.status === 429);
      return;
    }

    for await (const data of parseServerSentEvents(response)) {
      const parsed = JSON.parse(data) as GeminiChunk;
      for (const candidate of parsed.candidates || []) {
        for (const part of candidate.content?.parts || []) {
          if (part.text) {
            yield { type: "token", value: part.text };
          }
        }
      }
      if (parsed.usageMetadata) {
        yield {
          type: "metadata",
          model: request.model,
          inputTokens: parsed.usageMetadata.promptTokenCount,
          outputTokens: parsed.usageMetadata.candidatesTokenCount,
        };
      }
    }
    yield { type: "complete" };
  }

  async listModels(config: ProviderProfile, options?: GenerationOptions): Promise<ProviderModel[]> {
    if (!options?.apiKey) {
      return [];
    }
    const baseUrl = (config.baseUrl || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/v1beta/models?key=${encodeURIComponent(options.apiKey)}`, {
      signal: options.abortSignal,
    });
    if (!response.ok) {
      return [];
    }
    const parsed = (await response.json()) as GeminiModels;
    return (parsed.models || []).map((model) => ({
      id: model.name.replace(/^models\//, ""),
      name: model.displayName || model.name,
    }));
  }
}


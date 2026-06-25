import type { GenerationOptions } from "@/domain/ports/provider";
import type {
  GenerationEvent,
  NormalizedGenerationRequest,
  ProviderCapabilities,
  ProviderModel,
  ProviderProfile,
} from "@/domain/schemas";
import { BaseAdapter, type RequestBuildResult, type ChunkParseResult } from "@/infrastructure/providers/base-adapter";

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

export class OllamaAdapter extends BaseAdapter {
  readonly id = "ollama";
  protected supportsApiKey = false;

  capabilities(): ProviderCapabilities {
    return {
      ...super.capabilities(),
      supportsModelList: true,
    };
  }

  async validateConfig(config: ProviderProfile, _options?: GenerationOptions): Promise<{ ok: boolean; error?: { code: string; message: string } }> {
    if (!config.baseUrl) {
      return { ok: false, error: { code: "BASE_URL_MISSING", message: "Ollama Base URL 未配置" } };
    }
    return { ok: true };
  }

  protected async buildRequest(
    request: NormalizedGenerationRequest,
    config: ProviderProfile,
    _options?: GenerationOptions,
  ): Promise<RequestBuildResult> {
    const baseUrl = (config.baseUrl || "http://localhost:11434").replace(/\/$/, "");
    return {
      url: `${baseUrl}/api/chat`,
      init: {
        method: "POST",
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
      },
    };
  }

  protected parseChunk(raw: unknown, _request: NormalizedGenerationRequest): ChunkParseResult {
    const chunk = raw as OllamaChunk;
    const events: GenerationEvent[] = [];
    if (chunk.message?.content) {
      events.push({ type: "token", value: chunk.message.content });
    }
    if (chunk.done) {
      events.push({
        type: "metadata",
        model: chunk.model,
        inputTokens: chunk.prompt_eval_count,
        outputTokens: chunk.eval_count,
      });
      return { events, done: true };
    }
    return { events };
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

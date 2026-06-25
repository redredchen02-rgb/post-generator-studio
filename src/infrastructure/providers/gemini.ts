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

export class GeminiAdapter extends BaseAdapter {
  readonly id = "gemini";

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
    const baseUrl = (config.baseUrl || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
    return {
      url: `${baseUrl}/v1beta/models/${encodeURIComponent(request.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(options?.apiKey || "")}`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: request.userPrompt }] }],
          generationConfig: {
            temperature: request.temperature,
            maxOutputTokens: request.maxTokens,
          },
        }),
      },
    };
  }

  protected parseChunk(raw: unknown, request: NormalizedGenerationRequest): ChunkParseResult {
    const parsed = raw as GeminiChunk;
    const events: GenerationEvent[] = [];
    for (const candidate of parsed.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        if (part.text) {
          events.push({ type: "token", value: part.text });
        }
      }
    }
    if (parsed.usageMetadata) {
      events.push({
        type: "metadata",
        model: request.model,
        inputTokens: parsed.usageMetadata?.promptTokenCount,
        outputTokens: parsed.usageMetadata?.candidatesTokenCount,
      });
    }
    return { events };
  }

  protected async buildCompletionRequest(
    request: NormalizedGenerationRequest,
    config: ProviderProfile,
    options?: GenerationOptions,
  ): Promise<RequestBuildResult> {
    // Non-streaming uses :generateContent (no ?alt=sse) rather than :streamGenerateContent.
    const baseUrl = (config.baseUrl || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
    return {
      url: `${baseUrl}/v1beta/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(options?.apiKey || "")}`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: request.userPrompt }] }],
          generationConfig: {
            temperature: request.temperature,
            maxOutputTokens: request.maxTokens,
          },
        }),
      },
    };
  }

  protected parseCompletion(raw: unknown): CompletionResult {
    const parsed = raw as GeminiChunk;
    const parts = parsed.candidates?.[0]?.content?.parts ?? [];
    const content = parts.map((part) => part.text ?? "").join("");
    if (!content) {
      throw new AppErrorException({ code: "COMPLETION_FAILED", message: `${this.id} 返回了非预期的补全结构` });
    }
    return {
      content,
      inputTokens: parsed.usageMetadata?.promptTokenCount,
      outputTokens: parsed.usageMetadata?.candidatesTokenCount,
    };
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

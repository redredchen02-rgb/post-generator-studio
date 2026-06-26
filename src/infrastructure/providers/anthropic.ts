import type { CompletionResult, GenerationOptions } from "@/domain/ports/provider";
import {
  AppErrorException,
  type GenerationEvent,
  type NormalizedGenerationRequest,
  type ProviderCapabilities,
  type ProviderProfile,
} from "@/domain/schemas";
import { BaseAdapter, type RequestBuildResult, type ChunkParseResult } from "@/infrastructure/providers/base-adapter";

type AnthropicEvent = {
  type?: string;
  delta?: { text?: string };
  message?: { model?: string; usage?: { input_tokens?: number; output_tokens?: number } };
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
};

type AnthropicMessage = {
  content?: Array<{ type?: string; text?: string }>;
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
};

export class AnthropicAdapter extends BaseAdapter {
  readonly id = "anthropic";

  capabilities(): ProviderCapabilities {
    return {
      ...super.capabilities(),
      supportsCompletion: true,
    };
  }

  protected async buildRequest(
    request: NormalizedGenerationRequest,
    config: ProviderProfile,
    options?: GenerationOptions,
  ): Promise<RequestBuildResult> {
    const baseUrl = (config.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
    return {
      url: `${baseUrl}/v1/messages`,
      init: {
        method: "POST",
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
          stream: request.stream,
        }),
      },
    };
  }

  protected validateChunkShape(raw: Record<string, unknown>): string | null {
    if (typeof raw.error === "object" && raw.error !== null) {
      const err = raw.error as Record<string, unknown>;
      if (typeof err.message === "string") return err.message;
    }
    if (typeof raw.type !== "string" && typeof raw.delta !== "object" && typeof raw.message !== "object") {
      return `${this.id}: 意外的数据块结构`;
    }
    return null;
  }

  protected parseChunk(raw: unknown, _request: NormalizedGenerationRequest): ChunkParseResult {
    const parsed = raw as AnthropicEvent;
    if (parsed.error?.message) {
      return { events: [{ type: "error", message: parsed.error.message, retryable: false }], done: true };
    }
    const events: GenerationEvent[] = [];
    if (parsed.type === "content_block_delta" && parsed.delta?.text) {
      events.push({ type: "token", value: parsed.delta.text });
    }
    if (parsed.type === "message_start" || parsed.type === "message_delta") {
      events.push({
        type: "metadata",
        model: parsed.message?.model,
        inputTokens: parsed.message?.usage?.input_tokens || parsed.usage?.input_tokens,
        outputTokens: parsed.message?.usage?.output_tokens || parsed.usage?.output_tokens,
      });
    }
    if (parsed.type === "message_stop") {
      return { events, done: true };
    }
    return { events };
  }

  protected parseCompletion(raw: unknown): CompletionResult {
    const parsed = raw as AnthropicMessage;
    if (parsed.error?.message) {
      throw new AppErrorException({ code: "COMPLETION_FAILED", message: parsed.error.message });
    }
    if (!Array.isArray(parsed.content)) {
      throw new AppErrorException({ code: "COMPLETION_FAILED", message: `${this.id} 返回了非预期的补全结构` });
    }
    const content = parsed.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");
    if (!content) {
      throw new AppErrorException({ code: "COMPLETION_FAILED", message: `${this.id} 返回了空补全` });
    }
    return {
      content,
      model: parsed.model,
      inputTokens: parsed.usage?.input_tokens,
      outputTokens: parsed.usage?.output_tokens,
    };
  }
}

import type { GenerationOptions } from "@/domain/ports/provider";
import type {
  GenerationEvent,
  NormalizedGenerationRequest,
  ProviderProfile,
} from "@/domain/schemas";
import { BaseAdapter, type RequestBuildResult, type ChunkParseResult } from "@/infrastructure/providers/base-adapter";

type AnthropicEvent = {
  type?: string;
  delta?: { text?: string };
  message?: { model?: string; usage?: { input_tokens?: number; output_tokens?: number } };
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
};

export class AnthropicAdapter extends BaseAdapter {
  readonly id = "anthropic";

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
          stream: true,
        }),
      },
    };
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
}

import type { LLMProviderAdapter } from "@/domain/ports/provider";
import type { ProviderKind } from "@/domain/schemas";
import { AnthropicAdapter } from "@/infrastructure/providers/anthropic";
import { GeminiAdapter } from "@/infrastructure/providers/gemini";
import { OllamaAdapter } from "@/infrastructure/providers/ollama";
import { OpenAICompatibleAdapter } from "@/infrastructure/providers/openai-compatible";

const adapterFactories: Record<ProviderKind, () => LLMProviderAdapter> = {
  openai: () => new OpenAICompatibleAdapter({
    id: "openai",
    defaultBaseUrl: "https://api.openai.com",
    requiresApiKey: true,
  }),
  anthropic: () => new AnthropicAdapter(),
  gemini: () => new GeminiAdapter(),
  ollama: () => new OllamaAdapter(),
  openrouter: () => new OpenAICompatibleAdapter({
    id: "openrouter",
    defaultBaseUrl: "https://openrouter.ai/api",
    requiresApiKey: true,
    extraHeaders: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "Post Generator Studio",
    },
  }),
  "openai-compatible": () => new OpenAICompatibleAdapter({
    id: "openai-compatible",
    defaultBaseUrl: "http://localhost:8000",
    requiresApiKey: false,
  }),
};

const adapterCache: Partial<Record<ProviderKind, LLMProviderAdapter>> = {};

export function getProviderAdapter(kind: ProviderKind): LLMProviderAdapter {
  if (!adapterCache[kind]) {
    adapterCache[kind] = adapterFactories[kind]();
  }
  return adapterCache[kind]!;
}

export function listProviderAdapters(): Array<{ kind: ProviderKind; adapter: LLMProviderAdapter }> {
  return Object.keys(adapterFactories).map((kind) => ({
    kind: kind as ProviderKind,
    adapter: getProviderAdapter(kind as ProviderKind),
  }));
}



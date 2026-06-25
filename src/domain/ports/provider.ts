import type {
  GenerationEvent,
  NormalizedGenerationRequest,
  ProviderCapabilities,
  ProviderModel,
  ProviderProfile,
  ProviderValidationResult,
} from "@/domain/schemas";

export type GenerationOptions = {
  abortSignal?: AbortSignal;
  apiKey?: string;
};

/** Result of a one-shot (non-streaming) completion. */
export type CompletionResult = {
  content: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
};

export interface LLMProviderAdapter {
  id: string;
  capabilities(): ProviderCapabilities;
  validateConfig(config: ProviderProfile, options?: GenerationOptions): Promise<ProviderValidationResult>;
  generate(
    request: NormalizedGenerationRequest,
    config: ProviderProfile,
    options?: GenerationOptions,
  ): AsyncIterable<GenerationEvent>;
  /**
   * Non-streaming completion for short, structured calls (rewrite a passage,
   * score a draft). Optional: callers must check `capabilities().supportsCompletion`
   * before invoking, and adapters that don't implement it leave it undefined.
   */
  complete?(
    request: NormalizedGenerationRequest,
    config: ProviderProfile,
    options?: GenerationOptions,
  ): Promise<CompletionResult>;
  listModels?(config: ProviderProfile, options?: GenerationOptions): Promise<ProviderModel[]>;
}


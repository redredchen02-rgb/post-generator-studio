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

export interface LLMProviderAdapter {
  id: string;
  capabilities(): ProviderCapabilities;
  validateConfig(config: ProviderProfile, options?: GenerationOptions): Promise<ProviderValidationResult>;
  generate(
    request: NormalizedGenerationRequest,
    config: ProviderProfile,
    options?: GenerationOptions,
  ): AsyncIterable<GenerationEvent>;
  listModels?(config: ProviderProfile, options?: GenerationOptions): Promise<ProviderModel[]>;
}


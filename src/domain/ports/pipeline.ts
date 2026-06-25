import type {
  GenerationPreset,
  PromptTemplate,
  ProviderProfile,
} from "@/domain/schemas";
import type { Logger } from "@/domain/ports/logger";

export type PipelineContext = {
  generationId: string;
  preset: GenerationPreset;
  providerProfile: ProviderProfile;
  template: PromptTemplate;
  logger: Logger;
  abortSignal: AbortSignal;
};

export interface PipelineStep<I = unknown, O = unknown> {
  id: string;
  name: string;
  execute(context: PipelineContext, input: I): Promise<O>;
}


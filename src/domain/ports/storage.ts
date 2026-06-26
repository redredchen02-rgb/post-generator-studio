import type {
  DraftKind,
  DraftSource,
  Generation,
  GenerationDraft,
  QualityScore,
  GenerationPreset,
  GenerationPresetCreate,
  GenerationPresetUpdate,
  GenerationStatus,
  PromptTemplate,
  PromptTemplateCreate,
  PromptTemplateUpdate,
  ProviderProfile,
  ProviderProfileCreate,
  ProviderProfileUpdate,
} from "@/domain/schemas";

export type GenerationCreateInput = {
  id: string;
  idempotencyKey?: string;
  title: string;
  eventSummary: string;
  providerProfileSnapshot: Record<string, unknown>;
  promptTemplateSnapshot: Record<string, unknown>;
  generationPresetSnapshot: Record<string, unknown>;
  renderedSystemPrompt: string;
  renderedUserPrompt: string;
  model?: string;
  providerKind?: ProviderProfile["providerKind"];
};

export type GenerationUpdateInput = Partial<{
  outputContent: string;
  status: GenerationStatus;
  errorMessage: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  startedAt: string;
  completedAt: string;
  qualityScore: QualityScore;
}>;

export type GenerationDraftCreateInput = {
  id: string;
  generationId: string;
  content: string;
  kind: DraftKind;
  source: DraftSource;
  label?: string;
};

export interface ProviderProfileRepository {
  list(): Promise<ProviderProfile[]>;
  get(id: string): Promise<ProviderProfile | null>;
  create(input: ProviderProfileCreate & { id: string; apiKeyRef?: string; keyMasked?: string }): Promise<ProviderProfile>;
  update(id: string, input: ProviderProfileUpdate & { apiKeyRef?: string; keyMasked?: string | null }): Promise<ProviderProfile>;
  delete(id: string): Promise<void>;
}

export interface PromptTemplateRepository {
  list(): Promise<PromptTemplate[]>;
  get(id: string): Promise<PromptTemplate | null>;
  create(input: PromptTemplateCreate & { id: string }): Promise<PromptTemplate>;
  update(id: string, input: PromptTemplateUpdate): Promise<PromptTemplate>;
  delete(id: string): Promise<void>;
}

export interface GenerationPresetRepository {
  list(): Promise<GenerationPreset[]>;
  get(id: string): Promise<GenerationPreset | null>;
  create(input: GenerationPresetCreate & { id: string }): Promise<GenerationPreset>;
  update(id: string, input: GenerationPresetUpdate): Promise<GenerationPreset>;
  delete(id: string): Promise<void>;
}

export type GenerationListOpts = { search?: string; offset?: number; limit?: number };
export type GenerationListResult = { items: Generation[]; total: number };

export interface GenerationRepository {
  list(opts?: GenerationListOpts): Promise<GenerationListResult>;
  get(id: string): Promise<Generation | null>;
  getByIdempotencyKey(key: string): Promise<Generation | null>;
  create(input: GenerationCreateInput): Promise<Generation>;
  update(id: string, input: GenerationUpdateInput): Promise<Generation>;
  delete(id: string): Promise<void>;
}

export interface GenerationDraftRepository {
  /** Drafts for a generation, oldest first. */
  listByGeneration(generationId: string): Promise<GenerationDraft[]>;
  get(id: string): Promise<GenerationDraft | null>;
  /** Insert a draft; when setActive is true, point the generation at it in the same transaction. */
  create(input: GenerationDraftCreateInput, setActive?: boolean): Promise<GenerationDraft>;
  /** In-place content update for the working draft (autosave). */
  updateContent(id: string, content: string): Promise<GenerationDraft>;
  /** Repoint generations.activeDraftId (null to clear). */
  setActive(generationId: string, draftId: string | null): Promise<void>;
  /** Delete a draft; if it was the active one, reset the pointer in the same transaction. */
  delete(id: string): Promise<void>;
}

export interface StoragePort {
  providerProfiles: ProviderProfileRepository;
  promptTemplates: PromptTemplateRepository;
  generationPresets: GenerationPresetRepository;
  generations: GenerationRepository;
  generationDrafts: GenerationDraftRepository;
}


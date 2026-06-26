import type {
  AppError,
  Generation,
  GenerationDraft,
  GenerationPreset,
  PromptTemplate,
  ProviderProfile,
  QualityScore,
} from "@/domain/schemas";

export type BootstrapData = {
  providerProfiles: ProviderProfile[];
  promptTemplates: PromptTemplate[];
  generationPresets: GenerationPreset[];
  pipelineSteps: Array<{ id: string; name: string }>;
};

export type PaginatedGenerations = {
  items: Generation[];
  total: number;
};

export class ApiClientError extends Error {
  readonly appError: AppError;

  constructor(appError: AppError) {
    super(appError.message);
    this.name = "ApiClientError";
    this.appError = appError;
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = (await response.json()) as T | { error: AppError };
  // Throw on any structured error payload, and on any non-OK status, so a failed
  // request never slips through as a valid T (e.g. into result.content).
  if (isErrorPayload(data)) {
    throw new ApiClientError(data.error);
  }
  if (!response.ok) {
    throw new ApiClientError({ code: "HTTP_ERROR", message: `HTTP ${response.status}` });
  }
  return data as T;
}

function isErrorPayload(value: unknown): value is { error: AppError } {
  if (!value || typeof value !== "object" || !("error" in value)) return false;
  const err = (value as { error: unknown }).error;
  return Boolean(err && typeof err === "object" && "code" in err && "message" in err);
}

let bootstrapCache: BootstrapData | null = null;
let bootstrapPromise: Promise<BootstrapData> | null = null;

export function invalidateBootstrapCache(): void {
  bootstrapCache = null;
}

export async function loadBootstrap(): Promise<BootstrapData> {
  if (bootstrapCache) return bootstrapCache;
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = fetchJson<BootstrapData>("/api/bootstrap").then(
    (data) => {
      bootstrapCache = data;
      bootstrapPromise = null;
      return data;
    },
    (err) => {
      bootstrapPromise = null;
      throw err;
    },
  );
  return bootstrapPromise;
}

export async function loadGenerations(search?: string, offset?: number, limit?: number): Promise<PaginatedGenerations> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (offset !== undefined) params.set("offset", String(offset));
  if (limit !== undefined) params.set("limit", String(limit));
  return fetchJson<PaginatedGenerations>(`/api/generations?${params.toString()}`);
}

export async function getGeneration(id: string): Promise<Generation> {
  return fetchJson<Generation>(`/api/generations/${id}`);
}

export async function saveGenerationContent(id: string, outputContent: string): Promise<Generation> {
  return fetchJson<Generation>(`/api/generations/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ outputContent }),
  });
}

export async function testProviderProfile(
  id: string,
): Promise<{ ok: boolean; message: string; models?: { id: string; name?: string }[] }> {
  return fetchJson(`/api/provider-profiles/${id}/test`, { method: "POST" });
}

export async function deleteGenerationRecord(id: string): Promise<void> {
  const response = await fetch(`/api/generations/${id}`, { method: "DELETE" });
  if (!response.ok) {
    throw new ApiClientError({ code: "HTTP_ERROR", message: `HTTP ${response.status}` });
  }
}

export type CompletionResponse = {
  content: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
};

export type CompletionRequestInput = {
  prompt: string;
  systemPrompt?: string;
  presetId: string;
  providerProfileId?: string;
  signal?: AbortSignal;
};

/** Draft/version state for a generation (Unit 11). */
export type DraftState = {
  drafts: GenerationDraft[];
  activeDraftId: string | null;
  effectiveContent: string;
};

export async function loadDrafts(id: string): Promise<DraftState> {
  return fetchJson<DraftState>(`/api/generations/${id}/drafts`);
}

export async function autosaveDraft(id: string, content: string): Promise<GenerationDraft> {
  return fetchJson<GenerationDraft>(`/api/generations/${id}/drafts`, {
    method: "POST",
    body: JSON.stringify({ action: "autosave", content }),
  });
}

export async function saveDraftVersion(id: string, label?: string): Promise<GenerationDraft> {
  return fetchJson<GenerationDraft>(`/api/generations/${id}/drafts`, {
    method: "POST",
    body: JSON.stringify({ action: "saveVersion", label }),
  });
}

export async function restoreDraftVersion(id: string, draftId: string): Promise<GenerationDraft> {
  return fetchJson<GenerationDraft>(`/api/generations/${id}/drafts`, {
    method: "POST",
    body: JSON.stringify({ action: "restore", draftId }),
  });
}

/** LLM-as-Judge quality scoring for a completed generation (Unit 9). */
export async function scoreGeneration(
  id: string,
  opts?: { presetId?: string; providerProfileId?: string },
): Promise<QualityScore> {
  return fetchJson<QualityScore>(`/api/generations/${id}/score`, {
    method: "POST",
    body: JSON.stringify(opts ?? {}),
  });
}

/** One-shot, non-streaming completion (selection rewrite, continue, etc.). */
export async function requestCompletion(input: CompletionRequestInput): Promise<CompletionResponse> {
  const { signal, ...body } = input;
  return fetchJson<CompletionResponse>("/api/completions", {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

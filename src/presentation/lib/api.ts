import type {
  AppError,
  Generation,
  GenerationPreset,
  PromptTemplate,
  ProviderProfile,
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
  return Boolean(value && typeof value === "object" && "error" in value);
}

export async function loadBootstrap(): Promise<BootstrapData> {
  return fetchJson<BootstrapData>("/api/bootstrap");
}

export async function loadGenerations(search?: string, offset?: number, limit?: number): Promise<PaginatedGenerations> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (offset !== undefined) params.set("offset", String(offset));
  if (limit !== undefined) params.set("limit", String(limit));
  return fetchJson<PaginatedGenerations>(`/api/generations?${params.toString()}`);
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
  await fetch(`/api/generations/${id}`, { method: "DELETE" });
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

/** One-shot, non-streaming completion (selection rewrite, continue, etc.). */
export async function requestCompletion(input: CompletionRequestInput): Promise<CompletionResponse> {
  const { signal, ...body } = input;
  return fetchJson<CompletionResponse>("/api/completions", {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

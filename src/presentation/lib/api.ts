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
  if (!response.ok && isErrorPayload(data)) {
    throw new ApiClientError(data.error);
  }
  return data as T;
}

function isErrorPayload(value: unknown): value is { error: AppError } {
  return Boolean(value && typeof value === "object" && "error" in value);
}

export async function loadBootstrap(): Promise<BootstrapData> {
  return fetchJson<BootstrapData>("/api/bootstrap");
}

export async function loadGenerations(): Promise<Generation[]> {
  return fetchJson<Generation[]>("/api/generations?limit=50");
}

export async function saveGenerationContent(id: string, outputContent: string): Promise<Generation> {
  return fetchJson<Generation>(`/api/generations/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ outputContent }),
  });
}

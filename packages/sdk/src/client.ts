import type { ProviderProfile, ProviderProfileCreate, ProviderProfileUpdate, PromptTemplate, PromptTemplateCreate, PromptTemplateUpdate, GenerationPreset, GenerationPresetCreate, GenerationPresetUpdate, Generation, GenerationRequest, AppError } from "@postgen/domain";
import { parseSSEStream } from "./sse.js";
export type BootstrapData = { providerProfiles: ProviderProfile[]; promptTemplates: PromptTemplate[]; generationPresets: GenerationPreset[]; pipelineSteps: Array<{ id: string; name: string }>; };
export class PostgenClientError extends Error { readonly appError: AppError; constructor(appError: AppError) { super(appError.message); this.name = "PostgenClientError"; this.appError = appError; } }
export type StreamEvent = { type: "generation"; generation: Generation } | { type: "token"; value: string } | { type: "metadata"; model?: string; inputTokens?: number; outputTokens?: number } | { type: "complete" } | { type: "error"; message?: string; error?: AppError; retryable?: boolean } | { type: "final"; generation: Generation; content: string };
export class PostgenClient {
  private baseUrl: string;
  constructor(baseUrl: string = "http://localhost:3001") { this.baseUrl = baseUrl.replace(/\/$/, ""); }
  private async fetchJson<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } }); const data = await response.json(); if (!response.ok && data?.error) throw new PostgenClientError(data.error); return data as T; }
  async health(): Promise<{ ok: true }> { return this.fetchJson(`${this.baseUrl}/api/health`); }
  async bootstrap(): Promise<BootstrapData> { return this.fetchJson(`${this.baseUrl}/api/bootstrap`); }
  async listGenerations(limit?: number): Promise<Generation[]> { return this.fetchJson(`${this.baseUrl}/api/generations${limit ? `?limit=${limit}` : ""}`); }
  async getGeneration(id: string): Promise<Generation> { return this.fetchJson(`${this.baseUrl}/api/generations/${id}`); }
  async cancelGeneration(id: string): Promise<{ cancelled: boolean }> { return this.fetchJson(`${this.baseUrl}/api/generations/${id}/cancel`, { method: "POST" }); }
  async deleteGeneration(id: string): Promise<void> { await this.fetchJson(`${this.baseUrl}/api/generations/${id}`, { method: "DELETE" }); }
  async exportGeneration(id: string, format: "md" | "txt" = "md"): Promise<{ content: string; filename: string }> { const r = await fetch(`${this.baseUrl}/api/generations/${id}/export?format=${format}`); if (!r.ok) { const d = await r.json(); if (d?.error) throw new PostgenClientError(d.error); throw new Error("Export failed"); } const content = await r.text(); const filename = r.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || `generation.${format}`; return { content, filename }; }
  async *streamGeneration(request: GenerationRequest): AsyncIterable<StreamEvent> { const response = await fetch(`${this.baseUrl}/api/generations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }); if (!response.ok) { const data = await response.json(); if (data?.error) throw new PostgenClientError(data.error); throw new Error("Generation failed"); } if (!response.body) return; for await (const msg of parseSSEStream(response.body)) yield JSON.parse(msg.data) as StreamEvent; }
  async listProviderProfiles(): Promise<ProviderProfile[]> { return this.fetchJson(`${this.baseUrl}/api/provider-profiles`); }
  async getProviderProfile(id: string): Promise<ProviderProfile> { return this.fetchJson(`${this.baseUrl}/api/provider-profiles/${id}`); }
  async createProviderProfile(input: ProviderProfileCreate): Promise<ProviderProfile> { return this.fetchJson(`${this.baseUrl}/api/provider-profiles`, { method: "POST", body: JSON.stringify(input) }); }
  async updateProviderProfile(id: string, input: ProviderProfileUpdate): Promise<ProviderProfile> { return this.fetchJson(`${this.baseUrl}/api/provider-profiles/${id}`, { method: "PATCH", body: JSON.stringify(input) }); }
  async deleteProviderProfile(id: string): Promise<void> { await this.fetchJson(`${this.baseUrl}/api/provider-profiles/${id}`, { method: "DELETE" }); }
  async testProviderProfile(id: string): Promise<{ ok: boolean; message: string; models?: Array<{ id: string; name?: string }> }> { return this.fetchJson(`${this.baseUrl}/api/provider-profiles/${id}/test`, { method: "POST" }); }
  async listPromptTemplates(): Promise<PromptTemplate[]> { return this.fetchJson(`${this.baseUrl}/api/prompt-templates`); }
  async getPromptTemplate(id: string): Promise<PromptTemplate> { return this.fetchJson(`${this.baseUrl}/api/prompt-templates/${id}`); }
  async createPromptTemplate(input: PromptTemplateCreate): Promise<PromptTemplate> { return this.fetchJson(`${this.baseUrl}/api/prompt-templates`, { method: "POST", body: JSON.stringify(input) }); }
  async updatePromptTemplate(id: string, input: PromptTemplateUpdate): Promise<PromptTemplate> { return this.fetchJson(`${this.baseUrl}/api/prompt-templates/${id}`, { method: "PATCH", body: JSON.stringify(input) }); }
  async deletePromptTemplate(id: string): Promise<void> { await this.fetchJson(`${this.baseUrl}/api/prompt-templates/${id}`, { method: "DELETE" }); }
  async previewPrompt(input: { templateId?: string; systemPrompt?: string; userPromptTemplate?: string; title: string; eventSummary: string; customVariables?: Record<string, string> }): Promise<{ systemPrompt: string; userPrompt: string }> { return this.fetchJson(`${this.baseUrl}/api/prompt-templates/preview`, { method: "POST", body: JSON.stringify(input) }); }
  async listGenerationPresets(): Promise<GenerationPreset[]> { return this.fetchJson(`${this.baseUrl}/api/generation-presets`); }
  async getGenerationPreset(id: string): Promise<GenerationPreset> { return this.fetchJson(`${this.baseUrl}/api/generation-presets/${id}`); }
  async createGenerationPreset(input: GenerationPresetCreate): Promise<GenerationPreset> { return this.fetchJson(`${this.baseUrl}/api/generation-presets`, { method: "POST", body: JSON.stringify(input) }); }
  async updateGenerationPreset(id: string, input: GenerationPresetUpdate): Promise<GenerationPreset> { return this.fetchJson(`${this.baseUrl}/api/generation-presets/${id}`, { method: "PATCH", body: JSON.stringify(input) }); }
  async deleteGenerationPreset(id: string): Promise<void> { await this.fetchJson(`${this.baseUrl}/api/generation-presets/${id}`, { method: "DELETE" }); }
}

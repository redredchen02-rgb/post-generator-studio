import { PostgenClient, PostgenClientError } from "@postgen/sdk";
import type { BootstrapData } from "@postgen/sdk";
import type { Generation } from "@postgen/domain";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
export const client = new PostgenClient(API_URL);
export type { BootstrapData };
export { PostgenClientError as ApiClientError };
export async function loadBootstrap(): Promise<BootstrapData> { return client.bootstrap(); }
export async function loadGenerations(search?: string, offset?: number, limit?: number): Promise<{ items: Generation[]; total: number }> { return client.listGenerations({ search, offset, limit }); }
export async function saveGenerationContent(id: string, outputContent: string): Promise<Generation> { const r = await fetch(`${API_URL}/api/generations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outputContent }) }); const d = await r.json(); if (!r.ok && d?.error) throw new PostgenClientError(d.error); return d as Generation; }
export async function fetchPromptPreview(params: { templateId?: string; title: string; eventSummary: string; customVariables?: Record<string, string> }): Promise<{ systemPrompt: string; userPrompt: string }> { return client.previewPrompt(params); }
export async function testProviderProfile(id: string): Promise<{ ok: boolean; message: string; models?: Array<{ id: string; name?: string }> }> { return client.testProviderProfile(id); }
export async function deleteGenerationRecord(id: string): Promise<void> { await client.deleteGeneration(id); }
export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> { const r = await fetch(url, options); const d = await r.json(); if (!r.ok && d?.error) throw new PostgenClientError(d.error); return d as T; }

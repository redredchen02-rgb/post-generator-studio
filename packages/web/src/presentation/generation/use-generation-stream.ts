"use client";
import * as React from "react";
import type { AppError, Generation } from "@postgen/domain";
import { client } from "../lib/api";
type StreamPayload = { type: "generation"; generation: Generation } | { type: "token"; value: string } | { type: "metadata"; model?: string; inputTokens?: number; outputTokens?: number } | { type: "complete" } | { type: "error"; message?: string; error?: AppError; retryable?: boolean } | { type: "final"; generation: Generation; content: string };
type GenerationStreamState = { content: string; status: string; error: string | null; activeGeneration: Generation | null; metadata: { model?: string; inputTokens?: number; outputTokens?: number }; isGenerating: boolean; };
export function useGenerationStream() {
  const [state, setState] = React.useState<GenerationStreamState>({ content: "", status: "Ready", error: null, activeGeneration: null, metadata: {}, isGenerating: false });
  const activeGenerationRef = React.useRef(state.activeGeneration);
  activeGenerationRef.current = state.activeGeneration;
  const generate = React.useCallback(async (params: { title: string; eventSummary: string; presetId: string; providerProfileId?: string; regenerate?: boolean; customVariables?: Record<string, string> }) => {
    const { title, eventSummary, presetId, providerProfileId, regenerate, customVariables } = params;
    if (!presetId) { setState((s) => ({ ...s, error: "请选择 Generation Preset" })); return; }
    setState((s) => ({ ...s, isGenerating: true, error: null, content: "", metadata: {}, status: regenerate ? "Regenerating..." : "Generating..." }));
    try {
      for await (const event of client.streamGeneration({ title, eventSummary, presetId, providerProfileId: providerProfileId || undefined, idempotencyKey: regenerate ? undefined : crypto.randomUUID(), customVariables })) {
        if (event.type === "generation") setState((s) => ({ ...s, activeGeneration: event.generation, status: "Streaming response..." }));
        if (event.type === "token") setState((s) => ({ ...s, content: s.content + event.value, status: "Tokens received..." }));
        if (event.type === "metadata") setState((s) => ({ ...s, metadata: { ...s.metadata, ...event } }));
        if (event.type === "error") setState((s) => ({ ...s, error: event.message || event.error?.message || "生成失败", status: "Failed" }));
        if (event.type === "final") setState((s) => ({ ...s, activeGeneration: event.generation, content: event.content, status: event.generation.status === "completed" ? "Completed" : event.generation.status }));
      }
    } catch (e) { setState((s) => ({ ...s, error: e instanceof Error ? e.message : "Streaming failed" })); } finally { setState((s) => ({ ...s, isGenerating: false })); }
  }, []);
  const cancel = React.useCallback(async () => { const gen = activeGenerationRef.current; if (gen) await client.cancelGeneration(gen.id); setState((s) => ({ ...s, isGenerating: false, status: "Cancelled" })); }, []);
  const setContent = React.useCallback((content: string) => { setState((s) => ({ ...s, content })); }, []);
  const setStatus = React.useCallback((status: string) => { setState((s) => ({ ...s, status })); }, []);
  return { ...state, generate, cancel, setContent, setStatus };
}

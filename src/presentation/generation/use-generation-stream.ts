"use client";

import * as React from "react";
import type { AppError, Generation } from "@/domain/schemas";
import { parseSSEStream } from "@/lib/sse";

type StreamPayload =
  | { type: "generation"; generation: Generation }
  | { type: "token"; value: string }
  | { type: "metadata"; model?: string; inputTokens?: number; outputTokens?: number }
  | { type: "complete" }
  | { type: "error"; message?: string; error?: AppError; retryable?: boolean }
  | { type: "final"; generation: Generation; content: string };

type GenerationStreamState = {
  content: string;
  status: string;
  error: string | null;
  activeGeneration: Generation | null;
  metadata: { model?: string; inputTokens?: number; outputTokens?: number };
  isGenerating: boolean;
};

export function useGenerationStream() {
  const [state, setState] = React.useState<GenerationStreamState>({
    content: "",
    status: "Ready",
    error: null,
    activeGeneration: null,
    metadata: {},
    isGenerating: false,
  });
  const abortRef = React.useRef<AbortController | null>(null);

  const generate = React.useCallback(
    async (params: {
      title: string;
      eventSummary: string;
      presetId: string;
      providerProfileId?: string;
      regenerate?: boolean;
      customVariables?: Record<string, string>;
    }) => {
      const { title, eventSummary, presetId, providerProfileId, regenerate, customVariables } = params;
      if (!presetId) {
        setState((s) => ({ ...s, error: "请选择 Generation Preset" }));
        return;
      }
      setState((s) => ({
        ...s,
        isGenerating: true,
        error: null,
        content: "",
        metadata: {},
        status: regenerate ? "Regenerating..." : "Generating...",
      }));
      const controller = new AbortController();
      abortRef.current = controller;
      const response = await fetch("/api/generations", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          eventSummary,
          presetId,
          providerProfileId: providerProfileId || undefined,
          idempotencyKey: regenerate ? undefined : crypto.randomUUID(),
          customVariables: customVariables && Object.keys(customVariables).length > 0 ? customVariables : undefined,
        }),
      });

      if (!response.body) {
        setState((s) => ({ ...s, error: "Streaming response unavailable", isGenerating: false }));
        return;
      }

      try {
        for await (const msg of parseSSEStream(response.body)) {
          const payload = JSON.parse(msg.data) as StreamPayload;
          if (payload.type === "generation") {
            setState((s) => ({ ...s, activeGeneration: payload.generation, status: "Streaming response..." }));
          }
          if (payload.type === "token") {
            setState((s) => ({ ...s, content: s.content + payload.value, status: "Tokens received..." }));
          }
          if (payload.type === "metadata") {
            setState((s) => ({ ...s, metadata: { ...s.metadata, ...payload } }));
          }
          if (payload.type === "error") {
            setState((s) => ({
              ...s,
              error: payload.message || payload.error?.message || "生成失败",
              status: "Failed",
            }));
          }
          if (payload.type === "final") {
            setState((s) => ({
              ...s,
              activeGeneration: payload.generation,
              content: payload.content,
              status: payload.generation.status === "completed" ? "Completed" : payload.generation.status,
            }));
          }
        }
      } catch (streamError) {
        if (!controller.signal.aborted) {
          setState((s) => ({
            ...s,
            error: streamError instanceof Error ? streamError.message : "Streaming failed",
          }));
        }
      } finally {
        setState((s) => ({ ...s, isGenerating: false }));
        abortRef.current = null;
      }
    },
    [],
  );

  const cancel = React.useCallback(async () => {
    if (state.activeGeneration) {
      await fetch(`/api/generations/${state.activeGeneration.id}/cancel`, { method: "POST" });
    }
    abortRef.current?.abort();
    setState((s) => ({ ...s, isGenerating: false, status: "Cancelled" }));
  }, [state.activeGeneration]);

  const setContent = React.useCallback((content: string) => {
    setState((s) => ({ ...s, content }));
  }, []);

  const setStatus = React.useCallback((status: string) => {
    setState((s) => ({ ...s, status }));
  }, []);

  return { ...state, generate, cancel, setContent, setStatus };
}

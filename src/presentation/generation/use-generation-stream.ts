"use client";

import * as React from "react";
import type { AppError, Generation, GenerationControls } from "@/domain/schemas";
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
  const activeGenerationRef = React.useRef(state.activeGeneration);
  activeGenerationRef.current = state.activeGeneration;
  const bufferRef = React.useRef("");
  const flushTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const generate = React.useCallback(
    async (params: {
      title: string;
      eventSummary: string;
      presetId: string;
      providerProfileId?: string;
      regenerate?: boolean;
      customVariables?: Record<string, string>;
      controls?: GenerationControls;
      onSuccess?: (vars: Record<string, string>) => void;
    }) => {
      const { title, eventSummary, presetId, providerProfileId, regenerate, customVariables, controls } = params;
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
      bufferRef.current = "";
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      flushTimerRef.current = setInterval(() => {
        if (bufferRef.current) {
          const chunk = bufferRef.current;
          bufferRef.current = "";
          setState((s) => ({ ...s, content: s.content + chunk }));
        }
      }, 100);
      const timeoutSignal = AbortSignal.timeout(120_000);
      let combinedSignal: AbortSignal;
      if (typeof AbortSignal.any === "function") {
        combinedSignal = AbortSignal.any([controller.signal, timeoutSignal]);
      } else {
        const combined = new AbortController();
        const onAbort = () => combined.abort();
        controller.signal.addEventListener("abort", onAbort, { once: true });
        timeoutSignal.addEventListener("abort", onAbort, { once: true });
        combinedSignal = combined.signal;
      }
      const response = await fetch("/api/generations", {
        method: "POST",
        signal: combinedSignal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          eventSummary,
          presetId,
          providerProfileId: providerProfileId || undefined,
          idempotencyKey: regenerate ? undefined : crypto.randomUUID(),
          customVariables: customVariables && Object.keys(customVariables).length > 0 ? customVariables : undefined,
          ...controls,
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
            bufferRef.current += payload.value;
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
            bufferRef.current = "";
            setState((s) => ({
              ...s,
              activeGeneration: payload.generation,
              content: payload.content,
              status: payload.generation.status === "completed" ? "Completed" : payload.generation.status,
            }));
            if (payload.generation.status === "completed") {
              params.onSuccess?.(params.customVariables ?? {});
            }
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
        if (flushTimerRef.current) {
          clearInterval(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        const remaining = bufferRef.current;
        bufferRef.current = "";
        setState((s) => ({ ...s, content: remaining ? s.content + remaining : s.content, isGenerating: false }));
        abortRef.current = null;
      }
    },
    [],
  );

  const cancel = React.useCallback(async () => {
    const gen = activeGenerationRef.current;
    if (gen) {
      await fetch(`/api/generations/${gen.id}/cancel`, { method: "POST" });
    }
    abortRef.current?.abort();
    setState((s) => ({ ...s, isGenerating: false, status: "Cancelled" }));
  }, []);

  const setContent = React.useCallback((content: string) => {
    setState((s) => ({ ...s, content }));
  }, []);

  const setStatus = React.useCallback((status: string) => {
    setState((s) => ({ ...s, status }));
  }, []);

  return { ...state, generate, cancel, setContent, setStatus };
}

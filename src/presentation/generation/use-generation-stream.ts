"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("Generation");
  const [state, setState] = React.useState<GenerationStreamState>({
    content: "",
    status: t("statusReady"),
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
        setState((s) => ({ ...s, error: t("errorNoPreset") }));
        return;
      }
      setState((s) => ({
        ...s,
        isGenerating: true,
        error: null,
        content: "",
        metadata: {},
        status: regenerate ? t("statusRegenerating") : t("statusGenerating"),
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
        setState((s) => ({ ...s, error: t("errorNoStream"), isGenerating: false }));
        return;
      }

      try {
        for await (const msg of parseSSEStream(response.body)) {
          const payload = JSON.parse(msg.data) as StreamPayload;
          if (payload.type === "generation") {
            setState((s) => ({ ...s, activeGeneration: payload.generation, status: t("statusStreaming") }));
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
              error: payload.message || payload.error?.message || t("statusFailed"),
              status: t("statusFailed"),
            }));
          }
          if (payload.type === "final") {
            bufferRef.current = "";
            setState((s) => ({
              ...s,
              activeGeneration: payload.generation,
              content: payload.content,
              status: payload.generation.status === "completed" ? t("statusCompleted") : payload.generation.status,
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
            error: streamError instanceof Error ? streamError.message : t("statusStreamFailed"),
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
    [t],
  );

  const cancel = React.useCallback(async () => {
    const gen = activeGenerationRef.current;
    if (gen) {
      await fetch(`/api/generations/${gen.id}/cancel`, { method: "POST" });
    }
    abortRef.current?.abort();
    setState((s) => ({ ...s, isGenerating: false, status: t("statusCancelled") }));
  }, [t]);

  const setContent = React.useCallback((content: string) => {
    setState((s) => ({ ...s, content }));
  }, []);

  const setStatus = React.useCallback((status: string) => {
    setState((s) => ({ ...s, status }));
  }, []);

  // Point the main editor at an externally-produced generation (e.g. a selected variant).
  const setActiveGeneration = React.useCallback(
    (generation: Generation, content: string) => {
      setState((s) => ({ ...s, activeGeneration: generation, content, status: t("statusCompleted"), error: null }));
    },
    [t],
  );

  return { ...state, generate, cancel, setContent, setStatus, setActiveGeneration };
}

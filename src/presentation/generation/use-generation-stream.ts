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
  // Raw upstream (provider/network) error text, kept out of the localized main
  // message and surfaced only in an expandable "details" area for debugging.
  errorDetail: string | null;
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
    errorDetail: null,
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
        errorDetail: null,
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

      if (!response.ok) {
        // Server returned 4xx/5xx with a non-SSE body. Surface a clear error
        // instead of feeding the error payload into the SSE parser (which would
        // throw a JSON parse error and read as "stream broke").
        const detail = await response.text().catch(() => null);
        setState((s) => ({
          ...s,
          error: t("errorProvider"),
          errorDetail: detail || null,
          status: t("statusFailed"),
          isGenerating: false,
        }));
        return;
      }

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
            // Pick only the metadata fields; spreading the whole payload would
            // leak the discriminant `type: "metadata"` into the state object.
            setState((s) => ({
              ...s,
              metadata: {
                model: payload.model ?? s.metadata.model,
                inputTokens: payload.inputTokens ?? s.metadata.inputTokens,
                outputTokens: payload.outputTokens ?? s.metadata.outputTokens,
              },
            }));
          }
          if (payload.type === "error") {
            // Localize the main message; keep the raw provider/server text in
            // errorDetail so zh-CN never shows untranslated upstream English.
            const detail = payload.message || payload.error?.message || null;
            setState((s) => ({
              ...s,
              error: t("errorProvider"),
              errorDetail: detail,
              status: t("statusFailed"),
            }));
          }
          if (payload.type === "final") {
            bufferRef.current = "";
            const finalStatus =
              payload.generation.status === "completed" ? t("statusCompleted")
              : payload.generation.status === "failed" ? t("statusFailed")
              : payload.generation.status === "cancelled" ? t("statusCancelled")
              : payload.generation.status === "streaming" ? t("statusStreaming")
              : payload.generation.status === "queued" ? t("statusQueued")
              : t("statusReady");
            setState((s) => ({
              ...s,
              activeGeneration: payload.generation,
              content: payload.content,
              status: finalStatus,
            }));
            if (payload.generation.status === "completed") {
              params.onSuccess?.(params.customVariables ?? {});
            }
          }
        }
      } catch (streamError) {
        if (!controller.signal.aborted) {
          // Main message stays localized; the raw Error text goes to errorDetail.
          const detail = streamError instanceof Error ? streamError.message : null;
          setState((s) => ({
            ...s,
            error: t("statusStreamFailed"),
            errorDetail: detail,
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

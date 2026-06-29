"use client";

import * as React from "react";
import type { Generation, GenerationControls } from "@/domain/schemas";
import { parseSSEStream } from "@/lib/sse";
import { buildGenerationRequestBody, type GenerationStreamPayload } from "./generation-stream-protocol";

/**
 * Multi-variant generation (Unit 10). Runs N independent generations *serially*
 * — each is its own top-level `generations` record (D6: "variant = top-level
 * generation"), so no schema change is needed. Variants never overwrite each
 * other, one failure does not stop the rest, and cancel stops everything.
 *
 * Per-variant edits live in React state (session-persistent: switching between
 * variants keeps edits). Durable draft persistence is deferred to Unit 11.
 */

export type VariantStatus = "pending" | "streaming" | "completed" | "failed" | "cancelled";

export type VariantSlot = {
  index: number;
  status: VariantStatus;
  content: string;
  generation: Generation | null;
  error: string | null;
  /** True once the user edits this variant's content. */
  edited: boolean;
};

export type VariantGenerateParams = {
  title: string;
  eventSummary: string;
  presetId: string;
  providerProfileId?: string;
  customVariables?: Record<string, string>;
  controls?: GenerationControls;
};

function emptySlots(count: number): VariantSlot[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    status: "pending" as VariantStatus,
    content: "",
    generation: null,
    error: null,
    edited: false,
  }));
}

export function useVariantGeneration() {
  const [variants, setVariants] = React.useState<VariantSlot[]>([]);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const currentGenIdRef = React.useRef<string | null>(null);
  const cancelledRef = React.useRef(false);
  const tokenBufferRef = React.useRef<Map<number, string>>(new Map());
  const flushTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const patchSlot = React.useCallback((index: number, patch: Partial<VariantSlot>) => {
    setVariants((prev) => prev.map((slot) => (slot.index === index ? { ...slot, ...patch } : slot)));
  }, []);

  const flushTokens = React.useCallback(() => {
    const buffer = tokenBufferRef.current;
    if (buffer.size === 0) return;
    const entries = Array.from(buffer.entries());
    buffer.clear();
    setVariants((prev) =>
      prev.map((slot) => {
        const chunk = entries.find(([i]) => i === slot.index);
        return chunk ? { ...slot, content: slot.content + chunk[1] } : slot;
      }),
    );
  }, []);

  const streamOne = React.useCallback(
    async (params: VariantGenerateParams, index: number, signal: AbortSignal) => {
      const response = await fetch("/api/generations", {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildGenerationRequestBody({ ...params, idempotencyKey: crypto.randomUUID() })),
      });
      if (!response.ok) {
        // A non-OK response carries a JSON/HTML error body, not SSE — the parser
        // would yield nothing and leave the slot stuck on "streaming" forever.
        const detail = await response.text().catch(() => null);
        patchSlot(index, { status: "failed", error: detail || `生成失败 (HTTP ${response.status})` });
        return;
      }
      if (!response.body) {
        patchSlot(index, { status: "failed", error: "Streaming response unavailable" });
        return;
      }
      for await (const msg of parseSSEStream(response.body)) {
        const payload = JSON.parse(msg.data) as GenerationStreamPayload;
        if (payload.type === "generation") {
          currentGenIdRef.current = payload.generation.id;
          patchSlot(index, { generation: payload.generation });
        } else if (payload.type === "token") {
          tokenBufferRef.current.set(index, (tokenBufferRef.current.get(index) || "") + payload.value);
        } else if (payload.type === "error") {
          patchSlot(index, { status: "failed", error: payload.message || payload.error?.message || "生成失败" });
        } else if (payload.type === "final") {
          tokenBufferRef.current.delete(index);
          patchSlot(index, {
            generation: payload.generation,
            content: payload.content,
            status: payload.generation.status === "completed" ? "completed" : "failed",
          });
        }
      }
    },
    [patchSlot],
  );

  const generateVariants = React.useCallback(
    async (params: VariantGenerateParams, count: number) => {
      cancelledRef.current = false;
      setIsGenerating(true);
      setVariants(emptySlots(count));
      tokenBufferRef.current.clear();
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      flushTimerRef.current = setInterval(flushTokens, 100);
      for (let i = 0; i < count; i++) {
        if (cancelledRef.current) break;
        const controller = new AbortController();
        abortRef.current = controller;
        currentGenIdRef.current = null;
        patchSlot(i, { status: "streaming" });
        try {
          await streamOne(params, i, controller.signal);
        } catch (error) {
          if (!cancelledRef.current) {
            patchSlot(i, { status: "failed", error: error instanceof Error ? error.message : "生成失败" });
          }
        }
      }
      if (cancelledRef.current) {
        setVariants((prev) =>
          prev.map((slot) =>
            slot.status === "pending" || slot.status === "streaming" ? { ...slot, status: "cancelled" } : slot,
          ),
        );
      }
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      flushTokens();
      abortRef.current = null;
      setIsGenerating(false);
    },
    [patchSlot, streamOne, flushTokens],
  );

  const cancel = React.useCallback(async () => {
    cancelledRef.current = true;
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const genId = currentGenIdRef.current;
    if (genId) {
      await fetch(`/api/generations/${genId}/cancel`, { method: "POST" }).catch(() => {});
    }
    abortRef.current?.abort();
  }, []);

  const setVariantContent = React.useCallback((index: number, content: string) => {
    setVariants((prev) => prev.map((slot) => (slot.index === index ? { ...slot, content, edited: true } : slot)));
  }, []);

  const reset = React.useCallback(() => {
    setVariants([]);
  }, []);

  return { variants, isGenerating, generateVariants, cancel, setVariantContent, reset };
}

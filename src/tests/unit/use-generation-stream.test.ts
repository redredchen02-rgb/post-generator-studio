// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useGenerationStream } from "@/presentation/generation/use-generation-stream";

function streamResponse(payloads: Array<Record<string, unknown>>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const p of payloads) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(p)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

const gen = (status: string) => ({
  id: "gen_1",
  title: "T",
  eventSummary: "E",
  status,
});

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

const baseParams = { title: "T", eventSummary: "E", presetId: "preset_1" };

describe("useGenerationStream", () => {
  it("accumulates tokens and finalizes a completed generation", async () => {
    global.fetch = (async () =>
      streamResponse([
        { type: "generation", generation: gen("streaming") },
        { type: "token", value: "Hello" },
        { type: "token", value: " world" },
        { type: "metadata", model: "m", inputTokens: 5, outputTokens: 2 },
        { type: "final", generation: gen("completed"), content: "Hello world" },
      ])) as typeof fetch;

    const onSuccess = vi.fn();
    const { result } = renderHook(() => useGenerationStream());

    await act(async () => {
      await result.current.generate({ ...baseParams, onSuccess });
    });

    expect(result.current.content).toBe("Hello world");
    expect(result.current.status).toBe("Completed");
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.metadata).toMatchObject({ model: "m", inputTokens: 5, outputTokens: 2 });
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("surfaces an error event as a failed status with the message", async () => {
    global.fetch = (async () =>
      streamResponse([{ type: "error", message: "boom" }])) as typeof fetch;

    const { result } = renderHook(() => useGenerationStream());
    await act(async () => {
      await result.current.generate(baseParams);
    });

    expect(result.current.error).toBe("boom");
    expect(result.current.status).toBe("Failed");
    expect(result.current.isGenerating).toBe(false);
  });

  it("validates that a preset is selected before fetching", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const { result } = renderHook(() => useGenerationStream());
    await act(async () => {
      await result.current.generate({ title: "T", eventSummary: "E", presetId: "" });
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.error).toBe("请选择 Generation Preset");
  });

  it("cancel posts to the cancel endpoint and marks the state cancelled", async () => {
    const calls: string[] = [];
    global.fetch = (async (url: string) => {
      calls.push(String(url));
      if (String(url).includes("/cancel")) return new Response(null, { status: 200 });
      // Long-lived stream that yields a generation then stays open until aborted.
      return streamResponse([{ type: "generation", generation: gen("streaming") }]);
    }) as typeof fetch;

    const { result } = renderHook(() => useGenerationStream());
    await act(async () => {
      await result.current.generate(baseParams);
    });
    await act(async () => {
      await result.current.cancel();
    });

    expect(calls.some((u) => u.includes("/api/generations/gen_1/cancel"))).toBe(true);
    expect(result.current.status).toBe("Cancelled");
    expect(result.current.isGenerating).toBe(false);
  });
});

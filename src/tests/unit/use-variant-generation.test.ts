// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useVariantGeneration } from "@/presentation/generation/use-variant-generation";

function streamResponse(payloads: Array<Record<string, unknown>>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const p of payloads) controller.enqueue(encoder.encode(`data: ${JSON.stringify(p)}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

const gen = (id: string, status: string) => ({ id, title: "T", eventSummary: "E", status });

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

const params = { title: "T", eventSummary: "E", presetId: "preset_1" };

describe("useVariantGeneration", () => {
  it("produces N independent variants whose content does not cross-contaminate", async () => {
    let call = 0;
    global.fetch = (async () => {
      call += 1;
      const n = call;
      return streamResponse([
        { type: "generation", generation: gen(`gen_${n}`, "streaming") },
        { type: "token", value: `body ${n}` },
        { type: "final", generation: gen(`gen_${n}`, "completed"), content: `body ${n}` },
      ]);
    }) as typeof fetch;

    const { result } = renderHook(() => useVariantGeneration());
    await act(async () => {
      await result.current.generateVariants(params, 3);
    });

    expect(result.current.variants).toHaveLength(3);
    expect(result.current.variants.map((v) => v.content)).toEqual(["body 1", "body 2", "body 3"]);
    expect(result.current.variants.map((v) => v.generation?.id)).toEqual(["gen_1", "gen_2", "gen_3"]);
    expect(result.current.variants.every((v) => v.status === "completed")).toBe(true);
    expect(result.current.isGenerating).toBe(false);
  });

  it("isolates a failed variant without stopping the others", async () => {
    let call = 0;
    global.fetch = (async () => {
      call += 1;
      if (call === 2) return streamResponse([{ type: "error", message: "boom" }]);
      return streamResponse([
        { type: "generation", generation: gen(`gen_${call}`, "streaming") },
        { type: "final", generation: gen(`gen_${call}`, "completed"), content: `ok ${call}` },
      ]);
    }) as typeof fetch;

    const { result } = renderHook(() => useVariantGeneration());
    await act(async () => {
      await result.current.generateVariants(params, 3);
    });

    const statuses = result.current.variants.map((v) => v.status);
    expect(statuses).toEqual(["completed", "failed", "completed"]);
    expect(result.current.variants[1].error).toBe("boom");
    expect(result.current.variants[0].content).toBe("ok 1");
    expect(result.current.variants[2].content).toBe("ok 3");
  });

  it("keeps a per-variant edit in state (session-persistent across reads)", async () => {
    global.fetch = (async () =>
      streamResponse([
        { type: "generation", generation: gen("gen_1", "streaming") },
        { type: "final", generation: gen("gen_1", "completed"), content: "original" },
      ])) as typeof fetch;

    const { result } = renderHook(() => useVariantGeneration());
    await act(async () => {
      await result.current.generateVariants(params, 1);
    });
    act(() => {
      result.current.setVariantContent(0, "my edit");
    });

    expect(result.current.variants[0].content).toBe("my edit");
    expect(result.current.variants[0].edited).toBe(true);
  });

  it("cancelling stops variants that have not run yet", async () => {
    const genCalls: string[] = [];
    global.fetch = (async (url: string) => {
      if (String(url).includes("/cancel")) return new Response(null, { status: 200 });
      genCalls.push(String(url));
      const n = genCalls.length;
      return streamResponse([
        { type: "generation", generation: gen(`gen_${n}`, "streaming") },
        { type: "final", generation: gen(`gen_${n}`, "completed"), content: `ok ${n}` },
      ]);
    }) as typeof fetch;

    const { result } = renderHook(() => useVariantGeneration());
    await act(async () => {
      const run = result.current.generateVariants(params, 3);
      // Cancel before the first variant's request resolves — the loop must break.
      await result.current.cancel();
      await run;
    });

    expect(result.current.isGenerating).toBe(false);
    // Only the first variant ran; the rest were cancelled before starting.
    expect(genCalls).toHaveLength(1);
    expect(result.current.variants[1].status).toBe("cancelled");
    expect(result.current.variants[2].status).toBe("cancelled");
  });

  it("cancel posts to the cancel endpoint for the active generation", async () => {
    const calls: string[] = [];
    global.fetch = (async (url: string) => {
      calls.push(String(url));
      if (String(url).includes("/cancel")) return new Response(null, { status: 200 });
      return streamResponse([
        { type: "generation", generation: gen("gen_1", "streaming") },
        { type: "final", generation: gen("gen_1", "completed"), content: "done" },
      ]);
    }) as typeof fetch;

    const { result } = renderHook(() => useVariantGeneration());
    await act(async () => {
      await result.current.generateVariants(params, 1);
    });
    await act(async () => {
      await result.current.cancel();
    });

    expect(calls.some((u) => u.includes("/api/generations/gen_1/cancel"))).toBe(true);
  });

  it("marks a variant failed (not stuck on streaming) when the server returns a non-OK response", async () => {
    // Regression: streamOne never checked response.ok, so a non-SSE error body
    // yielded nothing and left the slot stuck on "streaming" forever.
    global.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: "server boom" } }), { status: 500 })) as typeof fetch;

    const { result } = renderHook(() => useVariantGeneration());
    await act(async () => {
      await result.current.generateVariants(params, 1);
    });

    expect(result.current.variants[0].status).toBe("failed");
    expect(result.current.isGenerating).toBe(false);
  });

  it("reset clears all variants", async () => {
    global.fetch = (async () =>
      streamResponse([{ type: "final", generation: gen("gen_1", "completed"), content: "x" }])) as typeof fetch;
    const { result } = renderHook(() => useVariantGeneration());
    await act(async () => {
      await result.current.generateVariants(params, 1);
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.variants).toEqual([]);
  });
});

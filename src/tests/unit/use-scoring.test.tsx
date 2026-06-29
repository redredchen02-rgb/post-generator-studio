// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

const scoreGeneration = vi.fn();
vi.mock("@/presentation/lib/api", () => ({
  scoreGeneration: (...a: unknown[]) => scoreGeneration(...a),
}));

import { useScoring } from "@/presentation/generation/use-scoring";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gen = (id: string, qualityScore?: unknown): any => ({ id, qualityScore });

beforeEach(() => {
  scoreGeneration.mockResolvedValue({ overall: 8 });
});
afterEach(() => vi.clearAllMocks());

const baseArgs = { content: "real content", presetId: "p1", providerProfileId: "prov", setStatus: () => {} };

describe("useScoring", () => {
  it("does nothing when there is no active generation or content is blank", async () => {
    const { result } = renderHook(() => useScoring({ ...baseArgs, activeGeneration: gen("g1"), content: "   " }));
    await act(async () => { await result.current.score(); });
    expect(scoreGeneration).not.toHaveBeenCalled();
    expect(result.current.qualityScore).toBeNull();
  });

  it("scores the active generation and stores the result", async () => {
    const { result } = renderHook(() => useScoring({ ...baseArgs, activeGeneration: gen("g1") }));
    await act(async () => { await result.current.score(); });
    expect(scoreGeneration).toHaveBeenCalledWith("g1", { presetId: "p1", providerProfileId: "prov" });
    expect(result.current.qualityScore).toEqual({ overall: 8 });
  });

  it("reflects an already-scored generation and resets when it changes", async () => {
    const { result, rerender } = renderHook(
      ({ g }) => useScoring({ ...baseArgs, activeGeneration: g }),
      { initialProps: { g: gen("g1", { overall: 5 }) } },
    );
    await waitFor(() => expect(result.current.qualityScore).toEqual({ overall: 5 }));
    rerender({ g: gen("g2") });
    await waitFor(() => expect(result.current.qualityScore).toBeNull());
  });

  it("clearScore wipes the current score", async () => {
    const { result } = renderHook(() => useScoring({ ...baseArgs, activeGeneration: gen("g1") }));
    await act(async () => { await result.current.score(); });
    expect(result.current.qualityScore).toEqual({ overall: 8 });
    act(() => result.current.clearScore());
    expect(result.current.qualityScore).toBeNull();
  });

  it("retries once on a 5xx error then reports failure", async () => {
    const setStatus = vi.fn();
    scoreGeneration.mockRejectedValueOnce(new Error("HTTP 503")).mockRejectedValueOnce(new Error("HTTP 503"));
    const { result } = renderHook(() => useScoring({ ...baseArgs, activeGeneration: gen("g1"), setStatus }));
    await act(async () => { await result.current.score(); });
    expect(scoreGeneration).toHaveBeenCalledTimes(2);
    expect(setStatus).toHaveBeenCalledWith("scoreFailed");
  });
});

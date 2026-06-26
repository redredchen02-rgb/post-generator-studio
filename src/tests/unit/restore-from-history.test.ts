// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const getGeneration = vi.fn();
const loadDrafts = vi.fn();

vi.mock("@/presentation/lib/api", () => ({
  getGeneration: (...a: unknown[]) => getGeneration(...a),
  loadDrafts: (...a: unknown[]) => loadDrafts(...a),
}));

import { useRestoreFromHistory } from "@/presentation/generation/use-restore-from-history";

const generation = {
  id: "gen_1",
  title: "Restored title",
  eventSummary: "Restored summary",
  generationPresetSnapshot: { id: "preset_9" },
  status: "completed",
  createdAt: "2026-06-26T00:00:00Z",
};

beforeEach(() => {
  getGeneration.mockResolvedValue(generation);
  loadDrafts.mockResolvedValue({ drafts: [], activeDraftId: null, effectiveContent: "working draft body" });
});

afterEach(() => vi.clearAllMocks());

describe("useRestoreFromHistory", () => {
  it("loads the generation and active draft, then calls onRestore", async () => {
    const onRestore = vi.fn();
    const onError = vi.fn();
    renderHook(() => useRestoreFromHistory({ generationId: "gen_1", onRestore, onError }));

    await waitFor(() => expect(onRestore).toHaveBeenCalled());
    expect(onRestore).toHaveBeenCalledWith({
      generation,
      content: "working draft body",
      presetId: "preset_9",
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it("calls onError when the generation cannot be loaded (e.g. deleted)", async () => {
    getGeneration.mockRejectedValue(new Error("404"));
    const onRestore = vi.fn();
    const onError = vi.fn();
    renderHook(() => useRestoreFromHistory({ generationId: "gone", onRestore, onError }));

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onRestore).not.toHaveBeenCalled();
  });

  it("does nothing when there is no generationId", async () => {
    const onRestore = vi.fn();
    const onError = vi.fn();
    renderHook(() => useRestoreFromHistory({ generationId: null, onRestore, onError }));

    await new Promise((r) => setTimeout(r, 30));
    expect(getGeneration).not.toHaveBeenCalled();
    expect(onRestore).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("restores only once even across re-renders", async () => {
    const onRestore = vi.fn();
    const { rerender } = renderHook(
      ({ id }) => useRestoreFromHistory({ generationId: id, onRestore, onError: () => {} }),
      { initialProps: { id: "gen_1" } },
    );
    await waitFor(() => expect(onRestore).toHaveBeenCalledTimes(1));
    rerender({ id: "gen_1" });
    await new Promise((r) => setTimeout(r, 30));
    expect(getGeneration).toHaveBeenCalledTimes(1);
    expect(onRestore).toHaveBeenCalledTimes(1);
  });
});

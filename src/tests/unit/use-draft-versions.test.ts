// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const loadDrafts = vi.fn();
const autosaveDraft = vi.fn();
const saveDraftVersion = vi.fn();
const restoreDraftVersion = vi.fn();

vi.mock("@/presentation/lib/api", () => ({
  loadDrafts: (...a: unknown[]) => loadDrafts(...a),
  autosaveDraft: (...a: unknown[]) => autosaveDraft(...a),
  saveDraftVersion: (...a: unknown[]) => saveDraftVersion(...a),
  restoreDraftVersion: (...a: unknown[]) => restoreDraftVersion(...a),
}));

import { useDraftVersions } from "@/presentation/generation/use-draft-versions";

const snapshot = (id: string) => ({ id, generationId: "gen_1", content: "v", kind: "snapshot", source: "edited", createdAt: "2026-06-26T00:00:00Z" });
const working = { id: "w", generationId: "gen_1", content: "loaded", kind: "working", source: "generated", createdAt: "2026-06-26T00:00:00Z" };

beforeEach(() => {
  loadDrafts.mockResolvedValue({ drafts: [working, snapshot("s1")], activeDraftId: "w", effectiveContent: "loaded" });
  autosaveDraft.mockResolvedValue(working);
  saveDraftVersion.mockResolvedValue(snapshot("s2"));
  restoreDraftVersion.mockResolvedValue({ ...snapshot("s1"), content: "restored" });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("useDraftVersions", () => {
  it("loads only snapshot versions when the generation changes", async () => {
    const { result } = renderHook(() =>
      useDraftVersions({ generationId: "gen_1", content: "loaded", isGenerating: false, onRestoreContent: () => {} }),
    );
    await waitFor(() => expect(result.current.versions).toHaveLength(1));
    expect(result.current.versions[0].kind).toBe("snapshot");
  });

  it("does NOT autosave content identical to what was loaded", async () => {
    renderHook(() =>
      useDraftVersions({ generationId: "gen_1", content: "loaded", isGenerating: false, onRestoreContent: () => {} }),
    );
    await waitFor(() => expect(loadDrafts).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(autosaveDraft).not.toHaveBeenCalled();
  });

  it("debounce-autosaves an edit and never autosaves while generating", async () => {
    const { rerender } = renderHook(
      ({ content, isGenerating }) =>
        useDraftVersions({ generationId: "gen_1", content, isGenerating, onRestoreContent: () => {} }),
      { initialProps: { content: "loaded", isGenerating: false } },
    );
    await waitFor(() => expect(loadDrafts).toHaveBeenCalled());

    // Edit while generating → must not autosave.
    rerender({ content: "mid-stream", isGenerating: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(autosaveDraft).not.toHaveBeenCalled();

    // Edit while idle → autosave after the debounce.
    rerender({ content: "user edit", isGenerating: false });
    await waitFor(() => expect(autosaveDraft).toHaveBeenCalledWith("gen_1", "user edit"), { timeout: 2000 });
  });

  it("restore pushes the restored content back through onRestoreContent", async () => {
    const onRestoreContent = vi.fn();
    const { result } = renderHook(() =>
      useDraftVersions({ generationId: "gen_1", content: "loaded", isGenerating: false, onRestoreContent }),
    );
    await waitFor(() => expect(result.current.versions).toHaveLength(1));
    await act(async () => {
      await result.current.restore("s1");
    });
    expect(restoreDraftVersion).toHaveBeenCalledWith("gen_1", "s1");
    expect(onRestoreContent).toHaveBeenCalledWith("restored");
  });

  it("toggleCompare selects then clears the compared version", async () => {
    const { result } = renderHook(() =>
      useDraftVersions({ generationId: "gen_1", content: "loaded", isGenerating: false, onRestoreContent: () => {} }),
    );
    await waitFor(() => expect(result.current.versions).toHaveLength(1));
    act(() => result.current.toggleCompare("s1"));
    expect(result.current.compareId).toBe("s1");
    expect(result.current.compareVersion?.id).toBe("s1");
    act(() => result.current.toggleCompare("s1"));
    expect(result.current.compareId).toBeNull();
  });
});

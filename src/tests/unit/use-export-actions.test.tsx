// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

const saveGenerationContent = vi.fn();
vi.mock("@/presentation/lib/api", () => ({
  saveGenerationContent: (...a: unknown[]) => saveGenerationContent(...a),
}));

import { useExportActions } from "@/presentation/generation/use-export-actions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gen = (id: string): any => ({ id });

const writeText = vi.fn();

beforeEach(() => {
  writeText.mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  saveGenerationContent.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("useExportActions", () => {
  it("copies markdown verbatim", async () => {
    const setStatus = vi.fn();
    const { result } = renderHook(() =>
      useExportActions({ content: "# Hi **bold**", title: "t", activeGeneration: gen("g1"), setStatus }),
    );
    await act(async () => { await result.current.copyMarkdown(); });
    expect(writeText).toHaveBeenCalledWith("# Hi **bold**");
    expect(setStatus).toHaveBeenCalledWith("markdownCopied");
  });

  it("copies plain text with markdown stripped", async () => {
    const { result } = renderHook(() =>
      useExportActions({ content: "# Hi **bold**", title: "t", activeGeneration: gen("g1"), setStatus: () => {} }),
    );
    await act(async () => { await result.current.copyPlainText(); });
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).not.toContain("**");
    expect(copied).toContain("bold");
  });

  it("reports a copy failure via status", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    const setStatus = vi.fn();
    const { result } = renderHook(() =>
      useExportActions({ content: "x", title: "t", activeGeneration: gen("g1"), setStatus }),
    );
    await act(async () => { await result.current.copyMarkdown(); });
    expect(setStatus).toHaveBeenCalledWith("copyFailed");
  });

  it("saves to history and invalidates the score via onSaved", async () => {
    const onSaved = vi.fn();
    const setStatus = vi.fn();
    const { result } = renderHook(() =>
      useExportActions({ content: "body", title: "t", activeGeneration: gen("g9"), setStatus, onSaved }),
    );
    await act(async () => { await result.current.saveToHistory(); });
    expect(saveGenerationContent).toHaveBeenCalledWith("g9", "body");
    expect(onSaved).toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith("savedToHistory");
  });

  it("no-ops save when there is no active generation", async () => {
    const { result } = renderHook(() =>
      useExportActions({ content: "body", title: "t", activeGeneration: null, setStatus: () => {} }),
    );
    await act(async () => { await result.current.saveToHistory(); });
    expect(saveGenerationContent).not.toHaveBeenCalled();
  });
});

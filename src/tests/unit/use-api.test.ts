// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useApi } from "@/presentation/lib/use-api";

describe("useApi ignore-stale guard", () => {
  it("commits the latest fetch result even when an earlier fetch resolves last", async () => {
    // Two deferred fetches: the FIRST started resolves LAST. The hook must keep
    // the result of the most recently started call, not the slow earlier one.
    const deferreds: Array<(value: string) => void> = [];
    const fetcher = () =>
      new Promise<string>((resolve) => {
        deferreds.push(resolve);
      });

    const { result, rerender } = renderHook(({ f }) => useApi(f), {
      initialProps: { f: fetcher },
    });

    // Initial mount triggered call #1. Force a second load by swapping fetcher
    // identity (mirrors search/offset changing).
    const fetcher2 = () =>
      new Promise<string>((resolve) => {
        deferreds.push(resolve);
      });
    rerender({ f: fetcher2 });

    await waitFor(() => expect(deferreds.length).toBe(2));

    // Resolve the NEWER call first, then the older one.
    await act(async () => {
      deferreds[1]("newer");
    });
    await act(async () => {
      deferreds[0]("older");
    });

    // The stale "older" result must NOT overwrite "newer".
    expect(result.current.data).toBe("newer");
  });

  it("surfaces fetch errors as an error string", async () => {
    const fetcher = () => Promise.reject(new Error("boom"));
    const { result } = renderHook(() => useApi(fetcher));
    await waitFor(() => expect(result.current.error).toBe("boom"));
    expect(result.current.loading).toBe(false);
  });
});

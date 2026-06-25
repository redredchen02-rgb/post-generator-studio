import { describe, expect, it } from "vitest";
import { resolveSelected } from "@/presentation/history/history-workspace";

type Item = { id: string };

describe("resolveSelected (history stale-selected guard)", () => {
  it("selects the first item when nothing is selected yet", () => {
    const items: Item[] = [{ id: "a" }, { id: "b" }];
    expect(resolveSelected(items, null)).toEqual({ id: "a" });
  });

  it("keeps the current selection when it is still present", () => {
    const items: Item[] = [{ id: "a" }, { id: "b" }];
    expect(resolveSelected(items, { id: "b" })).toEqual({ id: "b" });
  });

  it("falls back to the first item when the selection dropped out of the list", () => {
    const items: Item[] = [{ id: "c" }, { id: "d" }];
    // 'b' was selected but is no longer in the filtered/refetched list.
    expect(resolveSelected(items, { id: "b" })).toEqual({ id: "c" });
  });

  it("clears the selection when the list becomes empty", () => {
    expect(resolveSelected([], { id: "a" })).toBeNull();
  });

  it("returns the fresh list item, not the stale current reference", () => {
    const stale = { id: "a", title: "old" };
    const fresh = { id: "a", title: "new" };
    const result = resolveSelected([fresh], stale);
    // Same id, but the returned object must be the refreshed one from the list.
    expect(result).toBe(fresh);
    expect(result).not.toBe(stale);
  });
});

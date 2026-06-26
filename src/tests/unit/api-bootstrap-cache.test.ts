import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { loadBootstrap, invalidateBootstrapCache } from "@/presentation/lib/api";

const mockBootstrapData = {
  providerProfiles: [{ id: "p1", name: "Test" }],
  promptTemplates: [{ id: "t1", name: "Template" }],
  generationPresets: [{ id: "g1", name: "Preset" }],
  pipelineSteps: [{ id: "s1", name: "Step" }],
};

function mockFetch() {
  global.fetch = async (input: URL | RequestInfo) => {
    if (input === "/api/bootstrap") {
      return new Response(JSON.stringify(mockBootstrapData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not Found", { status: 404 });
  };
}

function mockFetchSlow(): { resolve: () => void } {
  let resolve!: () => void;
  global.fetch = async () => {
    await new Promise<void>((r) => {
      resolve = r;
    });
    return new Response(JSON.stringify(mockBootstrapData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { resolve };
}

describe("loadBootstrap caching", () => {
  beforeEach(() => {
    invalidateBootstrapCache();
  });

  afterEach(() => {
    invalidateBootstrapCache();
  });

  it("deduplicates concurrent calls — only one fetch request", async () => {
    mockFetch();
    const fetchSpy = vi.spyOn(global, "fetch");

    const [result1, result2] = await Promise.all([
      loadBootstrap(),
      loadBootstrap(),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result1).toEqual(mockBootstrapData);
    expect(result2).toEqual(mockBootstrapData);
  });

  it("returns cached data on subsequent calls after first fetch", async () => {
    mockFetch();
    const fetchSpy = vi.spyOn(global, "fetch");

    // First call — goes to network
    const result1 = await loadBootstrap();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second call — should use cache
    const result2 = await loadBootstrap();
    expect(fetchSpy).toHaveBeenCalledTimes(1); // Still 1 — no second fetch
    expect(result1).toEqual(result2);
    expect(result2).toEqual(mockBootstrapData);
  });

  it("re-fetches after cache is invalidated", async () => {
    mockFetch();
    const fetchSpy = vi.spyOn(global, "fetch");

    await loadBootstrap();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    invalidateBootstrapCache();

    await loadBootstrap();
    expect(fetchSpy).toHaveBeenCalledTimes(2); // Invalidated, so re-fetched
  });

  it("handles fetch errors without caching the error", async () => {
    global.fetch = async () => {
      return new Response(
        JSON.stringify({ error: { code: "SERVER_ERROR", message: "Boom" } }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    };

    await expect(loadBootstrap()).rejects.toThrow();

    // After error, next call should attempt to fetch again (not return cached error)
    mockFetch();
    const fetchSpy = vi.spyOn(global, "fetch");
    const data = await loadBootstrap();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(data).toEqual(mockBootstrapData);
  });
});

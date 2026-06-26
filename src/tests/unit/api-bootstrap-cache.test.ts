import { describe, expect, it, vi } from "vitest";
import { loadBootstrap } from "@/presentation/lib/api";

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

// loadBootstrap intentionally has NO module-level cache — the bootstrap store
// (Zustand) is the single source of truth and owns SWR staleness. A second
// cache here previously defeated refetch() (settings changes didn't refresh).
describe("loadBootstrap (no client cache)", () => {
  it("hits the network on every call so refetch always gets fresh data", async () => {
    mockFetch();
    const fetchSpy = vi.spyOn(global, "fetch");

    await loadBootstrap();
    await loadBootstrap();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("returns the parsed bootstrap payload", async () => {
    mockFetch();
    const data = await loadBootstrap();
    expect(data).toEqual(mockBootstrapData);
  });

  it("propagates errors without caching them", async () => {
    global.fetch = async () =>
      new Response(
        JSON.stringify({ error: { code: "SERVER_ERROR", message: "Boom" } }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    await expect(loadBootstrap()).rejects.toThrow();

    // A later successful call still works (no error was cached).
    mockFetch();
    const data = await loadBootstrap();
    expect(data).toEqual(mockBootstrapData);
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";

const loadBootstrap = vi.fn();

vi.mock("@/presentation/lib/api", () => ({
  loadBootstrap: () => loadBootstrap(),
}));

import { useBootstrapStore } from "@/presentation/store/bootstrap-store";

const data = {
  providerProfiles: [],
  promptTemplates: [],
  generationPresets: [],
  pipelineSteps: [],
};

function reset(): void {
  useBootstrapStore.setState({ data: null, loadedAt: 0, loading: false, error: null });
  loadBootstrap.mockReset();
}

describe("useBootstrapStore", () => {
  beforeEach(reset);

  it("loads data on success", async () => {
    loadBootstrap.mockResolvedValueOnce(data);
    await useBootstrapStore.getState().fetchIfNeeded();
    const s = useBootstrapStore.getState();
    expect(s.data).toBe(data);
    expect(s.error).toBeNull();
    expect(s.loading).toBe(false);
  });

  it("self-heals: retries once when the first attempt fails, then succeeds", async () => {
    loadBootstrap.mockRejectedValueOnce(new Error("transient")).mockResolvedValueOnce(data);
    await useBootstrapStore.getState().fetchIfNeeded();
    const s = useBootstrapStore.getState();
    expect(loadBootstrap).toHaveBeenCalledTimes(2);
    expect(s.data).toBe(data);
    expect(s.error).toBeNull();
  });

  it("surfaces the original error reason when both attempts fail", async () => {
    loadBootstrap
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(new Error("still down"));
    await useBootstrapStore.getState().fetchIfNeeded();
    const s = useBootstrapStore.getState();
    expect(loadBootstrap).toHaveBeenCalledTimes(2);
    expect(s.data).toBeNull();
    expect(s.error).toBe("network down");
    expect(s.loading).toBe(false);
  });

  it("skips refetch when fresh data is already loaded", async () => {
    useBootstrapStore.setState({ data, loadedAt: Date.now() });
    await useBootstrapStore.getState().fetchIfNeeded();
    expect(loadBootstrap).not.toHaveBeenCalled();
  });

  it("refetch forces a reload even when data is fresh", async () => {
    useBootstrapStore.setState({ data, loadedAt: Date.now() });
    loadBootstrap.mockResolvedValueOnce(data);
    await useBootstrapStore.getState().refetch();
    expect(loadBootstrap).toHaveBeenCalledTimes(1);
  });
});

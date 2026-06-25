import { beforeEach, describe, expect, it } from "vitest";
import { useProviderStore } from "@/presentation/store/provider-store";

describe("useProviderStore", () => {
  beforeEach(() => {
    useProviderStore.setState({ selectedProfileId: null });
  });

  it("initial state is null", () => {
    expect(useProviderStore.getState().selectedProfileId).toBeNull();
  });

  it("setSelectedProfile stores the id", () => {
    useProviderStore.getState().setSelectedProfile("profile-abc");
    expect(useProviderStore.getState().selectedProfileId).toBe("profile-abc");
  });

  it("clearSelectedProfile resets to null", () => {
    useProviderStore.getState().setSelectedProfile("profile-abc");
    useProviderStore.getState().clearSelectedProfile();
    expect(useProviderStore.getState().selectedProfileId).toBeNull();
  });

  it("second setSelectedProfile call overwrites the first", () => {
    useProviderStore.getState().setSelectedProfile("profile-abc");
    useProviderStore.getState().setSelectedProfile("profile-xyz");
    expect(useProviderStore.getState().selectedProfileId).toBe("profile-xyz");
  });
});

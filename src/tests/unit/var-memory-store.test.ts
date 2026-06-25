import { beforeEach, describe, expect, it } from "vitest";
import { useVarMemoryStore } from "@/presentation/store/var-memory-store";

describe("useVarMemoryStore", () => {
  beforeEach(() => {
    useVarMemoryStore.setState({ varMemory: {} });
  });

  it("stores non-empty var values", () => {
    useVarMemoryStore.getState().setVar("tmpl-1", "BRAND_NAME", "Acme");
    expect(useVarMemoryStore.getState().varMemory["tmpl-1"]["BRAND_NAME"]).toBe("Acme");
  });

  it("does not store empty string values", () => {
    useVarMemoryStore.getState().setVar("tmpl-1", "PLATFORM", "");
    expect(useVarMemoryStore.getState().varMemory["tmpl-1"]).toBeUndefined();
  });

  it("does not store whitespace-only values", () => {
    useVarMemoryStore.getState().setVar("tmpl-1", "PLATFORM", "   ");
    expect(useVarMemoryStore.getState().varMemory["tmpl-1"]).toBeUndefined();
  });

  it("clearTemplate removes the templateId entry", () => {
    useVarMemoryStore.getState().setVar("tmpl-1", "BRAND_NAME", "Acme");
    useVarMemoryStore.getState().clearTemplate("tmpl-1");
    expect(useVarMemoryStore.getState().varMemory["tmpl-1"]).toBeUndefined();
  });

  it("two templateIds do not interfere with each other", () => {
    useVarMemoryStore.getState().setVar("tmpl-1", "BRAND_NAME", "Acme");
    useVarMemoryStore.getState().setVar("tmpl-2", "BRAND_NAME", "Beta");
    expect(useVarMemoryStore.getState().varMemory["tmpl-1"]["BRAND_NAME"]).toBe("Acme");
    expect(useVarMemoryStore.getState().varMemory["tmpl-2"]["BRAND_NAME"]).toBe("Beta");
  });

  it("setVar overwrites an existing key", () => {
    useVarMemoryStore.getState().setVar("tmpl-1", "BRAND_NAME", "Acme");
    useVarMemoryStore.getState().setVar("tmpl-1", "BRAND_NAME", "Updated");
    expect(useVarMemoryStore.getState().varMemory["tmpl-1"]["BRAND_NAME"]).toBe("Updated");
  });

  it("clearTemplate on non-existent templateId does not throw", () => {
    expect(() => useVarMemoryStore.getState().clearTemplate("non-existent")).not.toThrow();
  });
});

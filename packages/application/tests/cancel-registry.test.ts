import { describe, expect, it } from "vitest";
import {
  registerGenerationController,
  releaseGenerationController,
  cancelGenerationController,
} from "@postgen/application/generation/cancel-registry";

describe("cancel-registry", () => {
  it("registers and cancels a controller", () => {
    const controller = new AbortController();
    registerGenerationController("gen-1", controller);

    const cancelled = cancelGenerationController("gen-1");
    expect(cancelled).toBe(true);
    expect(controller.signal.aborted).toBe(true);
  });

  it("returns false when cancelling a non-existent id", () => {
    const cancelled = cancelGenerationController("non-existent");
    expect(cancelled).toBe(false);
  });

  it("releases a controller without aborting", () => {
    const controller = new AbortController();
    registerGenerationController("gen-2", controller);

    releaseGenerationController("gen-2");
    const cancelled = cancelGenerationController("gen-2");
    expect(cancelled).toBe(false);
    expect(controller.signal.aborted).toBe(false);
  });

  it("overwrites previous controller on same id", () => {
    const first = new AbortController();
    const second = new AbortController();
    registerGenerationController("gen-3", first);
    registerGenerationController("gen-3", second);

    cancelGenerationController("gen-3");
    expect(first.signal.aborted).toBe(false);
    expect(second.signal.aborted).toBe(true);
  });
});

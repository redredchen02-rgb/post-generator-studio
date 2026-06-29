import { describe, expect, it } from "vitest";
import { buildGenerationRequestBody } from "@/presentation/generation/generation-stream-protocol";

describe("buildGenerationRequestBody", () => {
  it("passes through core fields and spreads controls", () => {
    const body = buildGenerationRequestBody({
      title: "T",
      eventSummary: "S",
      presetId: "p1",
      providerProfileId: "prov1",
      idempotencyKey: "idem-1",
      controls: { tone: "casual", lengthTarget: "short" },
    });
    expect(body).toMatchObject({
      title: "T",
      eventSummary: "S",
      presetId: "p1",
      providerProfileId: "prov1",
      idempotencyKey: "idem-1",
      tone: "casual",
      lengthTarget: "short",
    });
  });

  it("normalizes an empty providerProfileId to undefined", () => {
    const body = buildGenerationRequestBody({ title: "T", eventSummary: "S", presetId: "p1", providerProfileId: "" });
    expect(body.providerProfileId).toBeUndefined();
  });

  it("drops an empty customVariables object", () => {
    const body = buildGenerationRequestBody({ title: "T", eventSummary: "S", presetId: "p1", customVariables: {} });
    expect(body.customVariables).toBeUndefined();
  });

  it("keeps a non-empty customVariables object", () => {
    const body = buildGenerationRequestBody({
      title: "T",
      eventSummary: "S",
      presetId: "p1",
      customVariables: { ROLE: "editor" },
    });
    expect(body.customVariables).toEqual({ ROLE: "editor" });
  });

  it("leaves idempotencyKey undefined when omitted (regenerate path)", () => {
    const body = buildGenerationRequestBody({ title: "T", eventSummary: "S", presetId: "p1" });
    expect(body.idempotencyKey).toBeUndefined();
  });
});

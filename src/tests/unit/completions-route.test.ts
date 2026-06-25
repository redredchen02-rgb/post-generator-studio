import { describe, expect, it, vi, beforeEach } from "vitest";
import { AppErrorException } from "@/domain/schemas";

const completeText = vi.fn();
vi.mock("@/application/content/completion-service", () => ({
  completeText: (input: unknown) => completeText(input),
}));

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/completions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the completion result as JSON", async () => {
    completeText.mockResolvedValue({ content: "REWRITTEN", model: "m", inputTokens: 1, outputTokens: 2 });
    const { POST } = await import("@/app/api/completions/route");
    const res = await POST(postRequest({ prompt: "x", presetId: "p1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ content: "REWRITTEN", model: "m", inputTokens: 1, outputTokens: 2 });
  });

  it("maps a structured AppError to an error response", async () => {
    completeText.mockRejectedValue(new AppErrorException({ code: "PROVIDER_DISABLED", message: "供应商未启用" }));
    const { POST } = await import("@/app/api/completions/route");
    const res = await POST(postRequest({ prompt: "x", presetId: "p1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("PROVIDER_DISABLED");
  });
});

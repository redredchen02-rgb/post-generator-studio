import { afterEach, describe, expect, it, vi } from "vitest";
import { HotspotAdapter } from "@/infrastructure/hotspot/hotspot-adapter";
import { AppErrorException } from "@/domain/schemas";

const adapter = new HotspotAdapter();

function mockFetch(impl: () => Promise<Response> | Response) {
  return vi.spyOn(global, "fetch").mockImplementation(impl as typeof fetch);
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.HOTSPOT_SIDECAR_SECRET;
});

const okScore = { text: "震惊", score: 4, breakdown: { openers: 2, cta: 2 }, flags: ["opener:absurd", "cta"] };

describe("HotspotAdapter.score", () => {
  it("parses a successful score response", async () => {
    mockFetch(() => new Response(JSON.stringify(okScore), { status: 200 }));
    const r = await adapter.score("震惊！结局没人想到");
    expect(r.score).toBe(4);
    expect(r.flags).toContain("cta");
  });

  it("passes through negative breakdown (ai_slop penalty)", async () => {
    mockFetch(() =>
      new Response(
        JSON.stringify({ text: "首先", score: -5, breakdown: { ai_banned: -5 }, flags: ["ai_slop"] }),
        { status: 200 },
      ),
    );
    const r = await adapter.score("首先，其次，综上所述");
    expect(r.score).toBe(-5);
    expect(r.flags).toContain("ai_slop");
    expect(r.breakdown.ai_banned).toBe(-5);
  });

  it("maps a fetch rejection (sidecar down) to SIDECAR_UNAVAILABLE", async () => {
    mockFetch(() => Promise.reject(new TypeError("ECONNREFUSED")));
    const err = await adapter.score("x").catch((e) => e);
    expect(err).toBeInstanceOf(AppErrorException);
    expect((err as AppErrorException).appError.code).toBe("SIDECAR_UNAVAILABLE");
  });

  it("maps a 401 to SIDECAR_AUTH_FAILED (not unavailable)", async () => {
    mockFetch(() => new Response(JSON.stringify({ detail: "invalid or missing X-API-Key" }), { status: 401 }));
    await expect(adapter.score("x")).rejects.toMatchObject({ appError: { code: "SIDECAR_AUTH_FAILED" } });
  });

  it("rejects a score response whose shape is unexpected", async () => {
    mockFetch(() => new Response(JSON.stringify({ text: "x", score: 1 }), { status: 200 }));
    await expect(adapter.score("x")).rejects.toMatchObject({ appError: { code: "SIDECAR_ERROR" } });
  });

  it("sends the shared secret header as x-api-key when configured", async () => {
    process.env.HOTSPOT_SIDECAR_SECRET = "s3cret";
    const spy = mockFetch(() => new Response(JSON.stringify(okScore), { status: 200 }));
    await adapter.score("x");
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("s3cret");
  });
});

describe("HotspotAdapter.health", () => {
  it("normalizes the sidecar /health payload", async () => {
    mockFetch(() =>
      new Response(
        JSON.stringify({ status: "ok", version: "0.1.0", capabilities: { scoring: true, hotspot: true, content: false, telegram: false } }),
        { status: 200 },
      ),
    );
    const h = await adapter.health();
    expect(h.ok).toBe(true);
    expect(h.capabilities.content).toBe(false);
  });
});

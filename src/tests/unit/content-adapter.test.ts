import { afterEach, describe, expect, it, vi } from "vitest";
import { HotspotAdapter } from "@/infrastructure/hotspot/hotspot-adapter";
import { AppErrorException } from "@/domain/schemas";

const adapter = new HotspotAdapter();

function mockFetch(impl: () => Promise<Response> | Response) {
  return vi.spyOn(global, "fetch").mockImplementation(impl as typeof fetch);
}

afterEach(() => vi.restoreAllMocks());

const VERDICT = {
  path: "/secret/media/job/in/image.jpg",
  nsfw_score: 0.8,
  action_score: 0.3,
  sharp_score: 0.5,
  labels: { FEMALE_BREAST_EXPOSED: 0.8 },
  meta: {},
};

describe("HotspotAdapter.analyze", () => {
  it("wraps a single image verdict into an array and drops the server path", async () => {
    mockFetch(() => new Response(JSON.stringify(VERDICT), { status: 200 }));
    const verdicts = await adapter.analyze("/media/job/in/image.jpg", "image");
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].nsfwScore).toBe(0.8);
    expect((verdicts[0] as Record<string, unknown>).path).toBeUndefined();
  });

  it("returns the per-frame list for a video", async () => {
    mockFetch(() => new Response(JSON.stringify([VERDICT, { ...VERDICT, nsfw_score: 0.1 }]), { status: 200 }));
    const verdicts = await adapter.analyze("/media/job/in/input.mp4", "video");
    expect(verdicts).toHaveLength(2);
    expect(verdicts[1].nsfwScore).toBe(0.1);
  });

  it("sends the kind and path in the request body", async () => {
    const spy = mockFetch(() => new Response(JSON.stringify(VERDICT), { status: 200 }));
    await adapter.analyze("/media/job/in/image.jpg", "image");
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ path: "/media/job/in/image.jpg", kind: "image" });
  });

  it("maps a 503 (content extra missing) to a structured error", async () => {
    mockFetch(() => new Response(JSON.stringify({ detail: "content extra not installed" }), { status: 503 }));
    await expect(adapter.analyze("/media/x.jpg", "image")).rejects.toBeInstanceOf(AppErrorException);
  });

  it("rejects an unexpected verdict shape", async () => {
    mockFetch(() => new Response(JSON.stringify({ nsfw_score: "bad" }), { status: 200 }));
    await expect(adapter.analyze("/media/x.jpg", "image")).rejects.toMatchObject({
      appError: { code: "SIDECAR_ERROR" },
    });
  });
});

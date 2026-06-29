import { afterEach, describe, expect, it, vi } from "vitest";
import { WatermarkAdapter } from "@/infrastructure/watermark/watermark-adapter";
import { AppErrorException } from "@/domain/schemas";

const adapter = new WatermarkAdapter();

function mockFetch(impl: () => Promise<Response> | Response) {
  return vi.spyOn(global, "fetch").mockImplementation(impl as typeof fetch);
}

afterEach(() => vi.restoreAllMocks());

describe("WatermarkAdapter", () => {
  it("parses a successful detect response", async () => {
    mockFetch(() =>
      new Response(JSON.stringify({ regions: { tl: null, tr: null, bl: null, br: null }, width: 720, height: 1280 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const r = await adapter.detect({ inPath: "/x/in.mp4" });
    expect(r.width).toBe(720);
  });

  it("maps a 503 ffmpeg error to a readable AppError", async () => {
    mockFetch(() =>
      new Response(JSON.stringify({ code: "FFMPEG_NOT_FOUND", message: "no ffmpeg" }), { status: 503 }),
    );
    await expect(adapter.detect({ inPath: "/x/in.mp4" })).rejects.toMatchObject({
      appError: { code: "FFMPEG_NOT_FOUND" },
    });
  });

  it("maps a fetch rejection (sidecar down) to SIDECAR_UNAVAILABLE", async () => {
    mockFetch(() => Promise.reject(new TypeError("ECONNREFUSED")));
    const err = await adapter.detect({ inPath: "/x/in.mp4" }).catch((e) => e);
    expect(err).toBeInstanceOf(AppErrorException);
    expect((err as AppErrorException).appError.code).toBe("SIDECAR_UNAVAILABLE");
  });

  it("surfaces a malformed JSON body as a structured error", async () => {
    mockFetch(() => new Response("not json", { status: 200 }));
    await expect(adapter.detect({ inPath: "/x/in.mp4" })).rejects.toMatchObject({
      appError: { code: "SIDECAR_ERROR" },
    });
  });

  it("sends the shared secret header when configured", async () => {
    process.env.OMNIWM_SIDECAR_SECRET = "s3cret";
    const spy = mockFetch(() => new Response(JSON.stringify({ regions: { tl: null, tr: null, bl: null, br: null }, width: 1, height: 1 }), { status: 200 }));
    await adapter.detect({ inPath: "/x/in.mp4" });
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["x-omniwm-secret"]).toBe("s3cret");
    delete process.env.OMNIWM_SIDECAR_SECRET;
  });
});

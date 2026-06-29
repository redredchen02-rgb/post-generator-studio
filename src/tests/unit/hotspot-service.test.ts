import { afterEach, describe, expect, it, vi } from "vitest";
import { HotspotAdapter } from "@/infrastructure/hotspot/hotspot-adapter";
import { submitSnapshot } from "@/application/hotspot/hotspot-service";
import { setHotspotAdapter } from "@/infrastructure/hotspot";
import type { AppErrorException} from "@/domain/schemas";
import { snapshotRequestSchema, type HotspotAlert } from "@/domain/schemas";

function mockFetch(impl: () => Promise<Response> | Response) {
  return vi.spyOn(global, "fetch").mockImplementation(impl as typeof fetch);
}

afterEach(() => {
  vi.restoreAllMocks();
  setHotspotAdapter(undefined);
});

const WIRE_ALERTS = [
  { keyword: "大杨嫂", kind: "jump", rank: 2, prev_rank: 30, delta: 28, meta: {} },
  { keyword: "新词", kind: "new_entry", rank: 5, prev_rank: 0, delta: 0, meta: {} },
];

describe("HotspotAdapter.processSnapshot", () => {
  it("normalizes snake_case alerts to camelCase domain alerts", async () => {
    mockFetch(() => new Response(JSON.stringify(WIRE_ALERTS), { status: 200 }));
    const alerts = await new HotspotAdapter().processSnapshot({ 大杨嫂: 2, 新词: 5 });
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toMatchObject({ keyword: "大杨嫂", kind: "jump", rank: 2, prevRank: 30, delta: 28 });
    expect(alerts[1].kind).toBe("new_entry");
  });

  it("returns an empty list for the priming snapshot", async () => {
    mockFetch(() => new Response("[]", { status: 200 }));
    expect(await new HotspotAdapter().processSnapshot({ a: 1 })).toEqual([]);
  });

  it("rejects an alert payload whose shape is unexpected", async () => {
    mockFetch(() => new Response(JSON.stringify([{ keyword: "x", kind: "bogus" }]), { status: 200 }));
    await expect(new HotspotAdapter().processSnapshot({ a: 1 })).rejects.toMatchObject({
      appError: { code: "SIDECAR_ERROR" },
    });
  });

  it("maps a sidecar-down fetch rejection to SIDECAR_UNAVAILABLE", async () => {
    mockFetch(() => Promise.reject(new TypeError("ECONNREFUSED")));
    const err = await new HotspotAdapter().processSnapshot({ a: 1 }).catch((e) => e);
    expect((err as AppErrorException).appError.code).toBe("SIDECAR_UNAVAILABLE");
  });
});

describe("snapshotRequestSchema", () => {
  it("accepts a normal ranking", () => {
    expect(snapshotRequestSchema.parse({ ranking: { a: 1, b: 2 } }).ranking.a).toBe(1);
  });

  it("rejects more than 500 entries", () => {
    const ranking: Record<string, number> = {};
    for (let i = 0; i < 501; i++) ranking[`k${i}`] = i + 1;
    expect(snapshotRequestSchema.safeParse({ ranking }).success).toBe(false);
  });

  it("rejects non-positive ranks", () => {
    expect(snapshotRequestSchema.safeParse({ ranking: { a: 0 } }).success).toBe(false);
  });
});

describe("submitSnapshot service", () => {
  it("delegates to the injected adapter", async () => {
    const fixture: HotspotAlert[] = [{ keyword: "x", kind: "jump", rank: 1, prevRank: 9, delta: 8 }];
    class Fake extends HotspotAdapter {
      override async processSnapshot(): Promise<HotspotAlert[]> {
        return fixture;
      }
    }
    setHotspotAdapter(new Fake());
    expect(await submitSnapshot({ x: 1 })).toEqual(fixture);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { analyzeUploadedMedia } from "@/application/hotspot/content-service";
import { setHotspotAdapter } from "@/infrastructure/hotspot";
import { HotspotAdapter } from "@/infrastructure/hotspot/hotspot-adapter";
import { getMediaDir } from "@/infrastructure/config/paths";
import type { ContentVerdict } from "@/domain/schemas";

const VERDICT: ContentVerdict = { nsfwScore: 0.7, actionScore: 0.2, sharpScore: 0.4, labels: {} };

class FakeAdapter extends HotspotAdapter {
  public lastPath: string | undefined;
  public lastKind: string | undefined;
  override async analyze(absPath: string, kind: "image" | "video"): Promise<ContentVerdict[]> {
    this.lastPath = absPath;
    this.lastKind = kind;
    return [VERDICT];
  }
}

afterEach(() => setHotspotAdapter(undefined));

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("analyzeUploadedMedia", () => {
  it("writes the upload to a job dir, analyzes it, and cleans up", async () => {
    const fake = new FakeAdapter();
    setHotspotAdapter(fake);
    const result = await analyzeUploadedMedia({ bytes: PNG, filename: "pic.png" }, "image");

    expect(result).toEqual({ kind: "image", verdicts: [VERDICT] });
    // The sidecar saw a server-generated path inside the media root, not client input.
    expect(fake.lastPath?.startsWith(path.resolve(getMediaDir()))).toBe(true);
    expect(fake.lastKind).toBe("image");
    // The job dir was removed after analysis.
    const jobDir = path.dirname(path.dirname(fake.lastPath as string));
    expect(existsSync(jobDir)).toBe(false);
  });

  it("cleans up the job dir even when analysis throws", async () => {
    let seenPath: string | undefined;
    class Throwing extends HotspotAdapter {
      override async analyze(absPath: string): Promise<ContentVerdict[]> {
        seenPath = absPath;
        throw new Error("boom");
      }
    }
    setHotspotAdapter(new Throwing());
    await expect(analyzeUploadedMedia({ bytes: PNG, filename: "pic.png" }, "image")).rejects.toThrow("boom");
    const jobDir = path.dirname(path.dirname(seenPath as string));
    expect(existsSync(jobDir)).toBe(false);
  });

  it("passes the video kind through to the adapter", async () => {
    const fake = new FakeAdapter();
    setHotspotAdapter(fake);
    const mp4 = Buffer.concat([Buffer.alloc(4), Buffer.from("ftypisom")]);
    await analyzeUploadedMedia({ bytes: mp4, filename: "clip.mp4" }, "video");
    expect(fake.lastKind).toBe("video");
  });
});

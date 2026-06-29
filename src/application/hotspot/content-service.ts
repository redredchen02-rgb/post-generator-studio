import type { ContentAnalysis } from "@/domain/schemas";
import type { Upload } from "@/application/watermark/watermark-service";
import { getContentAdapter } from "@/infrastructure/hotspot";
import * as mf from "@/application/watermark/media-files";

/**
 * NSFW / content safety check for an uploaded media file.
 *
 * Mirrors the watermark job lifecycle: the upload is written into a crypto-random
 * job dir (server-generated path, never client-supplied), analyzed, then the dir is
 * removed in `finally`. The sidecar therefore only ever sees a path WE created inside
 * the shared media root — there is no caller-controlled path to traverse with. The
 * verdict is transient (returned to the UI, never persisted) and carries no file path.
 */
export async function analyzeUploadedMedia(
  upload: Upload,
  kind: "image" | "video",
  signal?: AbortSignal,
): Promise<ContentAnalysis> {
  const jobId = await mf.createJob();
  try {
    const inPath = await mf.saveInput(jobId, upload.bytes, upload.filename, kind);
    const verdicts = await getContentAdapter().analyze(inPath, kind, { abortSignal: signal });
    return { kind, verdicts };
  } finally {
    await mf.cleanup(jobId);
  }
}

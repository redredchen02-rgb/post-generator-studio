import { z } from "zod";

/**
 * Watermark domain contract. Mirrors the frozen sidecar wire contract
 * (sidecar/CONTRACT.md) on the Node side. The cross-language source of truth is
 * CONTRACT.md — pydantic and these zod schemas are two descriptions of it.
 *
 * Note: file paths are NOT part of these schemas. Paths are generated server-side
 * by the application layer (crypto jobId + sanitized names); the client/API only
 * ever supplies operation parameters and uploaded files.
 */

export const imagePositionSchema = z.enum([
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
  "center-left",
  "center-right",
]);
export type ImagePosition = z.infer<typeof imagePositionSchema>;

export const videoWmModeSchema = z.enum(["corner-cycle", "fixed", "diagonal"]);
export type VideoWmMode = z.infer<typeof videoWmModeSchema>;

export const videoFixedPosSchema = z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]);
export type VideoFixedPos = z.infer<typeof videoFixedPosSchema>;

/** "original" or a 2-4 digit number — kept narrow because it reaches an ffmpeg filtergraph. */
export const resolutionSchema = z
  .string()
  .regex(/^(original|\d{2,4})$/, "resolution 只接受 'original' 或 2-4 位数字");

export const bitrateSchema = z.string().regex(/^\d{1,5}[kKmM]?$/, "bitrate 格式非法（如 2M / 800k）");

export const imageWatermarkParamsSchema = z.object({
  wmWidth: z.coerce.number().int().min(1).max(4000).default(264),
  imgWidth: z.coerce.number().int().min(1).max(8000).default(800),
  margin: z.coerce.number().int().min(0).max(1000).default(10),
  opacity: z.coerce.number().int().min(1).max(100).default(100),
  position: imagePositionSchema.default("bottom-right"),
});
export type ImageWatermarkParams = z.infer<typeof imageWatermarkParamsSchema>;

export const videoWatermarkParamsSchema = z.object({
  wmMode: videoWmModeSchema.default("corner-cycle"),
  fixedPos: videoFixedPosSchema.default("bottom-right"),
  scaleLandscape: z.coerce.number().int().min(1).max(200).default(35),
  scalePortrait: z.coerce.number().int().min(1).max(200).default(35),
  resolution: resolutionSchema.default("720"),
  bitrate: bitrateSchema.default("2M"),
  fps: z.coerce.number().int().min(1).max(120).default(30),
});
export type VideoWatermarkParams = z.infer<typeof videoWatermarkParamsSchema>;

/** dict{tl/tr/bl/br: "x,y,w,h" | null}, isomorphic with detect output. */
const cornerCoord = z.string().regex(/^\d+,\d+,\d+,\d+$/).nullable();
export const detectRegionsSchema = z.object({
  tl: cornerCoord,
  tr: cornerCoord,
  bl: cornerCoord,
  br: cornerCoord,
});
export type DetectRegions = z.infer<typeof detectRegionsSchema>;

export const detectResultSchema = z.object({
  regions: detectRegionsSchema,
  width: z.number().int(),
  height: z.number().int(),
});
export type DetectResult = z.infer<typeof detectResultSchema>;

/** A produced media file ready to stream back to the browser. */
export type WatermarkFileResult = {
  /** Absolute path inside MEDIA_DIR. */
  path: string;
  /** Sanitized download filename. */
  filename: string;
  contentType: string;
};

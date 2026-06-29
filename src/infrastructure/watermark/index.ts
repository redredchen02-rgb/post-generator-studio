import type { WatermarkPort } from "@/domain/ports/watermark-port";
import { WatermarkAdapter } from "@/infrastructure/watermark/watermark-adapter";

let cached: WatermarkPort | undefined;

/** Single instance — only one implementation, no provider-kind dispatch. */
export function getWatermarkAdapter(): WatermarkPort {
  if (!cached) cached = new WatermarkAdapter();
  return cached;
}

/** Test seam: swap the adapter (mirrors setStorage). */
export function setWatermarkAdapter(adapter: WatermarkPort | undefined): void {
  cached = adapter;
}

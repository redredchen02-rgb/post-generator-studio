import { NextResponse } from "next/server";
import { type AppError } from "@/domain/schemas";
import { logger } from "@/infrastructure/logging/logger";
import { safeErrorMessage } from "@/lib/utils";
import { toAppError } from "@/application/errors";

/**
 * Converts any error into a structured NextResponse with the correct HTTP status.
 * Lives in the API layer (not Application) so Application remains framework-agnostic.
 */
export function errorResponse(error: unknown, status = 400): NextResponse<{ error: AppError }> {
  const appError = toAppError(error);
  logger.error("API error", { code: appError.code, message: appError.message, raw: safeErrorMessage(error) });
  // Codes whose HTTP status must reflect the real failure class rather than the
  // 400 default — chiefly infra/upstream failures that monitoring & retry logic
  // would otherwise misclassify as client errors.
  const STATUS_BY_CODE: Record<string, number> = {
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_ERROR: 500,
    LENGTH_REQUIRED: 411,
    UPLOAD_TOO_LARGE: 413,
    SIDECAR_UNAVAILABLE: 503,
    SIDECAR_ERROR: 502,
    SIDECAR_TIMEOUT: 504,
    SIDECAR_AUTH_FAILED: 401,
    SIDECAR_CANCELLED: 499,
    FFMPEG_NOT_FOUND: 503,
    WATERMARK_TIMEOUT: 504,
  };
  const httpStatus = STATUS_BY_CODE[appError.code] ?? status;
  return NextResponse.json({ error: appError }, { status: httpStatus });
}

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppErrorException, type AppError } from "@/domain/schemas";
import { logger } from "@/infrastructure/logging/logger";
import { safeErrorMessage } from "@/lib/utils";

export function toAppError(error: unknown): AppError {
  if (error instanceof AppErrorException) {
    return error.appError;
  }
  if (error instanceof ZodError) {
    return {
      code: "VALIDATION_ERROR",
      message: "请求参数无效",
      details: { issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) },
    };
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return { code: "GENERATION_CANCELLED", message: "生成请求被取消" };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "服务器处理请求失败",
  };
}

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
    FFMPEG_NOT_FOUND: 503,
    WATERMARK_TIMEOUT: 504,
  };
  const httpStatus = STATUS_BY_CODE[appError.code] ?? status;
  return NextResponse.json({ error: appError }, { status: httpStatus });
}


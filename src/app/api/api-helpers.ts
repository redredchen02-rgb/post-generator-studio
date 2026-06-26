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
  const httpStatus =
    appError.code === "NOT_FOUND" ? 404
    : appError.code === "CONFLICT" ? 409
    : appError.code === "INTERNAL_ERROR" ? 500
    : status;
  return NextResponse.json({ error: appError }, { status: httpStatus });
}

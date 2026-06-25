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
  const httpStatus = appError.code === "NOT_FOUND" ? 404 : appError.code === "INTERNAL_ERROR" ? 500 : status;
  return NextResponse.json({ error: appError }, { status: httpStatus });
}


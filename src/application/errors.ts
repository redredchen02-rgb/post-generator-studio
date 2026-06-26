import { ZodError } from "zod";
import { AppErrorException, type AppError } from "@/domain/schemas";

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

import { ZodError } from "zod";
import { AppErrorException, type AppError } from "@/domain/schemas";

export function toAppError(error: unknown): AppError {
  if (error instanceof AppErrorException) {
    return error.appError;
  }
  if (error instanceof ZodError) {
    return {
      code: "VALIDATION_ERROR",
      message: "Invalid request parameters",
      details: { issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) },
    };
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return { code: "GENERATION_CANCELLED", message: "Generation request was cancelled" };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "Server failed to process the request",
  };
}

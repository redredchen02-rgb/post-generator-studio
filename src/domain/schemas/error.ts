import { z } from "zod";

export const appErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  retryable: z.boolean().optional(),
});
export type AppError = z.infer<typeof appErrorSchema>;

export class AppErrorException extends Error {
  readonly appError: AppError;

  constructor(error: AppError) {
    super(error.message);
    this.name = "AppErrorException";
    this.appError = error;
  }
}

import { AppErrorException } from "@/domain/schemas";

/** Throws a uniform NOT_FOUND AppError for a missing entity. */
export function notFound(entity: string): never {
  throw new AppErrorException({ code: "NOT_FOUND", message: `${entity} not found` });
}

/** Throws a uniform CONFLICT AppError (maps to HTTP 409). */
export function conflict(message: string): never {
  throw new AppErrorException({ code: "CONFLICT", message });
}

/** True when an error is a SQLite foreign-key constraint violation (RESTRICT). */
export function isForeignKeyConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: string }).code ?? "";
  return code.startsWith("SQLITE_CONSTRAINT") && /foreign key/i.test(error.message);
}

/** True when an error is a SQLite UNIQUE constraint violation. */
export function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: string }).code ?? "";
  return code.startsWith("SQLITE_CONSTRAINT") && /unique/i.test(error.message);
}

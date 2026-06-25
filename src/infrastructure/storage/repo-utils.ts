import { AppErrorException } from "@/domain/schemas";

/** Throws a uniform NOT_FOUND AppError for a missing entity. */
export function notFound(entity: string): never {
  throw new AppErrorException({ code: "NOT_FOUND", message: `${entity} not found` });
}

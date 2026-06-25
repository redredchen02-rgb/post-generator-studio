import { AppErrorException } from "@postgen/domain";

export function notFound(entity: string): never {
  throw new AppErrorException({ code: "NOT_FOUND", message: `${entity} not found` });
}

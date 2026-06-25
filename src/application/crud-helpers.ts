import { AppErrorException } from "@/domain/schemas";

export async function getOrThrow<T>(
  repo: { get(id: string): T | Promise<T> | undefined | Promise<T | undefined> },
  id: string,
  message: string,
): Promise<NonNullable<T>> {
  const found = await repo.get(id);
  if (!found) throw new AppErrorException({ code: "NOT_FOUND", message });
  return found as NonNullable<T>;
}

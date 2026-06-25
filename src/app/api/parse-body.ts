import { AppErrorException } from "@/domain/schemas";

export async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppErrorException({ code: "INVALID_BODY", message: "请求体不是有效的 JSON" });
  }
}

import type { Context } from "hono";
import type { StatusCode } from "hono/utils/http-status";
import { errorResponse } from "@postgen/application";
import type { Services } from "./wiring.js";

export function withRoute(fn: (c: Context, s: Services) => Promise<Response>) {
  return async (c: Context): Promise<Response> => {
    const s = c.get("services") as Services;
    try {
      return await fn(c, s);
    } catch (e) {
      const { status, body } = errorResponse(e);
      return c.json(body, status as StatusCode);
    }
  };
}

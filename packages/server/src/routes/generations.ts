import { Hono } from "hono";
import { stream } from "hono/streaming";
import { toAppError } from "@postgen/application";
import { generationListQuerySchema } from "@postgen/domain";
import type { Services } from "../wiring.js";
import { withRoute } from "../with-route.js";
const generations = new Hono();
generations.get("/", withRoute(async (c, s) => {
  const url = new URL(c.req.url);
  const parsed = generationListQuerySchema.parse(Object.fromEntries(url.searchParams.entries()));
  return c.json(await s.generation.listGenerations({ limit: parsed.limit, offset: parsed.offset, search: parsed.search }));
}));
generations.post("/", async (c) => {
  const s = c.get("services") as Services;
  const body = await c.req.json();
  return stream(c, async (sw) => {
    c.header("Content-Type", "text/event-stream; charset=utf-8");
    c.header("Cache-Control", "no-cache, no-transform");
    try {
      for await (const ev of s.generation.streamGeneration(body)) await sw.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
    } catch (e) {
      await sw.write(`event: error\ndata: ${JSON.stringify({ type: "error", error: toAppError(e) })}\n\n`);
    }
  });
});
generations.get("/:id", withRoute(async (c, s) => c.json(await s.generation.getGeneration(c.req.param("id")))));
generations.patch("/:id", withRoute(async (c, s) => {
  const body = (await c.req.json()) as { outputContent?: string };
  if (typeof body.outputContent !== "string") return c.json({ error: "outputContent is required" }, 400);
  return c.json(await s.generation.updateGenerationContent(c.req.param("id"), body.outputContent));
}));
generations.post("/:id/cancel", withRoute(async (c, s) => c.json(await s.generation.cancelGeneration(c.req.param("id")))));
generations.get("/:id/export", withRoute(async (c, s) => {
  const format = (c.req.query("format") || "md") as "md" | "txt";
  const ex = await s.export.exportGeneration(c.req.param("id"), format);
  return new Response(ex.content, { headers: { "Content-Type": format === "md" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${ex.filename}"` } });
}));
export default generations;

import { Hono } from "hono";
import { withRoute } from "../with-route.js";
const gp = new Hono();
gp.get("/", withRoute(async (c, s) => c.json(await s.preset.listGenerationPresets())));
gp.post("/", withRoute(async (c, s) => c.json(await s.preset.createGenerationPreset(await c.req.json()), { status: 201 })));
gp.get("/:id", withRoute(async (c, s) => c.json(await s.preset.getGenerationPreset(c.req.param("id")))));
gp.patch("/:id", withRoute(async (c, s) => c.json(await s.preset.updateGenerationPreset(c.req.param("id"), await c.req.json()))));
gp.delete("/:id", withRoute(async (c, s) => { await s.preset.deleteGenerationPreset(c.req.param("id")); return c.json({ ok: true }); }));
export default gp;

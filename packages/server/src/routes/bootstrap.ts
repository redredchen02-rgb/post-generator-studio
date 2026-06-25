import { Hono } from "hono";
import type { Services } from "../wiring.js";
import { listPipelineSteps, errorResponse } from "@postgen/application";
const bootstrap = new Hono();
bootstrap.get("/", async (c) => { const s = c.get("services") as Services; try { const [pp, pt, gp] = await Promise.all([s.provider.listProviderProfiles(), s.prompt.listPromptTemplates(), s.preset.listGenerationPresets()]); return c.json({ providerProfiles: pp, promptTemplates: pt, generationPresets: gp, pipelineSteps: listPipelineSteps().map((s) => ({ id: s.id, name: s.name })) }); } catch (e) { const { status, body } = errorResponse(e); return c.json(body, status as unknown as number); } });
export default bootstrap;

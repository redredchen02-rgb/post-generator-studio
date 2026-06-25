import { Hono } from "hono";
import { listPipelineSteps } from "@postgen/application";
import { withRoute } from "../with-route.js";
const bootstrap = new Hono();
bootstrap.get("/", withRoute(async (c, s) => {
  const [pp, pt, gp] = await Promise.all([s.provider.listProviderProfiles(), s.prompt.listPromptTemplates(), s.preset.listGenerationPresets()]);
  return c.json({ providerProfiles: pp, promptTemplates: pt, generationPresets: gp, pipelineSteps: listPipelineSteps().map((step) => ({ id: step.id, name: step.name })) });
}));
export default bootstrap;

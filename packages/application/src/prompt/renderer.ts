import { AppErrorException, extractTemplateVariables } from "@postgen/domain";
import type { PromptVariables } from "./variables.js";
const TOKEN_PATTERN = /{{\s*([A-Z0-9_]+)\s*}}/g;
export type RenderedPrompt = { content: string; usedVariables: string[]; missingVariables: string[]; };
export { extractTemplateVariables };
export function renderTemplate(template: string, variables: PromptVariables): RenderedPrompt { const used = extractTemplateVariables(template); const missing = used.filter((n) => variables[n] === undefined); if (missing.length > 0) throw new AppErrorException({ code: "TEMPLATE_VARIABLE_MISSING", message: `模板变量缺失: ${missing.join(", ")}`, details: { missingVariables: missing } }); return { content: template.replace(TOKEN_PATTERN, (_: string, name: string) => variables[name] ?? ""), usedVariables: used, missingVariables: missing }; }
export function assertSupportedVariables(template: string, supportedVariables: string[]): void { const vars = extractTemplateVariables(template); const unsupported = vars.filter((n) => !supportedVariables.includes(n)); if (unsupported.length > 0) throw new AppErrorException({ code: "TEMPLATE_VARIABLE_UNSUPPORTED", message: `模板包含未支持变量: ${unsupported.join(", ")}`, details: { unsupported } }); }

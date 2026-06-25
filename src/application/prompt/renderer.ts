import { AppErrorException } from "@/domain/schemas";
import type { PromptVariables } from "@/application/prompt/variables";

const TOKEN_PATTERN = /{{\s*([A-Z0-9_]+)\s*}}/g;

export type RenderedPrompt = {
  content: string;
  usedVariables: string[];
  missingVariables: string[];
};

export function extractTemplateVariables(template: string): string[] {
  return Array.from(template.matchAll(TOKEN_PATTERN), (match) => match[1]).filter(
    (value, index, all) => all.indexOf(value) === index,
  );
}

export function renderTemplate(template: string, variables: PromptVariables): RenderedPrompt {
  const usedVariables = extractTemplateVariables(template);
  const missingVariables = usedVariables.filter((name) => variables[name] === undefined);
  if (missingVariables.length > 0) {
    throw new AppErrorException({
      code: "TEMPLATE_VARIABLE_MISSING",
      message: `模板变量缺失: ${missingVariables.join(", ")}`,
      details: { missingVariables },
    });
  }

  return {
    content: template.replace(TOKEN_PATTERN, (_match, name: string) => variables[name] ?? ""),
    usedVariables,
    missingVariables,
  };
}

export function assertSupportedVariables(template: string, supportedVariables: string[]): void {
  const variables = extractTemplateVariables(template);
  const unsupported = variables.filter((name) => !supportedVariables.includes(name));
  if (unsupported.length > 0) {
    throw new AppErrorException({
      code: "TEMPLATE_VARIABLE_UNSUPPORTED",
      message: `模板包含未支持变量: ${unsupported.join(", ")}`,
      details: { unsupported },
    });
  }
}


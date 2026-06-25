export function nowIso(): string { return new Date().toISOString(); }
export function createId(prefix: string): string { return `${prefix}_${crypto.randomUUID()}`; }
export function parseJson<T>(value: string, fallback: T): T { try { return JSON.parse(value) as T; } catch { return fallback; } }
export function safeErrorMessage(error: unknown): string { if (error instanceof Error) return error.message; if (typeof error === "string") return error; return "Unexpected error"; }
export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/[*_~>#-]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const TOKEN_PATTERN = /{{\s*([A-Z0-9_]+)\s*}}/g;
export function extractTemplateVariables(template: string): string[] { return Array.from(template.matchAll(TOKEN_PATTERN), (m) => m[1]).filter((v, i, a) => a.indexOf(v) === i); }

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createId(prefix: string): string {
  const random = crypto.randomUUID();
  return `${prefix}_${random}`;
}

export function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Trim, then unwrap a single enclosing markdown code fence (```), trimming the inner text. */
export function stripCodeFence(raw: string): string {
  const text = raw.trim();
  const fenced = text.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  return (fenced ? fenced[1] : text).trim();
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unexpected error";
}

const MARKDOWN_PATTERNS = {
  codeBlock: /```[\s\S]*?```/g,
  inlineCode: /`([^`]+)`/g,
  image: /!\[[^\]]*]\([^)]*\)/g,
  link: /\[([^\]]+)]\([^)]*\)/g,
  heading: /^#{1,6}\s+/gm,
  blockquote: /^>\s?/gm,
  formatting: /[*_~>#-]/g,
  newlines: /\n{3,}/g,
};

export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(MARKDOWN_PATTERNS.codeBlock, "")
    .replace(MARKDOWN_PATTERNS.inlineCode, "$1")
    .replace(MARKDOWN_PATTERNS.image, "")
    .replace(MARKDOWN_PATTERNS.link, "$1")
    .replace(MARKDOWN_PATTERNS.heading, "")
    .replace(MARKDOWN_PATTERNS.blockquote, "")
    .replace(MARKDOWN_PATTERNS.formatting, "")
    .replace(MARKDOWN_PATTERNS.newlines, "\n\n")
    .trim();
}

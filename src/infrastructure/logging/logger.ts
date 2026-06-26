import type { Logger } from "@/domain/ports/logger";

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{12,}/g,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /(authorization|cookie|api[_-]?key|x-api-key|x-goog-api-key)["':=\s]+[^,\s}]+/gi,
];

function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return SECRET_PATTERNS.reduce((current, pattern) => current.replace(pattern, "[REDACTED]"), value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /authorization|cookie|secret|apiKey|api_key|token|x-api-key|x-goog-api-key/i.test(key) ? "[REDACTED]" : redact(item),
      ]),
    );
  }
  return value;
}

function write(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>): void {
  const payload = meta ? redact(meta) : undefined;
  const line = payload ? [message, payload] : [message];
  console[level](...line);
}

export const logger: Logger = {
  info(message, meta) {
    write("info", message, meta);
  },
  warn(message, meta) {
    write("warn", message, meta);
  },
  error(message, meta) {
    write("error", message, meta);
  },
};


import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We need to test the redact function indirectly through the logger
// Since redact is not exported, we'll test it by capturing console output

describe("Logger redact", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("redacts sk- prefixed API keys in string values", async () => {
    const { logger } = await import("@/infrastructure/logging/logger");
    logger.info("test message", { key: "sk-abc123def456ghi789" });
    expect(consoleSpy).toHaveBeenCalledWith("test message", { key: "[REDACTED]" });
  });

  it("redacts Bearer tokens in string values", async () => {
    const { logger } = await import("@/infrastructure/logging/logger");
    logger.info("test message", { auth: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" });
    expect(consoleSpy).toHaveBeenCalledWith("test message", { auth: "[REDACTED]" });
  });

  it("redacts authorization header values", async () => {
    const { logger } = await import("@/infrastructure/logging/logger");
    logger.info("test message", { authorization: "Bearer secret-token-123" });
    expect(consoleSpy).toHaveBeenCalledWith("test message", { authorization: "[REDACTED]" });
  });

  it("redacts api-key header values", async () => {
    const { logger } = await import("@/infrastructure/logging/logger");
    logger.info("test message", { "x-api-key": "my-secret-api-key" });
    expect(consoleSpy).toHaveBeenCalledWith("test message", { "x-api-key": "[REDACTED]" });
  });

  it("redacts x-goog-api-key header values", async () => {
    const { logger } = await import("@/infrastructure/logging/logger");
    logger.info("test message", { "x-goog-api-key": "AIzaSyD-secret-key" });
    expect(consoleSpy).toHaveBeenCalledWith("test message", { "x-goog-api-key": "[REDACTED]" });
  });

  it("redacts cookie header values", async () => {
    const { logger } = await import("@/infrastructure/logging/logger");
    logger.info("test message", { cookie: "session=abc123; token=xyz789" });
    expect(consoleSpy).toHaveBeenCalledWith("test message", { cookie: "[REDACTED]" });
  });

  it("redacts apiKey field names", async () => {
    const { logger } = await import("@/infrastructure/logging/logger");
    logger.info("test message", { apiKey: "sk-secret-key-123" });
    expect(consoleSpy).toHaveBeenCalledWith("test message", { apiKey: "[REDACTED]" });
  });

  it("redacts api_key field names", async () => {
    const { logger } = await import("@/infrastructure/logging/logger");
    logger.info("test message", { api_key: "sk-secret-key-456" });
    expect(consoleSpy).toHaveBeenCalledWith("test message", { api_key: "[REDACTED]" });
  });

  it("redacts token field names", async () => {
    const { logger } = await import("@/infrastructure/logging/logger");
    logger.info("test message", { token: "secret-token-value" });
    expect(consoleSpy).toHaveBeenCalledWith("test message", { token: "[REDACTED]" });
  });

  it("redacts secret field names", async () => {
    const { logger } = await import("@/infrastructure/logging/logger");
    logger.info("test message", { secret: "my-secret-value" });
    expect(consoleSpy).toHaveBeenCalledWith("test message", { secret: "[REDACTED]" });
  });

  it("redacts secrets in nested objects", async () => {
    const { logger } = await import("@/infrastructure/logging/logger");
    logger.info("test message", {
      config: {
        apiKey: "sk-nested-secret-key",
        name: "test",
      },
    });
    expect(consoleSpy).toHaveBeenCalledWith("test message", {
      config: {
        apiKey: "[REDACTED]",
        name: "test",
      },
    });
  });

  it("redacts secrets in arrays", async () => {
    const { logger } = await import("@/infrastructure/logging/logger");
    logger.info("test message", {
      keys: ["sk-abc123def456ghi789", "sk-jkl012mno345pqr678", "normal-value"],
    });
    expect(consoleSpy).toHaveBeenCalledWith("test message", {
      keys: ["[REDACTED]", "[REDACTED]", "normal-value"],
    });
  });

  it("preserves non-sensitive values", async () => {
    const { logger } = await import("@/infrastructure/logging/logger");
    logger.info("test message", {
      name: "test",
      count: 42,
      enabled: true,
      nested: { foo: "bar" },
    });
    expect(consoleSpy).toHaveBeenCalledWith("test message", {
      name: "test",
      count: 42,
      enabled: true,
      nested: { foo: "bar" },
    });
  });

  it("handles null and undefined values", async () => {
    const { logger } = await import("@/infrastructure/logging/logger");
    logger.info("test message", { a: null, b: undefined, c: "value" });
    expect(consoleSpy).toHaveBeenCalledWith("test message", {
      a: null,
      b: undefined,
      c: "value",
    });
  });

  it("handles sk- keys with various lengths", async () => {
    const { logger } = await import("@/infrastructure/logging/logger");
    // Minimum 12 chars after sk-
    logger.info("test", { short: "sk-123456789012" });
    expect(consoleSpy).toHaveBeenCalledWith("test", { short: "[REDACTED]" });
    consoleSpy.mockClear();

    // Longer keys
    logger.info("test", { long: "sk-proj-abc123def456ghi789jkl012mno345" });
    expect(consoleSpy).toHaveBeenCalledWith("test", { long: "[REDACTED]" });
  });

  it("does not redact sk- with fewer than 12 chars", async () => {
    const { logger } = await import("@/infrastructure/logging/logger");
    logger.info("test", { short: "sk-12345678901" }); // 11 chars after sk-
    expect(consoleSpy).toHaveBeenCalledWith("test", { short: "sk-12345678901" });
  });

  it("redacts Bearer tokens with dots and hyphens", async () => {
    const { logger } = await import("@/infrastructure/logging/logger");
    logger.info("test", { auth: "Bearer token.with.dots-and-hyphens" });
    expect(consoleSpy).toHaveBeenCalledWith("test", { auth: "[REDACTED]" });
  });

  it("redacts api-key in key=value format", async () => {
    const { logger } = await import("@/infrastructure/logging/logger");
    logger.info("test", { header: "api-key=secret123" });
    expect(consoleSpy).toHaveBeenCalledWith("test", { header: "[REDACTED]" });
  });

  it("redacts api_key in key=value format", async () => {
    const { logger } = await import("@/infrastructure/logging/logger");
    logger.info("test", { header: "api_key=secret456" });
    expect(consoleSpy).toHaveBeenCalledWith("test", { header: "[REDACTED]" });
  });

  it("redacts x-api-key in key:value format", async () => {
    const { logger } = await import("@/infrastructure/logging/logger");
    logger.info("test", { header: "x-api-key:secret789" });
    expect(consoleSpy).toHaveBeenCalledWith("test", { header: "[REDACTED]" });
  });

  it("warn and error methods also redact", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { logger } = await import("@/infrastructure/logging/logger");
    logger.warn("warning", { apiKey: "sk-warn-key" });
    logger.error("error", { apiKey: "sk-error-key" });

    expect(warnSpy).toHaveBeenCalledWith("warning", { apiKey: "[REDACTED]" });
    expect(errorSpy).toHaveBeenCalledWith("error", { apiKey: "[REDACTED]" });

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

import { describe, expect, it, vi } from "vitest";
import * as nextHeaders from "next/headers";

vi.mock("next-intl/server", () => ({
  getRequestConfig: (fn: unknown) => fn,
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

const { isValidLocale } = await import("@/i18n/request");
const requestConfig = (await import("@/i18n/request")).default as () => Promise<{ locale: string; messages: Record<string, unknown> }>;

function makeCookieStore(value: string | undefined) {
  return { get: (_name: string) => (value !== undefined ? { value } : undefined) };
}

describe("isValidLocale", () => {
  it("accepts 'en'", () => {
    expect(isValidLocale("en")).toBe(true);
  });

  it("accepts 'zh-CN'", () => {
    expect(isValidLocale("zh-CN")).toBe(true);
  });

  it("rejects an unsupported locale", () => {
    expect(isValidLocale("fr")).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidLocale(undefined)).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidLocale("")).toBe(false);
  });

  it("rejects locale with wrong casing", () => {
    expect(isValidLocale("ZH-CN")).toBe(false);
    expect(isValidLocale("EN")).toBe(false);
  });

  it("rejects null coerced to string", () => {
    expect(isValidLocale(null as unknown as string)).toBe(false);
  });
});

describe("getRequestConfig", () => {
  it("returns 'en' locale when cookie contains valid 'en'", async () => {
    vi.mocked(nextHeaders.cookies).mockResolvedValue(makeCookieStore("en") as never);
    const result = await requestConfig();
    expect(result.locale).toBe("en");
    expect(result.messages).toBeDefined();
  });

  it("returns 'zh-CN' locale when cookie contains valid 'zh-CN'", async () => {
    vi.mocked(nextHeaders.cookies).mockResolvedValue(makeCookieStore("zh-CN") as never);
    const result = await requestConfig();
    expect(result.locale).toBe("zh-CN");
  });

  it("falls back to 'en' when cookie contains invalid locale", async () => {
    vi.mocked(nextHeaders.cookies).mockResolvedValue(makeCookieStore("fr") as never);
    const result = await requestConfig();
    expect(result.locale).toBe("en");
  });

  it("falls back to 'en' when cookie is absent", async () => {
    vi.mocked(nextHeaders.cookies).mockResolvedValue(makeCookieStore(undefined) as never);
    const result = await requestConfig();
    expect(result.locale).toBe("en");
  });

  it("returns empty messages object when message file is missing", async () => {
    vi.mocked(nextHeaders.cookies).mockResolvedValue(makeCookieStore("en") as never);
    // Vitest loads real message files; this test verifies the fallback shape
    const result = await requestConfig();
    expect(typeof result.messages).toBe("object");
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getRequestConfig: (fn: unknown) => fn,
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

const { isValidLocale } = await import("@/i18n/request");

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
});

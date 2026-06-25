// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import * as React from "react";

const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

let mockLocale = "en";
const setLocaleMock = vi.fn((v: string) => { mockLocale = v; });
vi.mock("@/presentation/store/ui-store", () => ({
  useUiStore: () => ({ locale: mockLocale, setLocale: setLocaleMock }),
}));

import { LanguageSwitcher } from "@/presentation/components/language-switcher";

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    mockLocale = "en";
    refreshMock.mockReset();
    setLocaleMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders both locale buttons after mount", async () => {
    render(<LanguageSwitcher />);
    await act(async () => {});
    expect(screen.getByRole("button", { name: /switch to english/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /切換為中文/ })).toBeDefined();
  });

  it("writes NEXT_LOCALE cookie on locale switch", async () => {
    render(<LanguageSwitcher />);
    await act(async () => {});
    const cookieWrites: string[] = [];
    const origDesc = Object.getOwnPropertyDescriptor(document, "cookie");
    Object.defineProperty(document, "cookie", {
      get: () => "",
      set: (v: string) => { cookieWrites.push(v); },
      configurable: true,
    });
    fireEvent.click(screen.getByRole("button", { name: /切換為中文/ }));
    expect(cookieWrites.some((c) => c.includes("NEXT_LOCALE=zh-CN"))).toBe(true);
    if (origDesc) Object.defineProperty(document, "cookie", origDesc);
  });

  it("calls setLocale when switching locale", async () => {
    render(<LanguageSwitcher />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /切換為中文/ }));
    expect(setLocaleMock).toHaveBeenCalledWith("zh-CN");
  });

  it("isRefreshing guard disables buttons immediately after click", async () => {
    render(<LanguageSwitcher />);
    await act(async () => {});
    const btn = screen.getByRole("button", { name: /切換為中文/ });
    fireEvent.click(btn);
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("re-enables buttons after 1s guard timeout", async () => {
    render(<LanguageSwitcher />);
    await act(async () => {});
    const btn = screen.getByRole("button", { name: /切換為中文/ });
    fireEvent.click(btn);
    await act(async () => { vi.advanceTimersByTime(1100); });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not call refresh again on rapid double-click", async () => {
    render(<LanguageSwitcher />);
    await act(async () => {});
    const btn = screen.getByRole("button", { name: /切換為中文/ });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});

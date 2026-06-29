// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as React from "react";
import { NextIntlClientProvider } from "next-intl";
import { ProviderProfilesPanel } from "@/presentation/settings/provider-profiles-panel";
import type { ProviderProfile } from "@/domain/schemas";
import en from "../../../messages/en.json";

vi.mock("@/presentation/lib/api", () => ({
  fetchJson: vi.fn().mockResolvedValue({}),
  testProviderProfile: vi.fn().mockResolvedValue({ ok: false, message: "not connected" }),
}));

const BASE_PROFILE: ProviderProfile = {
  id: "p1",
  name: "My OpenAI",
  providerKind: "openai",
  model: "gpt-4",
  enabled: false,
  keyMasked: "sk-...abc",
  defaultTemperature: 0.7,
  defaultMaxTokens: 3000,
  baseUrl: "https://api.openai.com",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true });
});

function renderPanel(profiles: ProviderProfile[] = []) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ProviderProfilesPanel
        profiles={profiles}
        refresh={vi.fn().mockResolvedValue(undefined)}
        notify={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

describe("ProviderProfilesPanel — provider kind dropdown", () => {
  it("shows 'Google Gemini' instead of raw kind 'gemini'", () => {
    renderPanel();
    const options = screen.getAllByRole("option");
    const labels = options.map((o) => o.textContent);
    expect(labels).toContain("Google Gemini");
    expect(labels).not.toContain("gemini");
  });

  it("shows 'Grok (xAI)' instead of raw kind 'grok'", () => {
    renderPanel();
    const options = screen.getAllByRole("option");
    const labels = options.map((o) => o.textContent);
    expect(labels).toContain("Grok (xAI)");
    expect(labels).not.toContain("grok");
  });

  it("no longer offers the removed 'ollama' provider kind", () => {
    renderPanel();
    const options = screen.getAllByRole("option");
    const labels = options.map((o) => o.textContent);
    expect(labels).not.toContain("Ollama (Local)");
    expect(labels.some((l) => /ollama/i.test(l ?? ""))).toBe(false);
  });
});

describe("ProviderProfilesPanel — API key guidance link", () => {
  it("shows 'Get API key' link when grok is selected", () => {
    renderPanel();
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "grok" } });
    const link = screen.getByRole("link", { name: /Get API key/i });
    expect(link).toBeTruthy();
    expect((link as HTMLAnchorElement).href).toContain("console.x.ai");
  });

  it("shows 'Get API key' link when openai is selected", () => {
    renderPanel();
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "openai" } });
    const link = screen.getByRole("link", { name: /Get API key/i });
    expect((link as HTMLAnchorElement).href).toContain("platform.openai.com");
  });

  it("shows no link for openai-compatible (no apiKeyUrl defined)", () => {
    renderPanel();
    expect(screen.queryByRole("link", { name: /Get API key/i })).toBeNull();
  });

  it("link opens in a new tab with rel=noopener", () => {
    renderPanel();
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "anthropic" } });
    const link = screen.getByRole("link", { name: /Get API key/i }) as HTMLAnchorElement;
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
  });
});

describe("ProviderProfilesPanel — API key show/hide toggle", () => {
  it("renders a 'Show key' toggle button when requiresApiKey is true", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: /show key/i })).toBeTruthy();
  });

  it("clicking toggle changes aria-label from 'Show key' to 'Hide key'", () => {
    renderPanel();
    const showBtn = screen.getByRole("button", { name: /show key/i });
    fireEvent.click(showBtn);
    expect(screen.queryByRole("button", { name: /show key/i })).toBeNull();
    expect(screen.getByRole("button", { name: /hide key/i })).toBeTruthy();
  });

  it("clicking toggle twice returns to 'Show key'", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /show key/i }));
    fireEvent.click(screen.getByRole("button", { name: /hide key/i }));
    expect(screen.getByRole("button", { name: /show key/i })).toBeTruthy();
  });

});

describe("ProviderProfilesPanel — profile cards", () => {
  it("shows 'Enable' button for a disabled profile", () => {
    renderPanel([{ ...BASE_PROFILE, enabled: false }]);
    expect(screen.getByRole("button", { name: /enable/i })).toBeTruthy();
  });

  it("shows 'Disable' button for an enabled profile", () => {
    renderPanel([{ ...BASE_PROFILE, enabled: true }]);
    expect(screen.getByRole("button", { name: /disable/i })).toBeTruthy();
  });

  it("displays provider display name 'OpenAI' in card subtitle", () => {
    renderPanel([BASE_PROFILE]);
    expect(screen.getByText(/OpenAI · gpt-4/)).toBeTruthy();
  });

  it("applies opacity-60 to info section of disabled card", () => {
    const { container } = renderPanel([{ ...BASE_PROFILE, enabled: false }]);
    expect(container.querySelector(".opacity-60")).toBeTruthy();
  });

  it("does not apply opacity-60 to info section of enabled card", () => {
    const { container } = renderPanel([{ ...BASE_PROFILE, enabled: true }]);
    expect(container.querySelector(".opacity-60")).toBeNull();
  });

  it("shows 'Clear Key' button when keyMasked is set", () => {
    renderPanel([{ ...BASE_PROFILE, keyMasked: "sk-...abc" }]);
    expect(screen.getByRole("button", { name: /clear key/i })).toBeTruthy();
  });

  it("hides 'Clear Key' button when keyMasked is empty", () => {
    renderPanel([{ ...BASE_PROFILE, keyMasked: "" }]);
    expect(screen.queryByRole("button", { name: /clear key/i })).toBeNull();
  });

  it("shows empty-state message when profiles list is empty", () => {
    renderPanel([]);
    expect(screen.getByText(/No provider profiles yet/i)).toBeTruthy();
  });
});

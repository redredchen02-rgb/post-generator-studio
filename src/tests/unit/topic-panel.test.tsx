// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as React from "react";
import { NextIntlClientProvider } from "next-intl";
import { TopicPanel } from "@/presentation/hotspot/topic-panel";
import * as api from "@/presentation/lib/api";
import type { HotspotAlert } from "@/domain/schemas";
import en from "../../../messages/en.json";

function renderPanel(props: Partial<React.ComponentProps<typeof TopicPanel>>) {
  const merged: React.ComponentProps<typeof TopicPanel> = {
    available: true,
    onSeed: () => true,
    ...props,
  };
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <TopicPanel {...merged} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("TopicPanel", () => {
  it("renders nothing when the capability is unavailable", () => {
    const { container } = renderPanel({ available: false });
    expect(container.firstChild).toBeNull();
  });

  it("parses a pasted leaderboard, calls the API, and renders alerts", async () => {
    const alerts: HotspotAlert[] = [{ keyword: "大杨嫂", kind: "jump", rank: 2, prevRank: 30, delta: 28 }];
    const spy = vi.spyOn(api, "submitHotspotSnapshot").mockResolvedValue(alerts);
    renderPanel({});
    fireEvent.click(screen.getByText("Hotspot topics")); // expand
    fireEvent.change(screen.getByPlaceholderText(/keyword A/), { target: { value: "1. 大杨嫂\n2. 新词" } });
    fireEvent.click(screen.getByText("Find hotspots"));
    await waitFor(() => expect(screen.getByText("大杨嫂")).toBeTruthy());
    expect(spy).toHaveBeenCalledWith({ 大杨嫂: 1, 新词: 2 });
  });

  it("shows the baseline-primed hint when the first snapshot has no alerts", async () => {
    vi.spyOn(api, "submitHotspotSnapshot").mockResolvedValue([]);
    renderPanel({});
    fireEvent.click(screen.getByText("Hotspot topics"));
    fireEvent.change(screen.getByPlaceholderText(/keyword A/), { target: { value: "甲\n乙" } });
    fireEvent.click(screen.getByText("Find hotspots"));
    await waitFor(() => expect(screen.getByText(/Baseline established/)).toBeTruthy());
  });

  it("seeds the form when an alert's Use button is clicked", async () => {
    vi.spyOn(api, "submitHotspotSnapshot").mockResolvedValue([
      { keyword: "大杨嫂", kind: "jump", rank: 2, prevRank: 30, delta: 28 },
    ]);
    const onSeed = vi.fn(() => true);
    renderPanel({ onSeed });
    fireEvent.click(screen.getByText("Hotspot topics"));
    fireEvent.change(screen.getByPlaceholderText(/keyword A/), { target: { value: "1. 大杨嫂" } });
    fireEvent.click(screen.getByText("Find hotspots"));
    await waitFor(() => screen.getByText("Use this"));
    fireEvent.click(screen.getByText("Use this"));
    expect(onSeed).toHaveBeenCalledWith("大杨嫂", expect.stringContaining("大杨嫂"));
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as React from "react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { SafetyForm } from "@/presentation/media/media-workspace";
import * as api from "@/presentation/lib/api";
import type { ContentAnalysis } from "@/domain/schemas";
import type { HotspotSidecarHealth } from "@/domain/ports/hotspot-port";
import en from "../../../messages/en.json";

const UP: HotspotSidecarHealth = { ok: true, version: "0.1.0", capabilities: { scoring: true, hotspot: true, content: true, telegram: false } };
const NO_CONTENT: HotspotSidecarHealth = { ...UP, capabilities: { ...UP.capabilities, content: false } };

function Harness(): React.ReactElement {
  const t = useTranslations("MediaWatermark");
  return <SafetyForm t={t} />;
}

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <Harness />
    </NextIntlClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("SafetyForm", () => {
  it("shows the unavailable state + retry when content capability is missing", async () => {
    vi.spyOn(api, "getHotspotHealth").mockResolvedValue(NO_CONTENT);
    renderForm();
    await waitFor(() => expect(screen.getByText(/unavailable/i)).toBeTruthy());
    expect(screen.getByText("Retry")).toBeTruthy();
  });

  it("shows the unavailable state when the sidecar is down", async () => {
    vi.spyOn(api, "getHotspotHealth").mockRejectedValue(new Error("down"));
    renderForm();
    await waitFor(() => expect(screen.getByText(/unavailable/i)).toBeTruthy());
  });

  it("renders the form when available and shows verdicts on submit", async () => {
    vi.spyOn(api, "getHotspotHealth").mockResolvedValue(UP);
    const analysis: ContentAnalysis = { kind: "image", verdicts: [{ nsfwScore: 0.8, actionScore: 0.2, sharpScore: 0.4, labels: {} }] };
    vi.spyOn(api, "analyzeMediaSafety").mockResolvedValue(analysis);
    renderForm();
    await waitFor(() => expect(screen.getByText("Check content")).toBeTruthy());

    const file = new File([new Uint8Array([0x89, 0x50])], "x.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    await waitFor(() => expect(screen.getByText(/1 frame/i)).toBeTruthy());
    expect(screen.getByText("0.80")).toBeTruthy();
  });

  it("surfaces an error when analysis fails", async () => {
    vi.spyOn(api, "getHotspotHealth").mockResolvedValue(UP);
    vi.spyOn(api, "analyzeMediaSafety").mockRejectedValue(new Error("decode failed"));
    renderForm();
    await waitFor(() => expect(screen.getByText("Check content")).toBeTruthy());
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([0x89, 0x50])], "x.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await waitFor(() => expect(screen.getByText("decode failed")).toBeTruthy());
  });
});

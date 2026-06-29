// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { NextIntlClientProvider } from "next-intl";
import { MediaWorkspace } from "@/presentation/media/media-workspace";
import en from "../../../messages/en.json";

function renderWorkspace() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MediaWorkspace />
    </NextIntlClientProvider>,
  );
}

function mockHealth(body: unknown, ok = true) {
  vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status: ok ? 200 : 503 }) as Response,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("MediaWorkspace", () => {
  it("hides the banner and enables submit when the sidecar is healthy", async () => {
    mockHealth({ ok: true, ffmpeg: true, ffprobe: true, face: false, mediaDirWritable: true, version: "0.1.0" });
    renderWorkspace();
    await waitFor(() => expect(screen.queryByText(/Watermark service unavailable/i)).toBeNull());
    const btn = screen.getByRole("button", { name: /Add watermark & download/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows a degradation banner and disables submit when the sidecar is down", async () => {
    mockHealth({ ok: false, ffmpeg: false, ffprobe: false, face: false, mediaDirWritable: false, version: "0.1.0" }, false);
    renderWorkspace();
    await waitFor(() => expect(screen.getByText(/Watermark service unavailable/i)).toBeTruthy());
    const btn = screen.getByRole("button", { name: /Add watermark & download/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});

// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as React from "react";
import { NextIntlClientProvider } from "next-intl";
import { DraftSwitcher } from "@/presentation/generation/draft-switcher";
import type { GenerationDraft } from "@/domain/schemas";
import en from "../../../messages/en.json";

const version = (id: string, label: string | undefined, createdAt: string): GenerationDraft => ({
  id,
  generationId: "gen_1",
  label,
  content: "x",
  kind: "snapshot",
  source: "edited",
  createdAt,
});

function renderSwitcher(props: Partial<React.ComponentProps<typeof DraftSwitcher>>) {
  const merged: React.ComponentProps<typeof DraftSwitcher> = {
    versions: [],
    saving: false,
    saved: false,
    busy: false,
    compareId: null,
    onSaveVersion: () => {},
    onRestore: () => {},
    onToggleCompare: () => {},
    ...props,
  };
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DraftSwitcher {...merged} />
    </NextIntlClientProvider>,
  );
}

describe("DraftSwitcher", () => {
  it("shows a hint when there are no saved versions", () => {
    renderSwitcher({});
    expect(screen.getByText("No saved versions yet")).toBeTruthy();
  });

  it("fires save-version", () => {
    const onSaveVersion = vi.fn();
    renderSwitcher({ onSaveVersion });
    fireEvent.click(screen.getByText("Save version"));
    expect(onSaveVersion).toHaveBeenCalled();
  });

  it("renders one row per version and labels unlabeled ones", () => {
    renderSwitcher({
      versions: [version("d1", "Draft v1", "2026-06-26T00:00:00Z"), version("d2", undefined, "2026-06-26T01:00:00Z")],
    });
    expect(screen.getByText("Draft v1")).toBeTruthy();
    expect(screen.getByText("Version 2")).toBeTruthy();
  });

  it("fires restore and compare with the version id", () => {
    const onRestore = vi.fn();
    const onToggleCompare = vi.fn();
    renderSwitcher({ versions: [version("d1", "v1", "2026-06-26T00:00:00Z")], onRestore, onToggleCompare });
    fireEvent.click(screen.getByLabelText("Restore"));
    fireEvent.click(screen.getByLabelText("Compare"));
    expect(onRestore).toHaveBeenCalledWith("d1");
    expect(onToggleCompare).toHaveBeenCalledWith("d1");
  });

  it("shows a saving indicator", () => {
    renderSwitcher({ saving: true });
    expect(screen.getByText("Saving…")).toBeTruthy();
  });

  it("disables save-version and restore while busy", () => {
    renderSwitcher({ busy: true, versions: [version("d1", "v1", "2026-06-26T00:00:00Z")] });
    expect((screen.getByText("Save version").closest("button") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Restore") as HTMLButtonElement).disabled).toBe(true);
  });
});

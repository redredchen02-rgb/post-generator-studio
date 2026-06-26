// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as React from "react";
import { NextIntlClientProvider } from "next-intl";
import { SelectionToolbar } from "@/presentation/generation/editor/selection-toolbar";
import en from "../../../messages/en.json";

function renderToolbar(props: Partial<React.ComponentProps<typeof SelectionToolbar>>) {
  const merged = {
    position: { top: 10, left: 20 },
    selectionChars: 30,
    onAction: () => {},
    ...props,
  } as React.ComponentProps<typeof SelectionToolbar>;
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SelectionToolbar {...merged} />
    </NextIntlClientProvider>,
  );
}

describe("SelectionToolbar", () => {
  it("renders rewrite/expand/tone for a short selection", () => {
    renderToolbar({ selectionChars: 20 });
    expect(screen.getByText("Rewrite")).toBeTruthy();
    expect(screen.getByText("Expand")).toBeTruthy();
    expect(screen.getByText("Tone")).toBeTruthy();
    expect(screen.queryByText("Condense")).toBeNull();
  });

  it("adds condense for a long selection", () => {
    renderToolbar({ selectionChars: 200 });
    expect(screen.getByText("Condense")).toBeTruthy();
  });

  it("renders nothing without a position (no active selection)", () => {
    const { container } = renderToolbar({ position: null });
    expect(container.querySelector("[role=toolbar]")).toBeNull();
  });

  it("renders nothing for an empty selection", () => {
    const { container } = renderToolbar({ selectionChars: 0 });
    expect(container.querySelector("[role=toolbar]")).toBeNull();
  });

  it("fires onAction with the action id", () => {
    const onAction = vi.fn();
    renderToolbar({ onAction });
    fireEvent.click(screen.getByText("Rewrite"));
    expect(onAction).toHaveBeenCalledWith("rewrite");
  });

  it("disables actions while a generation stream is running", () => {
    renderToolbar({ disabled: true });
    expect((screen.getByText("Rewrite") as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a busy label instead of actions while rewriting", () => {
    renderToolbar({ busy: true });
    expect(screen.getByText("Rewriting…")).toBeTruthy();
    expect(screen.queryByText("Rewrite")).toBeNull();
  });
});

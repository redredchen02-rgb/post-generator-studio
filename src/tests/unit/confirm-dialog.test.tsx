// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as React from "react";
import { NextIntlClientProvider } from "next-intl";
import { ConfirmDialog } from "@/presentation/components/ui/confirm-dialog";
import en from "../../../messages/en.json";

function renderDialog(props: Partial<React.ComponentProps<typeof ConfirmDialog>>) {
  const merged: React.ComponentProps<typeof ConfirmDialog> = {
    open: true,
    onOpenChange: () => {},
    title: "Delete this item?",
    description: "This cannot be undone.",
    confirmLabel: "Delete",
    onConfirm: () => {},
    ...props,
  };
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ConfirmDialog {...merged} />
    </NextIntlClientProvider>,
  );
}

describe("ConfirmDialog", () => {
  it("renders title, description and confirm label when open", () => {
    renderDialog({});
    expect(screen.getByText("Delete this item?")).toBeTruthy();
    expect(screen.getByText("This cannot be undone.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  });

  it("renders nothing when closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByText("Delete this item?")).toBeNull();
  });

  it("calls onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("requests close (and does not confirm) when cancel is clicked", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({ onConfirm, onOpenChange });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as React from "react";
import { NextIntlClientProvider } from "next-intl";
import { VariantCompare } from "@/presentation/generation/variant-compare";
import type { VariantSlot } from "@/presentation/generation/use-variant-generation";
import en from "../../../messages/en.json";

const slot = (over: Partial<VariantSlot> & { index: number }): VariantSlot => ({
  status: "completed",
  content: "body",
  generation: null,
  error: null,
  edited: false,
  ...over,
});

function renderCompare(props: Partial<React.ComponentProps<typeof VariantCompare>>) {
  const merged: React.ComponentProps<typeof VariantCompare> = {
    variants: [slot({ index: 0 }), slot({ index: 1 })],
    busy: false,
    onEditVariant: () => {},
    onSelect: () => {},
    onCancel: () => {},
    onDiscard: () => {},
    ...props,
  };
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <VariantCompare {...merged} />
    </NextIntlClientProvider>,
  );
}

describe("VariantCompare", () => {
  it("renders one card per variant", () => {
    renderCompare({ variants: [slot({ index: 0 }), slot({ index: 1 }), slot({ index: 2 })] });
    expect(screen.getByText("Variant 1")).toBeTruthy();
    expect(screen.getByText("Variant 3")).toBeTruthy();
  });

  it("fires onSelect with the variant index", () => {
    const onSelect = vi.fn();
    renderCompare({ variants: [slot({ index: 0 }), slot({ index: 1 })], onSelect });
    const buttons = screen.getAllByText("Use this one");
    fireEvent.click(buttons[1]);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("edits propagate to onEditVariant (session-persistent state lives in the parent)", () => {
    const onEditVariant = vi.fn();
    renderCompare({ variants: [slot({ index: 0, content: "hello" })], onEditVariant });
    const textarea = screen.getByDisplayValue("hello");
    fireEvent.change(textarea, { target: { value: "hello edited" } });
    expect(onEditVariant).toHaveBeenCalledWith(0, "hello edited");
  });

  it("disables select for a non-completed or empty variant", () => {
    renderCompare({
      variants: [slot({ index: 0, status: "streaming", content: "" }), slot({ index: 1, content: "" })],
    });
    screen.getAllByText("Use this one").forEach((btn) => {
      expect((btn.closest("button") as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it("shows the error for a failed variant instead of an editor", () => {
    renderCompare({ variants: [slot({ index: 0, status: "failed", error: "boom", content: "" })] });
    expect(screen.getByText("boom")).toBeTruthy();
  });

  it("shows cancel while busy and discard when idle", () => {
    const { rerender } = renderCompare({ busy: true });
    expect(screen.getByText("Stop")).toBeTruthy();
    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <VariantCompare
          variants={[slot({ index: 0 })]}
          busy={false}
          onEditVariant={() => {}}
          onSelect={() => {}}
          onCancel={() => {}}
          onDiscard={() => {}}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Discard")).toBeTruthy();
  });
});

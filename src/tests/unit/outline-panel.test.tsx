// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as React from "react";
import { NextIntlClientProvider } from "next-intl";
import { OutlinePanel } from "@/presentation/generation/outline-panel";
import en from "../../../messages/en.json";

function renderPanel(props: Partial<React.ComponentProps<typeof OutlinePanel>>) {
  const merged: React.ComponentProps<typeof OutlinePanel> = {
    items: ["Intro", "Body"],
    onChangeItem: () => {},
    onAddItem: () => {},
    onRemoveItem: () => {},
    onMoveItem: () => {},
    onRegenerate: () => {},
    onExpand: () => {},
    onCancel: () => {},
    ...props,
  };
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <OutlinePanel {...merged} />
    </NextIntlClientProvider>,
  );
}

describe("OutlinePanel", () => {
  it("renders one input per section", () => {
    renderPanel({ items: ["A", "B", "C"] });
    expect(screen.getAllByPlaceholderText("Section title")).toHaveLength(3);
  });

  it("disables expand when every section is blank, enables it otherwise", () => {
    const { rerender } = renderPanel({ items: ["", "  "] });
    expect((screen.getByText("Expand to article").closest("button") as HTMLButtonElement).disabled).toBe(true);
    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <OutlinePanel
          items={["Real"]}
          onChangeItem={() => {}}
          onAddItem={() => {}}
          onRemoveItem={() => {}}
          onMoveItem={() => {}}
          onRegenerate={() => {}}
          onExpand={() => {}}
          onCancel={() => {}}
        />
      </NextIntlClientProvider>,
    );
    expect((screen.getByText("Expand to article").closest("button") as HTMLButtonElement).disabled).toBe(false);
  });

  it("fires expand and add callbacks", () => {
    const onExpand = vi.fn();
    const onAddItem = vi.fn();
    renderPanel({ onExpand, onAddItem });
    fireEvent.click(screen.getByText("Expand to article"));
    fireEvent.click(screen.getByText("Add section"));
    expect(onExpand).toHaveBeenCalled();
    expect(onAddItem).toHaveBeenCalled();
  });

  it("disables move-up on the first row and move-down on the last", () => {
    renderPanel({ items: ["A", "B"] });
    const up = screen.getAllByLabelText("Move up") as HTMLButtonElement[];
    const down = screen.getAllByLabelText("Move down") as HTMLButtonElement[];
    expect(up[0].disabled).toBe(true);
    expect(down[down.length - 1].disabled).toBe(true);
  });

  it("disables actions while busy", () => {
    renderPanel({ busy: true });
    expect((screen.getByText("Expand to article").closest("button") as HTMLButtonElement).disabled).toBe(true);
  });
});

// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";
import { NextIntlClientProvider } from "next-intl";
import { CodeMirrorEditor } from "@/presentation/generation/editor/codemirror-editor";
import en from "../../../messages/en.json";

function renderEditor(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("CodeMirrorEditor", () => {
  it("renders the controlled value as editable document text", () => {
    const { container } = renderEditor(
      <CodeMirrorEditor value="# Hello world" onChange={() => {}} />,
    );
    const content = container.querySelector(".cm-content");
    expect(content).not.toBeNull();
    expect(content?.textContent).toContain("Hello world");
    // Editable by default.
    expect(content?.getAttribute("contenteditable")).toBe("true");
  });

  it("is read-only while generating (tokens appended programmatically, D7)", () => {
    const { container } = renderEditor(
      <CodeMirrorEditor value="streaming…" onChange={() => {}} readOnly />,
    );
    const content = container.querySelector(".cm-content");
    expect(content?.getAttribute("contenteditable")).toBe("false");
    expect(content?.textContent).toContain("streaming");
  });

  it("reflects external value updates (streaming token append stays visible)", () => {
    const onChange = vi.fn();
    const { container, rerender } = renderEditor(
      <CodeMirrorEditor value="one" onChange={onChange} readOnly />,
    );
    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <CodeMirrorEditor value="one two" onChange={onChange} readOnly />
      </NextIntlClientProvider>,
    );
    const content = container.querySelector(".cm-content");
    expect(content?.textContent).toContain("one two");
    // Programmatic external updates must not fire user onChange.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the placeholder when empty", () => {
    const { container } = renderEditor(
      <CodeMirrorEditor value="" onChange={() => {}} placeholder="Start writing…" />,
    );
    const placeholder = container.querySelector(".cm-placeholder");
    expect(placeholder?.textContent).toContain("Start writing");
  });
});

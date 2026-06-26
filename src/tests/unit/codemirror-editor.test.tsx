// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as React from "react";
import { NextIntlClientProvider } from "next-intl";
import { CodeMirrorEditor } from "@/presentation/generation/editor/codemirror-editor";
import { requestCompletion } from "@/presentation/lib/api";
import en from "../../../messages/en.json";

vi.mock("@/presentation/lib/api", () => ({ requestCompletion: vi.fn() }));
const mockCompletion = vi.mocked(requestCompletion);

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

describe("CodeMirrorEditor rewrite actions", () => {
  beforeEach(() => mockCompletion.mockReset());

  it("continue appends the suggestion at the document end", async () => {
    mockCompletion.mockResolvedValue({ content: "NEW PART" });
    const onChange = vi.fn();
    renderEditor(<CodeMirrorEditor value="Hello." onChange={onChange} presetId="preset_1" />);
    fireEvent.click(screen.getByText("Continue"));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenCalledWith("Hello.\n\nNEW PART", expect.anything());
  });

  it("surfaces an empty completion as an error instead of silently doing nothing", async () => {
    mockCompletion.mockResolvedValue({ content: "   \n  " });
    renderEditor(<CodeMirrorEditor value="Hello." onChange={() => {}} presetId="preset_1" />);
    fireEvent.click(screen.getByText("Continue"));
    expect(await screen.findByText("No suggestion returned")).toBeTruthy();
  });

  it("surfaces a failed completion as an error", async () => {
    mockCompletion.mockImplementationOnce(() => Promise.reject(new Error("boom")));
    renderEditor(<CodeMirrorEditor value="Hello." onChange={() => {}} presetId="preset_1" />);
    fireEvent.click(screen.getByText("Continue"));
    expect(await screen.findByText("boom")).toBeTruthy();
  });

  it("regenerate-paragraph shows a diff and accept replaces only that paragraph", async () => {
    mockCompletion.mockResolvedValue({ content: "REWRITTEN" });
    const onChange = vi.fn();
    renderEditor(
      <CodeMirrorEditor value={"Para one.\n\nPara two."} onChange={onChange} presetId="preset_1" />,
    );
    fireEvent.click(screen.getByText("Regenerate paragraph"));
    // Diff dialog appears with the suggestion.
    expect(await screen.findByText("REWRITTEN")).toBeTruthy();
    fireEvent.click(screen.getByText("Accept"));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenCalledWith("REWRITTEN\n\nPara two.", expect.anything());
  });

  it("strips a markdown code fence wrapping the suggestion before inserting", async () => {
    mockCompletion.mockResolvedValue({ content: "```\nFENCED\n```" });
    const onChange = vi.fn();
    renderEditor(<CodeMirrorEditor value="Hi." onChange={onChange} presetId="preset_1" />);
    fireEvent.click(screen.getByText("Continue"));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenCalledWith("Hi.\n\nFENCED", expect.anything());
  });
});

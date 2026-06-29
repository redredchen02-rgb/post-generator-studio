// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

import { InputPanel, type InputPanelForm, type InputPanelHandlers } from "@/presentation/generation/input-panel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bootstrap: any = {
  providerProfiles: [{ id: "prov1", name: "Provider One", enabled: true }],
  generationPresets: [{ id: "p1", name: "Preset One" }],
  promptTemplates: [],
};

const baseForm: InputPanelForm = {
  title: "Hello",
  eventSummary: "Sum",
  presetId: "p1",
  selectedProfileId: "prov1",
  customVarValues: {},
  controls: {},
  providerError: null,
  isGenerating: false,
  selectedTemplate: undefined,
  selectedPreset: undefined,
  outlineMode: false,
  variantCount: 1,
};

function makeHandlers(): InputPanelHandlers {
  return {
    onTitleChange: vi.fn(),
    onEventSummaryChange: vi.fn(),
    onPresetIdChange: vi.fn(),
    onProfileIdChange: vi.fn(),
    onCustomVarChange: vi.fn(),
    onControlChange: vi.fn(),
    onOutlineModeChange: vi.fn(),
    onVariantCountChange: vi.fn(),
    onGenerate: vi.fn(),
    onCancel: vi.fn(),
  };
}

afterEach(cleanup);

describe("InputPanel (grouped props)", () => {
  it("edits the title through the form/handlers groups", () => {
    const handlers = makeHandlers();
    render(<InputPanel bootstrap={bootstrap} form={baseForm} handlers={handlers} />);
    fireEvent.change(screen.getByDisplayValue("Hello"), { target: { value: "Hello 2" } });
    expect(handlers.onTitleChange).toHaveBeenCalledWith("Hello 2");
  });

  it("fires generate and surfaces a provider error", () => {
    const handlers = makeHandlers();
    render(
      <InputPanel
        bootstrap={bootstrap}
        form={{ ...baseForm, providerError: "boom" }}
        handlers={handlers}
      />,
    );
    expect(screen.getByText("boom")).toBeTruthy();
    fireEvent.click(screen.getByText("generateBtn"));
    expect(handlers.onGenerate).toHaveBeenCalled();
  });

  it("disables generate when no provider is enabled", () => {
    const handlers = makeHandlers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const noProvider: any = { ...bootstrap, providerProfiles: [{ id: "x", name: "x", enabled: false }] };
    render(<InputPanel bootstrap={noProvider} form={baseForm} handlers={handlers} />);
    fireEvent.click(screen.getByText("generateBtn"));
    expect(handlers.onGenerate).not.toHaveBeenCalled();
  });
});

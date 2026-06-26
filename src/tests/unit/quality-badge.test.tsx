// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as React from "react";
import { NextIntlClientProvider } from "next-intl";
import { QualityBadge } from "@/presentation/generation/quality-badge";
import type { QualityScore } from "@/domain/schemas";
import en from "../../../messages/en.json";

const SCORE: QualityScore = {
  relevance: { score: 5, justification: "On topic." },
  coherence: { score: 4, justification: "Flows well." },
  factuality: { score: 4, justification: "Grounded." },
  style: { score: 3, justification: "Plain." },
  completeness: { score: 4, justification: "Thorough." },
  overall: 4,
  judgeModel: "judge-model",
  selfEvaluated: false,
  scoredAt: "2026-06-26T00:00:00.000Z",
};

function renderBadge(props: Partial<React.ComponentProps<typeof QualityBadge>>) {
  const merged: React.ComponentProps<typeof QualityBadge> = {
    score: null,
    scoring: false,
    onScore: () => {},
    ...props,
  };
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <QualityBadge {...merged} />
    </NextIntlClientProvider>,
  );
}

describe("QualityBadge", () => {
  it("shows a score trigger when there is no score yet", () => {
    const onScore = vi.fn();
    renderBadge({ onScore });
    fireEvent.click(screen.getByText("Score quality"));
    expect(onScore).toHaveBeenCalled();
  });

  it("disables the trigger when disabled or scoring", () => {
    renderBadge({ disabled: true });
    expect((screen.getByText("Score quality").closest("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders the overall and reveals per-dimension justifications on expand", () => {
    renderBadge({ score: SCORE });
    expect(screen.getByText("Quality 4/5")).toBeTruthy();
    // Justifications hidden until expanded.
    expect(screen.queryByText("Plain.")).toBeNull();
    fireEvent.click(screen.getByText("Quality 4/5"));
    expect(screen.getByText("Plain.")).toBeTruthy();
    expect(screen.getByText("A test reader's suggestions — not an automatic rewrite.")).toBeTruthy();
  });

  it("shows the self-evaluation caveat only when selfEvaluated", () => {
    const { unmount } = renderBadge({ score: SCORE });
    fireEvent.click(screen.getByText("Quality 4/5"));
    expect(screen.queryByText(/rough self-estimate/)).toBeNull();
    unmount();
    renderBadge({ score: { ...SCORE, selfEvaluated: true } });
    fireEvent.click(screen.getByText("Quality 4/5"));
    expect(screen.getByText(/rough self-estimate/)).toBeTruthy();
  });
});

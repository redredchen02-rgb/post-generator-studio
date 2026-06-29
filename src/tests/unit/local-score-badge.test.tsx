// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as React from "react";
import { NextIntlClientProvider } from "next-intl";
import { LocalScoreBadge } from "@/presentation/generation/local-score-badge";
import type { LocalScore } from "@/domain/schemas";
import en from "../../../messages/en.json";

const GOOD: LocalScore = { text: "x", score: 4, breakdown: { openers: 2, cta: 2 }, flags: ["opener:shock", "cta"] };
const SLOP: LocalScore = { text: "y", score: -5, breakdown: { ai_banned: -5 }, flags: ["ai_slop"] };

function renderBadge(props: Partial<React.ComponentProps<typeof LocalScoreBadge>>) {
  const merged: React.ComponentProps<typeof LocalScoreBadge> = {
    score: null,
    scoring: false,
    onScore: () => {},
    ...props,
  };
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <LocalScoreBadge {...merged} />
    </NextIntlClientProvider>,
  );
}

describe("LocalScoreBadge", () => {
  it("shows a score trigger when there is no score yet", () => {
    const onScore = vi.fn();
    renderBadge({ onScore });
    fireEvent.click(screen.getByText("Local score"));
    expect(onScore).toHaveBeenCalled();
  });

  it("disables the trigger when disabled or scoring", () => {
    renderBadge({ disabled: true });
    expect((screen.getByText("Local score").closest("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders the score chip and reveals the breakdown on expand", () => {
    renderBadge({ score: GOOD });
    // breakdown hidden until expanded
    expect(screen.queryByText("openers")).toBeNull();
    fireEvent.click(screen.getByText("Local 4"));
    expect(screen.getByText("openers")).toBeTruthy();
    expect(screen.getByText("cta")).toBeTruthy();
    // both signals contribute +2
    expect(screen.getAllByText("+2")).toHaveLength(2);
  });

  it("flags ai_slop with a caveat", () => {
    renderBadge({ score: SLOP });
    fireEvent.click(screen.getByText("Local -5"));
    expect(screen.getByText(/consider rewriting/i)).toBeTruthy();
    expect(screen.getByText("-5")).toBeTruthy();
  });

  it("surfaces an error under the trigger when scoring failed", () => {
    renderBadge({ score: null, error: "热点边车未启动" });
    expect(screen.getByText("热点边车未启动")).toBeTruthy();
  });
});

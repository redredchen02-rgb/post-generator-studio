// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import * as React from "react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";

const mockListBackups = vi.fn();
const mockCreateBackup = vi.fn();
const mockRestoreBackup = vi.fn();
const mockDeleteBackup = vi.fn();
const mockInvalidate = vi.fn();

vi.mock("@/presentation/lib/api", () => ({
  listBackups: (...a: unknown[]) => mockListBackups(...a),
  createBackup: (...a: unknown[]) => mockCreateBackup(...a),
  restoreBackup: (...a: unknown[]) => mockRestoreBackup(...a),
  deleteBackup: (...a: unknown[]) => mockDeleteBackup(...a),
}));

vi.mock("@/presentation/store/bootstrap-store", () => ({
  useBootstrapStore: (selector: (s: { invalidate: () => void }) => unknown) =>
    selector({ invalidate: mockInvalidate }),
}));

import { StoragePanel } from "@/presentation/settings/storage-panel";

const ONE_BACKUP = [
  {
    id: "backup-1",
    createdAt: "2026-06-26T00:00:00.000Z",
    schemaVer: 1,
    fileSizeBytes: 2048,
    includesSecrets: true,
  },
];

function renderPanel() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <StoragePanel />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListBackups.mockResolvedValue([]);
  mockCreateBackup.mockResolvedValue(ONE_BACKUP[0]);
  mockRestoreBackup.mockResolvedValue(undefined);
  mockDeleteBackup.mockResolvedValue(undefined);
});

describe("StoragePanel", () => {
  it("shows the empty state when there are no backups", async () => {
    renderPanel();
    expect(await screen.findByText("No backups yet.")).toBeTruthy();
  });

  it("lists existing backups", async () => {
    mockListBackups.mockResolvedValue(ONE_BACKUP);
    renderPanel();
    expect(await screen.findByText(/Size:/)).toBeTruthy();
  });

  it("creates a backup when the button is clicked", async () => {
    renderPanel();
    await screen.findByText("No backups yet.");
    fireEvent.click(screen.getByRole("button", { name: "Create backup" }));
    await waitFor(() => expect(mockCreateBackup).toHaveBeenCalledTimes(1));
  });

  it("does NOT restore until the confirmation is accepted", async () => {
    mockListBackups.mockResolvedValue(ONE_BACKUP);
    renderPanel();
    await screen.findByText(/Size:/);

    // Clicking Restore opens the dialog but must not call the API yet.
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Restore this backup?")).toBeTruthy();
    expect(mockRestoreBackup).not.toHaveBeenCalled();

    // Confirm → API called with the backup id + bootstrap invalidated.
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(mockRestoreBackup).toHaveBeenCalledWith("backup-1"));
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it("does NOT delete until the confirmation is accepted", async () => {
    mockListBackups.mockResolvedValue(ONE_BACKUP);
    renderPanel();
    await screen.findByText(/Size:/);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Delete this backup?")).toBeTruthy();
    expect(mockDeleteBackup).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mockDeleteBackup).toHaveBeenCalledWith("backup-1"));
  });
});

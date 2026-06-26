import { describe, expect, it, vi, beforeEach } from "vitest";

const mockCreateBackup = vi.fn();
const mockListBackups = vi.fn();
const mockDeleteBackup = vi.fn();
const mockRestoreBackup = vi.fn();

vi.mock("@/application/storage/backup-service", () => ({
  createBackup: (...a: unknown[]) => mockCreateBackup(...a),
  listBackups: (...a: unknown[]) => mockListBackups(...a),
  deleteBackup: (...a: unknown[]) => mockDeleteBackup(...a),
  restoreBackup: (...a: unknown[]) => mockRestoreBackup(...a),
}));

import { GET as backupGet, POST as backupPost } from "@/app/api/storage/backup/route";
import { DELETE as backupDelete } from "@/app/api/storage/backup/[id]/route";
import { POST as restorePost } from "@/app/api/storage/restore/route";

function req(body?: unknown): Request {
  return new Request("http://localhost/api/storage/restore", {
    method: "POST",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/storage/backup", () => {
  it("returns the backup list", async () => {
    mockListBackups.mockReturnValue([{ id: "backup-1", schemaVer: 1 }]);
    const res = await backupGet();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "backup-1", schemaVer: 1 }]);
  });
});

describe("POST /api/storage/backup", () => {
  it("creates a backup and returns 201", async () => {
    mockCreateBackup.mockResolvedValue({ id: "backup-1", schemaVer: 1 });
    const res = await backupPost();
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: "backup-1" });
  });

  it("maps a creation failure to 500", async () => {
    mockCreateBackup.mockRejectedValue(new Error("disk full"));
    const res = await backupPost();
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/storage/backup/[id]", () => {
  it("returns 204 when a backup is deleted", async () => {
    mockDeleteBackup.mockReturnValue(true);
    const res = await backupDelete(new Request("http://localhost"), ctx("backup-1"));
    expect(res.status).toBe(204);
  });

  it("returns 404 when the backup does not exist", async () => {
    mockDeleteBackup.mockReturnValue(false);
    const res = await backupDelete(new Request("http://localhost"), ctx("nope"));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/storage/restore", () => {
  it("restores and returns ok", async () => {
    mockRestoreBackup.mockResolvedValue(undefined);
    const res = await restorePost(req({ id: "backup-1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockRestoreBackup).toHaveBeenCalledWith("backup-1");
  });

  it("returns 400 when id is missing", async () => {
    const res = await restorePost(req({}));
    expect(res.status).toBe(400);
    expect(mockRestoreBackup).not.toHaveBeenCalled();
  });

  it("maps a restore failure to 500", async () => {
    mockRestoreBackup.mockRejectedValue(new Error("swap failed"));
    const res = await restorePost(req({ id: "backup-1" }));
    expect(res.status).toBe(500);
  });
});

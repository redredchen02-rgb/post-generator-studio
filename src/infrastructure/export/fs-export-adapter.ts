import fs from "node:fs/promises";
import type { ExportPort } from "@/domain/ports/export-port";

export class FsExportAdapter implements ExportPort {
  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, "utf8");
  }

  async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

let _adapter: ExportPort = new FsExportAdapter();

export function getExportAdapter(): ExportPort {
  return _adapter;
}

export function setExportAdapter(adapter: ExportPort): void {
  _adapter = adapter;
}

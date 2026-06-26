export interface ExportPort {
  writeFile(filePath: string, content: string): Promise<void>;
  ensureDir(dirPath: string): Promise<void>;
}

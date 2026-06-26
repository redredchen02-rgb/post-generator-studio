import path from "node:path";
import { getExportsDir } from "@/infrastructure/config/paths";
import { stripMarkdown } from "@/lib/utils";
import { getGeneration } from "@/application/generation/generation-service";
import { getExportAdapter } from "@/infrastructure/export/fs-export-adapter";

function safeFilename(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "generation";
}

export async function exportGeneration(id: string, format: "md" | "txt"): Promise<{ path: string; content: string; filename: string }> {
  const generation = await getGeneration(id);
  const source = generation.outputContent || "";
  const content = format === "txt" ? stripMarkdown(source) : source;
  const filename = `${safeFilename(generation.title)}-${id}.${format}`;
  const adapter = getExportAdapter();
  await adapter.ensureDir(getExportsDir());
  const filePath = path.join(getExportsDir(), filename);
  await adapter.writeFile(filePath, content);
  return { path: filePath, content, filename };
}

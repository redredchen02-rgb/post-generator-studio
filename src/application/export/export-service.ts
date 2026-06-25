import fs from "node:fs/promises";
import path from "node:path";
import { getExportsDir } from "@/infrastructure/config/paths";
import { stripMarkdown } from "@/lib/utils";
import { getGeneration } from "@/application/generation/generation-service";

function safeFilename(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "generation";
}

export async function exportGeneration(id: string, format: "md" | "txt"): Promise<{ path: string; content: string; filename: string }> {
  const generation = await getGeneration(id);
  const source = generation.outputContent || "";
  const content = format === "txt" ? stripMarkdown(source) : source;
  const filename = `${safeFilename(generation.title)}-${id}.${format}`;
  await fs.mkdir(getExportsDir(), { recursive: true });
  const filePath = path.join(getExportsDir(), filename);
  await fs.writeFile(filePath, content, "utf8");
  return { path: filePath, content, filename };
}


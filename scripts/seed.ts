import { getDb } from "@/infrastructure/storage/db";

async function main(): Promise<void> {
  await getDb();
  console.log("Default providers, prompt templates, and presets are ready.");
}

void main();

import { runMigrations } from "@/infrastructure/storage/migrations";

async function main(): Promise<void> {
  await runMigrations();
  console.log("Database migrations applied.");
}

void main();

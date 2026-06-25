import { runMigrations } from "@/infrastructure/storage/migrations";
import { getDb } from "@/infrastructure/storage/db";

const args = process.argv.slice(2);
const command = args[0] || "migrate";

async function main(): Promise<void> {
  try {
    switch (command) {
      case "migrate":
        if (args.includes("--dry-run")) {
          console.log("[dry-run] Would apply pending migrations");
          return;
        }
        await runMigrations();
        console.log("数据库迁移完成。");
        break;

      case "status": {
        const db = await getDb();
        const tables = db.all(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        ) as Array<{ name: string }>;
        console.log("数据库表：");
        for (const table of tables) {
          const count = (db.get(`SELECT COUNT(*) as count FROM "${table.name}"`) as { count: number }).count;
          console.log(`  ${table.name}: ${count} 行`);
        }
        break;
      }

      default:
        console.error(`未知命令: ${command}`);
        console.error("可用命令: migrate, status");
        process.exit(1);
    }
  } catch (error) {
    console.error("操作失败:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

void main();

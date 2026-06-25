import { getDb } from "@/infrastructure/storage/db";

async function main(): Promise<void> {
  try {
    await getDb();
    console.log("默认数据初始化完成。");
  } catch (error) {
    console.error("初始化失败:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

void main();

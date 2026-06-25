import type { Config } from "drizzle-kit";

export default {
  schema: "./src/infrastructure/storage/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.POST_GENERATOR_DB_PATH ?? "./data/post-generator.db",
  },
} satisfies Config;

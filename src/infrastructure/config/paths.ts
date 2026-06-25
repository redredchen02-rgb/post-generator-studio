import os from "node:os";
import path from "node:path";

function expandHome(input: string): string {
  if (input === "~") {
    return os.homedir();
  }
  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

export function getDataHome(): string {
  return expandHome(process.env.POST_GENERATOR_HOME || "~/.post-generator");
}

export function getDatabasePath(): string {
  return process.env.POST_GENERATOR_DB_PATH || path.join(getDataHome(), "post-generator.db");
}

export function getSecretsDir(): string {
  return path.join(getDataHome(), "secrets");
}

export function getExportsDir(): string {
  return path.join(getDataHome(), "exports");
}

export function getLogsDir(): string {
  return path.join(getDataHome(), "logs");
}

export function getBackupsDir(): string {
  return path.join(getDataHome(), "backups");
}


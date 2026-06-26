import type { StoragePort } from "@/domain/ports/storage";
import { SqliteProviderProfileRepository } from "./provider-profile-repo";
import { SqlitePromptTemplateRepository } from "./prompt-template-repo";
import { SqliteGenerationPresetRepository } from "./generation-preset-repo";
import { SqliteGenerationRepository } from "./generation-repo";
import { SqliteGenerationDraftRepository } from "./generation-draft-repo";

export function createSqliteStorage(): StoragePort {
  return {
    providerProfiles: new SqliteProviderProfileRepository(),
    promptTemplates: new SqlitePromptTemplateRepository(),
    generationPresets: new SqliteGenerationPresetRepository(),
    generations: new SqliteGenerationRepository(),
    generationDrafts: new SqliteGenerationDraftRepository(),
  };
}

let storage: StoragePort | null = null;

export function getStorage(): StoragePort {
  storage ??= createSqliteStorage();
  return storage;
}

export function setStorage(port: StoragePort): void {
  storage = port;
}

export function resetStorage(): void {
  storage = null;
}

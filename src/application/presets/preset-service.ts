import { createId } from "@/lib/utils";
import {
  generationPresetCreateSchema,
  generationPresetUpdateSchema,
  type GenerationPreset,
} from "@/domain/schemas";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { getOrThrow } from "@/application/crud-helpers";

export async function listGenerationPresets(): Promise<GenerationPreset[]> {
  return getStorage().generationPresets.list();
}

export async function getGenerationPreset(id: string): Promise<GenerationPreset> {
  return getOrThrow(getStorage().generationPresets, id, "生成预设不存在");
}

export async function createGenerationPreset(input: unknown): Promise<GenerationPreset> {
  const parsed = generationPresetCreateSchema.parse(input);
  return getStorage().generationPresets.create({ ...parsed, id: createId("preset") });
}

export async function updateGenerationPreset(id: string, input: unknown): Promise<GenerationPreset> {
  const parsed = generationPresetUpdateSchema.parse(input);
  return getStorage().generationPresets.update(id, parsed);
}

export async function deleteGenerationPreset(id: string): Promise<void> {
  await getStorage().generationPresets.delete(id);
}


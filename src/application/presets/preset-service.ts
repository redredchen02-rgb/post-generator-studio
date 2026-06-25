import { createId } from "@/lib/utils";
import {
  generationPresetCreateSchema,
  generationPresetUpdateSchema,
  type GenerationPreset,
} from "@/domain/schemas";
import { AppErrorException } from "@/domain/schemas";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";

export async function listGenerationPresets(): Promise<GenerationPreset[]> {
  return getStorage().generationPresets.list();
}

export async function getGenerationPreset(id: string): Promise<GenerationPreset> {
  const preset = await getStorage().generationPresets.get(id);
  if (!preset) {
    throw new AppErrorException({ code: "NOT_FOUND", message: "Generation preset not found" });
  }
  return preset;
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


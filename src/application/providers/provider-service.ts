import { createId } from "@/lib/utils";
import {
  providerProfileCreateSchema,
  providerProfileUpdateSchema,
  type ProviderModel,
  type ProviderProfile,
} from "@/domain/schemas";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { deleteSecret, readSecret, saveSecret } from "@/infrastructure/security/secrets";
import { getProviderAdapter } from "@/infrastructure/providers/registry";
import { getOrThrow } from "@/application/crud-helpers";

export async function listProviderProfiles(): Promise<ProviderProfile[]> {
  return getStorage().providerProfiles.list();
}

export async function getProviderProfile(id: string): Promise<ProviderProfile> {
  return getOrThrow(getStorage().providerProfiles, id, "供应商配置不存在");
}

export async function createProviderProfile(input: unknown): Promise<ProviderProfile> {
  const parsed = providerProfileCreateSchema.parse(input);
  const secret = parsed.apiKey ? await saveSecret(parsed.apiKey) : undefined;
  return getStorage().providerProfiles.create({
    ...parsed,
    id: createId("provider"),
    apiKeyRef: secret?.ref,
    keyMasked: secret?.masked,
  });
}

export async function updateProviderProfile(id: string, input: unknown): Promise<ProviderProfile> {
  const parsed = providerProfileUpdateSchema.parse(input);
  const existing = await getProviderProfile(id);
  let secret: { ref: string; masked: string } | undefined;
  if (parsed.apiKey) {
    secret = await saveSecret(parsed.apiKey, existing.apiKeyRef);
  }
  if (parsed.clearApiKey) {
    await deleteSecret(existing.apiKeyRef);
  }
  return getStorage().providerProfiles.update(id, {
    ...parsed,
    apiKeyRef: secret?.ref,
    keyMasked: parsed.clearApiKey ? null : secret?.masked,
  });
}

export async function deleteProviderProfile(id: string): Promise<void> {
  const existing = await getProviderProfile(id);
  await deleteSecret(existing.apiKeyRef);
  await getStorage().providerProfiles.delete(id);
}

export async function testProviderProfile(id: string): Promise<{ ok: boolean; message: string; models?: ProviderModel[] }> {
  const profile = await getProviderProfile(id);
  const adapter = getProviderAdapter(profile.providerKind);
  const apiKey = await readSecret(profile.apiKeyRef);
  const validation = await adapter.validateConfig(profile, { apiKey });
  if (!validation.ok) {
    return { ok: false, message: validation.error?.message || "Provider 配置无效" };
  }
  const models = adapter.listModels ? await adapter.listModels(profile, { apiKey }) : [];
  return { ok: true, message: "Provider 连接配置可用", models };
}


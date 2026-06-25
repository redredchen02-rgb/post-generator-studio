import {
  AppErrorException,
  completionRequestSchema,
  type NormalizedGenerationRequest,
} from "@/domain/schemas";
import type { CompletionResult } from "@/domain/ports/provider";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { readSecret } from "@/infrastructure/security/secrets";
import { getProviderAdapter } from "@/infrastructure/providers/registry";
import { getOrThrow } from "@/application/crud-helpers";

/**
 * One-shot, non-streaming completion. Resolves the preset's provider/model,
 * checks the adapter advertises completion support (fail fast rather than call
 * an undefined optional method), and returns the full text plus token usage.
 */
export async function completeText(input: unknown): Promise<CompletionResult> {
  const parsed = completionRequestSchema.parse(input);

  const preset = await getOrThrow(getStorage().generationPresets, parsed.presetId, "生成预设不存在");
  const providerProfileId = parsed.providerProfileId ?? preset.providerProfileId;
  const profile = await getOrThrow(getStorage().providerProfiles, providerProfileId, "供应商配置不存在");

  if (!profile.enabled) {
    throw new AppErrorException({ code: "PROVIDER_DISABLED", message: "供应商未启用" });
  }

  const adapter = getProviderAdapter(profile.providerKind);
  if (!adapter.capabilities().supportsCompletion || !adapter.complete) {
    throw new AppErrorException({
      code: "COMPLETION_UNSUPPORTED",
      message: `${profile.providerKind} 不支持一次性补全`,
    });
  }

  const apiKey = await readSecret(profile.apiKeyRef);
  const request: NormalizedGenerationRequest = {
    systemPrompt: parsed.systemPrompt ?? "",
    userPrompt: parsed.prompt,
    model: profile.model,
    temperature: preset.temperature ?? profile.defaultTemperature,
    maxTokens: preset.maxTokens ?? profile.defaultMaxTokens,
    stream: false,
  };

  return adapter.complete(request, profile, { apiKey });
}

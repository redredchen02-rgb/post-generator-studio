"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { requestCompletion, testProviderProfile } from "@/presentation/lib/api";
import { buildOutlinePrompt, parseOutline, serializeOutline } from "@/presentation/lib/prompt-builders";
import { useVarMemoryStore } from "@/presentation/store/var-memory-store";
import type { GenerationControls } from "@/domain/schemas";
import type { BootstrapData } from "@/presentation/lib/api";
import type { useGenerationStream } from "./use-generation-stream";
import type { useVariantGeneration } from "./use-variant-generation";

type StreamApi = Pick<ReturnType<typeof useGenerationStream>, "generate" | "cancel" | "setActiveGeneration">;
type VariantApi = Pick<
  ReturnType<typeof useVariantGeneration>,
  "generateVariants" | "cancel" | "variants" | "reset"
> & { busy: boolean };

/**
 * Orchestrates the three generation modes (single / multi-variant / outline-first) plus
 * the pre-flight provider check. Extracted from GeneratorWorkspace so the component is
 * composition + layout; the streaming/variant hooks are injected so this stays testable
 * and free of its own data fetching.
 */
export function useGeneratorController(args: {
  bootstrap: BootstrapData | null;
  title: string;
  eventSummary: string;
  presetId: string;
  effectiveProviderId?: string;
  templateId?: string;
  controls: GenerationControls;
  customVarValues: Record<string, string>;
  variantCount: number;
  outlineMode: boolean;
  outline: string[] | null;
  setOutline: React.Dispatch<React.SetStateAction<string[] | null>>;
  stream: StreamApi;
  variant: VariantApi;
}) {
  const {
    bootstrap, title, eventSummary, presetId, effectiveProviderId, templateId,
    controls, customVarValues, variantCount, outlineMode, outline, setOutline, stream, variant,
  } = args;
  const t = useTranslations("Generation");
  const [providerError, setProviderError] = React.useState<string | null>(null);
  const [outlineBusy, setOutlineBusy] = React.useState(false);

  const ensureProviderOk = React.useCallback(async (): Promise<boolean> => {
    setProviderError(null);
    if (effectiveProviderId && bootstrap) {
      const profile = bootstrap.providerProfiles.find((p) => p.id === effectiveProviderId);
      if (!profile) { setProviderError(t("providerNotFound")); return false; }
      if (!profile.enabled) { setProviderError(t("providerDisabled")); return false; }
      try {
        const result = await testProviderProfile(effectiveProviderId);
        if (!result.ok) { setProviderError(result.message); return false; }
      } catch (err) {
        setProviderError(err instanceof Error ? err.message : t("providerCheckFailed"));
        return false;
      }
    }
    return true;
  }, [bootstrap, effectiveProviderId, t]);

  const handleGenerate = React.useCallback(
    async (regenerate = false, outlineConstraint?: string) => {
      if (!(await ensureProviderOk())) return;
      await stream.generate({
        title, eventSummary, presetId,
        providerProfileId: effectiveProviderId ?? "", regenerate,
        customVariables: customVarValues,
        controls: outlineConstraint ? { ...controls, outline: outlineConstraint } : controls,
        onSuccess: (vars) => {
          if (!templateId) return;
          for (const [k, v] of Object.entries(vars)) {
            useVarMemoryStore.getState().setVar(templateId, k, v);
          }
        },
      });
    },
    [ensureProviderOk, stream, title, eventSummary, presetId, effectiveProviderId, customVarValues, controls, templateId],
  );

  const handleGenerateVariants = React.useCallback(async () => {
    if (!presetId || !(await ensureProviderOk())) return;
    await variant.generateVariants(
      { title, eventSummary, presetId, providerProfileId: effectiveProviderId, customVariables: customVarValues, controls },
      variantCount,
    );
  }, [presetId, ensureProviderOk, variant, title, eventSummary, effectiveProviderId, customVarValues, controls, variantCount]);

  const selectVariant = React.useCallback(
    (index: number) => {
      const v = variant.variants[index];
      if (!v?.generation) return;
      stream.setActiveGeneration(v.generation, v.content);
      variant.reset();
    },
    [variant, stream],
  );

  const generateOutline = React.useCallback(async () => {
    if (!presetId || !(await ensureProviderOk())) return;
    setOutlineBusy(true);
    try {
      const { systemPrompt, prompt } = buildOutlinePrompt({ title, eventSummary, controls });
      const result = await requestCompletion({
        prompt, systemPrompt, presetId, providerProfileId: effectiveProviderId || undefined,
      });
      const items = parseOutline(result.content);
      setOutline(items.length > 0 ? items : [""]);
    } catch (err) {
      setProviderError(err instanceof Error ? err.message : t("providerCheckFailed"));
    } finally {
      setOutlineBusy(false);
    }
  }, [presetId, ensureProviderOk, title, eventSummary, controls, effectiveProviderId, setOutline, t]);

  const expandOutline = React.useCallback(() => {
    const constraint = serializeOutline(outline ?? []);
    if (!constraint) return;
    setOutline(null);
    void handleGenerate(false, constraint);
  }, [outline, setOutline, handleGenerate]);

  const onPrimaryGenerate = React.useCallback(() => {
    if (outlineMode) void generateOutline();
    else if (variantCount > 1) void handleGenerateVariants();
    else void handleGenerate(false);
  }, [outlineMode, variantCount, generateOutline, handleGenerateVariants, handleGenerate]);

  const cancelActive = React.useCallback(() => {
    if (variant.busy) void variant.cancel();
    else void stream.cancel();
  }, [variant, stream]);

  return {
    providerError,
    outlineBusy,
    handleGenerate,
    generateOutline,
    expandOutline,
    onPrimaryGenerate,
    cancelActive,
    selectVariant,
  };
}

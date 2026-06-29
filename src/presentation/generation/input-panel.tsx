"use client";

import * as React from "react";
import { Loader2, Play, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/presentation/components/ui/button";
import { Field } from "@/presentation/components/ui/field";
import { Input } from "@/presentation/components/ui/input";
import { NativeSelect } from "@/presentation/components/ui/native-select";
import { Textarea } from "@/presentation/components/ui/textarea";
import { extractTemplateVariables } from "@/presentation/lib/preview-prompt";
import type { BootstrapData } from "@/presentation/lib/api";
import type { GenerationControls, LengthTarget, ToneOption } from "@/domain/schemas";

const TONE_OPTIONS: ToneOption[] = ["professional", "casual", "enthusiastic", "authoritative", "friendly"];
const LENGTH_OPTIONS: LengthTarget[] = ["short", "medium", "long"];
const TONE_KEY: Record<ToneOption, string> = {
  professional: "toneProfessional",
  casual: "toneCasual",
  enthusiastic: "toneEnthusiastic",
  authoritative: "toneAuthoritative",
  friendly: "toneFriendly",
};
const LENGTH_KEY: Record<LengthTarget, string> = {
  short: "lengthShort",
  medium: "lengthMedium",
  long: "lengthLong",
};

const STANDARD_VARS = new Set(["TITLE", "EVENT_SUMMARY", "DATE", "TIME", "LOCALE"]);

function getCustomVars(template: { systemPrompt: string; userPromptTemplate: string } | undefined): string[] {
  if (!template) return [];
  const all = [
    ...extractTemplateVariables(template.systemPrompt),
    ...extractTemplateVariables(template.userPromptTemplate),
  ];
  return [...new Set(all)].filter((v) => !STANDARD_VARS.has(v));
}

/** Form values shown in the input panel. Grouped so the panel takes 3 props, not ~24. */
export type InputPanelForm = {
  title: string;
  eventSummary: string;
  presetId: string;
  selectedProfileId: string | null;
  customVarValues: Record<string, string>;
  controls: GenerationControls;
  providerError: string | null;
  isGenerating: boolean;
  selectedTemplate: BootstrapData["promptTemplates"][number] | undefined;
  selectedPreset: BootstrapData["generationPresets"][number] | undefined;
  outlineMode: boolean;
  variantCount: number;
};

/** Change/action callbacks for the input panel. */
export type InputPanelHandlers = {
  onTitleChange: (value: string) => void;
  onEventSummaryChange: (value: string) => void;
  onPresetIdChange: (value: string) => void;
  onProfileIdChange: (id: string) => void;
  onCustomVarChange: (varName: string, value: string) => void;
  onControlChange: (patch: Partial<GenerationControls>) => void;
  onOutlineModeChange: (value: boolean) => void;
  onVariantCountChange: (value: number) => void;
  onGenerate: () => void;
  onCancel: () => void;
};

type InputPanelProps = {
  bootstrap: BootstrapData;
  form: InputPanelForm;
  handlers: InputPanelHandlers;
};

export const InputPanel = React.memo(function InputPanel({ bootstrap, form, handlers }: InputPanelProps): React.ReactElement {
  const t = useTranslations("Generation");
  const tOutline = useTranslations("Outline");
  const tVariant = useTranslations("Variant");
  const customVars = getCustomVars(form.selectedTemplate);
  const enabledProviders = bootstrap.providerProfiles.filter((p) => p.enabled);
  const hasUsableProvider = enabledProviders.length > 0;

  return (
    <section className="app-surface grid h-fit gap-4 rounded-lg p-4 slide-up">
      <div>
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <Field label={t("titleLabel")}>
        <Input value={form.title} onChange={(e) => handlers.onTitleChange(e.target.value)} />
      </Field>
      <Field label={t("eventSummaryLabel")}>
        <Textarea
          value={form.eventSummary}
          onChange={(e) => handlers.onEventSummaryChange(e.target.value)}
          className="min-h-48"
        />
      </Field>
      <Field label={t("presetSelectorLabel")}>
        <NativeSelect value={form.presetId} onChange={(e) => handlers.onPresetIdChange(e.target.value)}>
          {bootstrap.generationPresets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={t("providerOverrideLabel")}>
        <NativeSelect
          value={form.selectedProfileId ?? ""}
          onChange={(e) => handlers.onProfileIdChange(e.target.value)}
        >
          {enabledProviders.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </NativeSelect>
        {!hasUsableProvider && (
          <p className="mt-1 text-xs text-destructive">{t("noProviderHint")}</p>
        )}
        {form.providerError && (
          <p className="mt-1 text-xs text-destructive">{form.providerError}</p>
        )}
      </Field>
      {customVars.length > 0 && (
        <div className="grid gap-3 rounded-lg border p-3">
          <span className="text-sm font-medium">{t("templateVariablesLabel")}</span>
          {customVars.map((varName) => (
            <Field key={varName} label={varName}>
              <Input
                value={form.customVarValues[varName] ?? ""}
                onChange={(e) => handlers.onCustomVarChange(varName, e.target.value)}
                placeholder={`Value for {{${varName}}}`}
              />
            </Field>
          ))}
        </div>
      )}
      <div className="grid gap-3 rounded-lg border p-3">
        <span className="text-sm font-medium">{t("controlsLabel")}</span>
        <Field label={t("customInstructionLabel")}>
          <Textarea
            value={form.controls.customInstruction ?? ""}
            onChange={(e) => handlers.onControlChange({ customInstruction: e.target.value })}
            placeholder={t("customInstructionPlaceholder")}
            className="min-h-16"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("toneLabel")}>
            <NativeSelect
              value={form.controls.tone ?? ""}
              onChange={(e) => handlers.onControlChange({ tone: (e.target.value || undefined) as ToneOption | undefined })}
            >
              <option value="">{t("controlDefault")}</option>
              {TONE_OPTIONS.map((tone) => (
                <option key={tone} value={tone}>{t(TONE_KEY[tone])}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("lengthLabel")}>
            <NativeSelect
              value={form.controls.lengthTarget ?? ""}
              onChange={(e) => handlers.onControlChange({ lengthTarget: (e.target.value || undefined) as LengthTarget | undefined })}
            >
              <option value="">{t("controlDefault")}</option>
              {LENGTH_OPTIONS.map((len) => (
                <option key={len} value={len}>{t(LENGTH_KEY[len])}</option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field label={t("audienceLabel")}>
          <Input
            value={form.controls.audience ?? ""}
            onChange={(e) => handlers.onControlChange({ audience: e.target.value })}
            placeholder={t("audiencePlaceholder")}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.outlineMode}
          onChange={(e) => handlers.onOutlineModeChange(e.target.checked)}
        />
        {tOutline("modeLabel")}
      </label>
      <Field label={tVariant("countLabel")}>
        <NativeSelect
          value={String(form.variantCount)}
          disabled={form.outlineMode}
          onChange={(e) => handlers.onVariantCountChange(Number(e.target.value))}
        >
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </NativeSelect>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Button disabled={form.isGenerating || !hasUsableProvider} onClick={handlers.onGenerate}>
          {form.isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {t("generateBtn")}
        </Button>
        <Button variant="outline" disabled={!form.isGenerating} onClick={handlers.onCancel}>
          <Square className="h-4 w-4" />
          {t("cancelBtn")}
        </Button>
      </div>
    </section>
  );
});

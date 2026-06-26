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

type InputPanelProps = {
  bootstrap: BootstrapData;
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
  onTitleChange: (value: string) => void;
  onEventSummaryChange: (value: string) => void;
  onPresetIdChange: (value: string) => void;
  onProfileIdChange: (id: string) => void;
  onCustomVarChange: (varName: string, value: string) => void;
  onControlChange: (patch: Partial<GenerationControls>) => void;
  outlineMode: boolean;
  onOutlineModeChange: (value: boolean) => void;
  variantCount: number;
  onVariantCountChange: (value: number) => void;
  onGenerate: () => void;
  onCancel: () => void;
};

export function InputPanel(props: InputPanelProps): React.ReactElement {
  const t = useTranslations("Generation");
  const tOutline = useTranslations("Outline");
  const tVariant = useTranslations("Variant");
  const customVars = getCustomVars(props.selectedTemplate);

  return (
    <section className="app-surface grid h-fit gap-4 rounded-lg p-4 slide-up">
      <div>
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <Field label={t("titleLabel")}>
        <Input value={props.title} onChange={(e) => props.onTitleChange(e.target.value)} />
      </Field>
      <Field label={t("eventSummaryLabel")}>
        <Textarea
          value={props.eventSummary}
          onChange={(e) => props.onEventSummaryChange(e.target.value)}
          className="min-h-48"
        />
      </Field>
      <Field label={t("presetSelectorLabel")}>
        <NativeSelect value={props.presetId} onChange={(e) => props.onPresetIdChange(e.target.value)}>
          {props.bootstrap.generationPresets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={t("providerOverrideLabel")}>
        <NativeSelect
          value={props.selectedProfileId ?? ""}
          onChange={(e) => props.onProfileIdChange(e.target.value)}
        >
          {props.bootstrap.providerProfiles.filter((p) => p.enabled).map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </NativeSelect>
        {props.providerError && (
          <p className="mt-1 text-xs text-destructive">{props.providerError}</p>
        )}
      </Field>
      {customVars.length > 0 && (
        <div className="grid gap-3 rounded-lg border p-3">
          <span className="text-sm font-medium">{t("templateVariablesLabel")}</span>
          {customVars.map((varName) => (
            <Field key={varName} label={varName}>
              <Input
                value={props.customVarValues[varName] ?? ""}
                onChange={(e) => props.onCustomVarChange(varName, e.target.value)}
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
            value={props.controls.customInstruction ?? ""}
            onChange={(e) => props.onControlChange({ customInstruction: e.target.value })}
            placeholder={t("customInstructionPlaceholder")}
            className="min-h-16"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("toneLabel")}>
            <NativeSelect
              value={props.controls.tone ?? ""}
              onChange={(e) => props.onControlChange({ tone: (e.target.value || undefined) as ToneOption | undefined })}
            >
              <option value="">{t("controlDefault")}</option>
              {TONE_OPTIONS.map((tone) => (
                <option key={tone} value={tone}>{t(TONE_KEY[tone])}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("lengthLabel")}>
            <NativeSelect
              value={props.controls.lengthTarget ?? ""}
              onChange={(e) => props.onControlChange({ lengthTarget: (e.target.value || undefined) as LengthTarget | undefined })}
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
            value={props.controls.audience ?? ""}
            onChange={(e) => props.onControlChange({ audience: e.target.value })}
            placeholder={t("audiencePlaceholder")}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={props.outlineMode}
          onChange={(e) => props.onOutlineModeChange(e.target.checked)}
        />
        {tOutline("modeLabel")}
      </label>
      <Field label={tVariant("countLabel")}>
        <NativeSelect
          value={String(props.variantCount)}
          disabled={props.outlineMode}
          onChange={(e) => props.onVariantCountChange(Number(e.target.value))}
        >
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </NativeSelect>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Button disabled={props.isGenerating} onClick={props.onGenerate}>
          {props.isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {t("generateBtn")}
        </Button>
        <Button variant="outline" disabled={!props.isGenerating} onClick={props.onCancel}>
          <Square className="h-4 w-4" />
          {t("cancelBtn")}
        </Button>
      </div>
    </section>
  );
}

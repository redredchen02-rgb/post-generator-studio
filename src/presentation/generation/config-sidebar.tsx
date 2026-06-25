"use client";

import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { BootstrapData } from "@/presentation/lib/api";

type ConfigSidebarProps = {
  selectedProvider: BootstrapData["providerProfiles"][number] | undefined;
  selectedPreset: BootstrapData["generationPresets"][number] | undefined;
  selectedTemplate: BootstrapData["promptTemplates"][number] | undefined;
  metadata: { model?: string; inputTokens?: number; outputTokens?: number };
  promptPreview: { systemPrompt: string; userPrompt: string } | null;
  promptPreviewOpen: boolean;
  onPromptPreviewToggle: () => void;
};

function ConfigRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="grid gap-1 border-b pb-2 last:border-0">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <span className="break-words text-sm font-medium">{value}</span>
    </div>
  );
}

export function ConfigSidebar(props: ConfigSidebarProps): React.ReactElement {
  const t = useTranslations("Config");

  return (
    <aside className="app-surface grid h-fit gap-4 rounded-lg p-4 slide-up" style={{ animationDelay: "0.2s" }}>
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <ConfigRow label={t("providerLabel")} value={props.selectedProvider?.name || t("noneValue")} />
      <ConfigRow label={t("modelLabel")} value={props.selectedProvider?.model || t("noneValue")} />
      <ConfigRow label={t("temperatureLabel")} value={String(props.selectedPreset?.temperature ?? props.selectedProvider?.defaultTemperature ?? "-")} />
      <ConfigRow label={t("maxTokensLabel")} value={String(props.selectedPreset?.maxTokens ?? props.selectedProvider?.defaultMaxTokens ?? "-")} />
      <ConfigRow label={t("promptTemplateLabel")} value={props.selectedTemplate?.name || t("noneValue")} />
      <ConfigRow label={t("outputFormatLabel")} value={props.selectedPreset?.outputFormat || "markdown"} />
      <div className="grid gap-2">
        <span className="text-sm font-medium">{t("pipelineStepsLabel")}</span>
        <div className="flex flex-wrap gap-1">
          {(props.selectedPreset?.enabledPipelineSteps || []).map((step) => (
            <span key={step} className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
              {step}
            </span>
          ))}
        </div>
      </div>
      <div className="rounded-md bg-secondary p-3 text-sm text-secondary-foreground">
        {props.metadata.inputTokens !== undefined && props.metadata.outputTokens !== undefined ? (
          <>
            <div>{t("inputTokensLabel")}: {props.metadata.inputTokens.toLocaleString()} tok</div>
            <div>{t("outputTokensLabel")}: {props.metadata.outputTokens.toLocaleString()} tok</div>
            <div className="border-t pt-1 mt-1 font-medium">
              {(props.metadata.inputTokens + props.metadata.outputTokens).toLocaleString()} {t("totalLabel")}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              ~${((props.metadata.inputTokens * 3 + props.metadata.outputTokens * 15) / 1_000_000).toFixed(4)}
            </div>
          </>
        ) : props.metadata.outputTokens ? (
          t("outputTokensOnly", { count: props.metadata.outputTokens })
        ) : (
          t("tokenUsageEmpty")
        )}
      </div>
      <div className="border-t pt-3">
        <button
          type="button"
          className="flex w-full items-center justify-between text-sm font-medium"
          onClick={props.onPromptPreviewToggle}
        >
          {t("promptPreviewLabel")}
          {props.promptPreviewOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {props.promptPreviewOpen && (
          <div className="mt-3 grid gap-3">
            {props.promptPreview ? (
              <>
                <div className="grid gap-1">
                  <span className="text-xs uppercase text-muted-foreground">{t("systemLabel")}</span>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{props.promptPreview.systemPrompt}</pre>
                </div>
                <div className="grid gap-1">
                  <span className="text-xs uppercase text-muted-foreground">{t("userLabel")}</span>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{props.promptPreview.userPrompt}</pre>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">{t("loadingPreview")}</p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

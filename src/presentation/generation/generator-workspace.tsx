"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useUiStore } from "@/presentation/store/ui-store";
import { useProviderStore } from "@/presentation/store/provider-store";
import { useVarMemoryStore } from "@/presentation/store/var-memory-store";
import { useBootstrapStore } from "@/presentation/store/bootstrap-store";
import { useGenerationStream } from "./use-generation-stream";
import { useKeyboard } from "@/presentation/lib/use-keyboard";
import { useSearchParams } from "next/navigation";
import { testProviderProfile } from "@/presentation/lib/api";
import { computePromptPreview } from "@/presentation/lib/preview-prompt";
import { stripMarkdown } from "@/lib/utils";
import { InputPanel } from "./input-panel";
import { OutputPanel } from "./output-panel";
import { ConfigSidebar } from "./config-sidebar";

const sampleTitle = "台湾男子连续30天挑战AI创业";
const sampleSummary = "- 连续30天开发AI产品\n- 使用 Claude Code 与 OpenAI Agent\n- 每天公开开发日志\n- 获得大量关注";

export function GeneratorWorkspace(): React.ReactElement {
  const t = useTranslations("Generation");
  const searchParams = useSearchParams();
  const bootstrap = useBootstrapStore((s) => s.data);
  const bootstrapLoading = useBootstrapStore((s) => s.loading);
  const fetchBootstrap = useBootstrapStore((s) => s.fetchIfNeeded);

  const [title, setTitle] = React.useState(searchParams.get("title") || sampleTitle);
  const [eventSummary, setEventSummary] = React.useState(searchParams.get("summary") || sampleSummary);
  const [presetId, setPresetId] = React.useState("");
  const { selectedProfileId, setSelectedProfile } = useProviderStore();
  const [customVarValues, setCustomVarValues] = React.useState<Record<string, string>>({});
  const [providerError, setProviderError] = React.useState<string | null>(null);
  const [promptPreview, setPromptPreview] = React.useState<{ systemPrompt: string; userPrompt: string } | null>(null);
  const [promptPreviewOpen, setPromptPreviewOpen] = React.useState(false);
  const { rawMode, setRawMode, editorFontSize, setEditorFontSize } = useUiStore();
  const { content, status, error, activeGeneration, metadata, isGenerating, generate, cancel, setContent, setStatus } =
    useGenerationStream();

  const handleGenerateRef = React.useRef(handleGenerate);
  handleGenerateRef.current = handleGenerate;
  const cancelRef = React.useRef(cancel);
  cancelRef.current = cancel;

  const bindings = React.useMemo(
    () => [
      { key: "Enter", ctrl: true, handler: () => { if (!isGenerating) void handleGenerateRef.current(false); } },
      { key: "Escape", handler: () => { if (isGenerating) void cancelRef.current(); } },
    ],
    [isGenerating],
  );
  useKeyboard(bindings);

  // Initial bootstrap load
  React.useEffect(() => { void fetchBootstrap(); }, [fetchBootstrap]);

  // Set default preset once bootstrap is loaded
  React.useEffect(() => {
    if (!bootstrap) return;
    if (presetId) return;
    const defaultPreset = bootstrap.generationPresets.find((p) => p.isDefault) || bootstrap.generationPresets[0];
    if (defaultPreset) {
      setPresetId(defaultPreset.id);
      const storedId = useProviderStore.getState().selectedProfileId;
      const enabledProfiles = bootstrap.providerProfiles.filter((p) => p.enabled);
      if (!storedId || !enabledProfiles.some((p) => p.id === storedId)) {
        setSelectedProfile(defaultPreset.providerProfileId);
      }
    }
  }, [bootstrap, presetId, setSelectedProfile]);

  // SWR refresh on visibility change
  React.useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      void fetchBootstrap();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [fetchBootstrap]);

  const selectedPreset = bootstrap?.generationPresets.find((preset) => preset.id === presetId);
  const selectedProvider = bootstrap?.providerProfiles.find(
    (provider) => provider.id === (selectedProfileId ?? selectedPreset?.providerProfileId),
  );
  const selectedTemplate = bootstrap?.promptTemplates.find((template) => template.id === selectedPreset?.promptTemplateId);
  const templateId = selectedPreset?.promptTemplateId;
  const effectiveProviderId = selectedProfileId ?? selectedPreset?.providerProfileId;

  // Pre-fill custom var values per template
  React.useEffect(() => {
    if (!templateId) { setCustomVarValues({}); return; }
    const memory = useVarMemoryStore.getState().varMemory[templateId] ?? {};
    const defaults = selectedTemplate?.customVariableDefaults ?? {};
    setCustomVarValues({ ...defaults, ...memory });
  }, [templateId, selectedTemplate?.customVariableDefaults]);

  // Live prompt preview — client-side (no API call)
  React.useEffect(() => {
    if (!templateId || !selectedTemplate) { setPromptPreview(null); return; }
    const timer = setTimeout(() => {
      const result = computePromptPreview({
        template: selectedTemplate, title, eventSummary,
        locale: selectedPreset?.locale, customVariables: customVarValues,
      });
      setPromptPreview({ systemPrompt: result.systemPrompt, userPrompt: result.userPrompt });
    }, 400);
    return () => clearTimeout(timer);
  }, [title, eventSummary, templateId, selectedTemplate, selectedPreset?.locale, customVarValues]);

  async function handleGenerate(regenerate = false): Promise<void> {
    setProviderError(null);
    if (effectiveProviderId && bootstrap) {
      const profile = bootstrap.providerProfiles.find((p) => p.id === effectiveProviderId);
      if (!profile) { setProviderError(t("providerNotFound")); return; }
      if (!profile.enabled) { setProviderError(t("providerDisabled")); return; }
      try {
        const result = await testProviderProfile(effectiveProviderId);
        if (!result.ok) { setProviderError(result.message); return; }
      } catch (err) {
        setProviderError(err instanceof Error ? err.message : t("providerCheckFailed"));
        return;
      }
    }
    await generate({
      title, eventSummary, presetId,
      providerProfileId: effectiveProviderId ?? "", regenerate,
      customVariables: customVarValues,
      onSuccess: (vars) => {
        if (!templateId) return;
        for (const [k, v] of Object.entries(vars)) {
          useVarMemoryStore.getState().setVar(templateId, k, v);
        }
      },
    });
  }

  async function saveToHistory(): Promise<void> {
    if (!activeGeneration) return;
    try {
      const { saveGenerationContent: save } = await import("@/presentation/lib/api");
      await save(activeGeneration.id, content);
      setStatus(t("savedToHistory"));
    } catch { setStatus(t("saveFailed")); }
  }

  async function copyMarkdown(): Promise<void> {
    await navigator.clipboard.writeText(content);
    setStatus(t("markdownCopied"));
  }

  async function copyPlainText(): Promise<void> {
    await navigator.clipboard.writeText(stripMarkdown(content));
    setStatus(t("plainTextCopied"));
  }

  function exportLocal(format: "md" | "txt"): void {
    const body = format === "txt" ? stripMarkdown(content) : content;
    const blob = new Blob([body], { type: format === "md" ? "text/markdown" : "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    link.download = `${title || "generation"}_${ts}.${format}`;
    link.click();
    URL.revokeObjectURL(link.href);
    setStatus(t("exported", { format }));
  }

  if (bootstrapLoading && !bootstrap) {
    return (
      <main className="mx-auto flex max-w-[1680px] items-center justify-center px-4 py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!bootstrap) {
    return (
      <main className="mx-auto flex max-w-[1680px] items-center justify-center px-4 py-16 text-muted-foreground">
        {t("failedToLoad")}
      </main>
    );
  }

  return (
    <main className="mx-auto grid max-w-[1680px] gap-4 px-4 py-4 lg:grid-cols-[320px_minmax(0,1fr)_320px]">
      <InputPanel
        bootstrap={bootstrap}
        title={title}
        eventSummary={eventSummary}
        presetId={presetId}
        selectedProfileId={selectedProfileId}
        customVarValues={customVarValues}
        providerError={providerError}
        isGenerating={isGenerating}
        selectedTemplate={selectedTemplate}
        selectedPreset={selectedPreset}
        onTitleChange={setTitle}
        onEventSummaryChange={setEventSummary}
        onPresetIdChange={setPresetId}
        onProfileIdChange={setSelectedProfile}
        onCustomVarChange={(varName, value) =>
          setCustomVarValues((prev) => ({ ...prev, [varName]: value }))
        }
        onGenerate={() => void handleGenerate(false)}
        onCancel={() => void cancel()}
      />
      <OutputPanel
        content={content}
        status={status}
        error={error}
        rawMode={rawMode}
        editorFontSize={editorFontSize}
        isGenerating={isGenerating}
        activeGeneration={activeGeneration}
        onRawModeChange={setRawMode}
        onContentChange={setContent}
        onCopyMarkdown={copyMarkdown}
        onCopyPlainText={copyPlainText}
        onExportMd={() => exportLocal("md")}
        onExportTxt={() => exportLocal("txt")}
        onSave={saveToHistory}
        onRegenerate={() => void handleGenerate(true)}
        onFontSizeChange={setEditorFontSize}
      />
      <ConfigSidebar
        selectedProvider={selectedProvider}
        selectedPreset={selectedPreset}
        selectedTemplate={selectedTemplate}
        metadata={metadata}
        promptPreview={promptPreview}
        promptPreviewOpen={promptPreviewOpen}
        onPromptPreviewToggle={() => setPromptPreviewOpen((v) => !v)}
      />
    </main>
  );
}

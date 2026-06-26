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
import type { GenerationControls } from "@/domain/schemas";
import { InputPanel } from "./input-panel";
import { OutputPanel } from "./output-panel";
import { OutlinePanel } from "./outline-panel";
import { ConfigSidebar } from "./config-sidebar";
import { requestCompletion } from "@/presentation/lib/api";
import { buildOutlinePrompt, parseOutline, serializeOutline } from "./editor/rewrite-actions";

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
  const [controls, setControls] = React.useState<GenerationControls>({});
  const [outlineMode, setOutlineMode] = React.useState(false);
  const [outline, setOutline] = React.useState<string[] | null>(null);
  const [outlineBusy, setOutlineBusy] = React.useState(false);
  const [providerError, setProviderError] = React.useState<string | null>(null);
  const [promptPreview, setPromptPreview] = React.useState<{ systemPrompt: string; userPrompt: string } | null>(null);
  const [promptPreviewOpen, setPromptPreviewOpen] = React.useState(false);
  const { rawMode, setRawMode, editorFontSize, setEditorFontSize } = useUiStore();
  const { content, status, error, activeGeneration, metadata, isGenerating, generate, cancel, setContent, setStatus } =
    useGenerationStream();

  const handleGenerateRef = React.useRef(onPrimaryGenerate);
  handleGenerateRef.current = onPrimaryGenerate;
  const cancelRef = React.useRef(cancel);
  cancelRef.current = cancel;

  const bindings = React.useMemo(
    () => [
      { key: "Enter", ctrl: true, handler: () => { if (!isGenerating && !outlineBusy) handleGenerateRef.current(); } },
      { key: "Escape", handler: () => { if (isGenerating) void cancelRef.current(); } },
    ],
    [isGenerating, outlineBusy],
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
        locale: selectedPreset?.locale, customVariables: customVarValues, controls,
      });
      setPromptPreview({ systemPrompt: result.systemPrompt, userPrompt: result.userPrompt });
    }, 400);
    return () => clearTimeout(timer);
  }, [title, eventSummary, templateId, selectedTemplate, selectedPreset?.locale, customVarValues, controls]);

  async function ensureProviderOk(): Promise<boolean> {
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
  }

  async function handleGenerate(regenerate = false, outlineConstraint?: string): Promise<void> {
    if (!(await ensureProviderOk())) return;
    await generate({
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
  }

  // Step 1 of outline-first: produce an editable outline via one-shot completion.
  async function generateOutline(): Promise<void> {
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
  }

  // Step 2: inject the confirmed outline as a constraint and stream the full article.
  function expandOutline(): void {
    const constraint = serializeOutline(outline ?? []);
    if (!constraint) return;
    setOutline(null);
    void handleGenerate(false, constraint);
  }

  function onPrimaryGenerate(): void {
    if (outlineMode) void generateOutline();
    else void handleGenerate(false);
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
        controls={controls}
        providerError={providerError}
        isGenerating={isGenerating || outlineBusy}
        selectedTemplate={selectedTemplate}
        selectedPreset={selectedPreset}
        onTitleChange={setTitle}
        onEventSummaryChange={setEventSummary}
        onPresetIdChange={setPresetId}
        onProfileIdChange={setSelectedProfile}
        onCustomVarChange={(varName, value) =>
          setCustomVarValues((prev) => ({ ...prev, [varName]: value }))
        }
        onControlChange={(patch) => setControls((prev) => ({ ...prev, ...patch }))}
        outlineMode={outlineMode}
        onOutlineModeChange={setOutlineMode}
        onGenerate={onPrimaryGenerate}
        onCancel={() => void cancel()}
      />
      {outline !== null ? (
        <OutlinePanel
          items={outline}
          busy={outlineBusy}
          onChangeItem={(i, v) => setOutline((prev) => (prev ?? []).map((it, idx) => (idx === i ? v : it)))}
          onAddItem={() => setOutline((prev) => [...(prev ?? []), ""])}
          onRemoveItem={(i) => setOutline((prev) => (prev ?? []).filter((_, idx) => idx !== i))}
          onMoveItem={(i, dir) =>
            setOutline((prev) => {
              if (!prev) return prev;
              const next = [...prev];
              const j = i + dir;
              if (j < 0 || j >= next.length) return prev;
              [next[i], next[j]] = [next[j], next[i]];
              return next;
            })
          }
          onRegenerate={() => void generateOutline()}
          onExpand={expandOutline}
          onCancel={() => setOutline(null)}
        />
      ) : (
        <OutputPanel
          content={content}
          status={status}
          error={error}
          rawMode={rawMode}
          editorFontSize={editorFontSize}
          isGenerating={isGenerating}
          activeGeneration={activeGeneration}
          title={title}
          presetId={presetId}
          providerProfileId={effectiveProviderId}
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
      )}
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

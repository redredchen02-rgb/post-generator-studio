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
import { scoreGeneration, testProviderProfile } from "@/presentation/lib/api";
import { computePromptPreview } from "@/presentation/lib/preview-prompt";
import { stripMarkdown } from "@/lib/utils";
import type { GenerationControls, QualityScore } from "@/domain/schemas";
import { InputPanel } from "./input-panel";
import { OutputPanel } from "./output-panel";
import { OutlinePanel } from "./outline-panel";
import { VariantCompare } from "./variant-compare";
import { useVariantGeneration } from "./use-variant-generation";
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
  const [variantCount, setVariantCount] = React.useState(1);
  const [qualityScore, setQualityScore] = React.useState<QualityScore | null>(null);
  const [scoring, setScoring] = React.useState(false);
  const [providerError, setProviderError] = React.useState<string | null>(null);
  const [promptPreview, setPromptPreview] = React.useState<{ systemPrompt: string; userPrompt: string } | null>(null);
  const [promptPreviewOpen, setPromptPreviewOpen] = React.useState(false);
  const { rawMode, setRawMode, editorFontSize, setEditorFontSize } = useUiStore();
  const { content, status, error, activeGeneration, metadata, isGenerating, generate, cancel, setContent, setStatus, setActiveGeneration } =
    useGenerationStream();
  const {
    variants,
    isGenerating: variantsBusy,
    generateVariants,
    cancel: cancelVariants,
    setVariantContent,
    reset: resetVariants,
  } = useVariantGeneration();

  // Tracks the currently-active generation id so async handlers can detect a
  // generation switch that happened while their request was in flight.
  const activeGenIdRef = React.useRef<string | undefined>(activeGeneration?.id);
  activeGenIdRef.current = activeGeneration?.id;

  const handleGenerateRef = React.useRef(onPrimaryGenerate);
  handleGenerateRef.current = onPrimaryGenerate;
  const cancelRef = React.useRef(cancelActive);
  cancelRef.current = cancelActive;

  const busy = isGenerating || outlineBusy || variantsBusy;
  const bindings = React.useMemo(
    () => [
      { key: "Enter", ctrl: true, handler: () => { if (!busy) handleGenerateRef.current(); } },
      { key: "Escape", handler: () => { if (busy) cancelRef.current(); } },
    ],
    [busy],
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

  // Multi-variant: run N independent generations and show them side by side (Unit 10).
  async function handleGenerateVariants(): Promise<void> {
    if (!presetId || !(await ensureProviderOk())) return;
    await generateVariants(
      { title, eventSummary, presetId, providerProfileId: effectiveProviderId, customVariables: customVarValues, controls },
      variantCount,
    );
  }

  // Pull a chosen variant into the main editor, then leave compare mode.
  function selectVariant(index: number): void {
    const variant = variants[index];
    if (!variant?.generation) return;
    setActiveGeneration(variant.generation, variant.content);
    resetVariants();
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
    else if (variantCount > 1) void handleGenerateVariants();
    else void handleGenerate(false);
  }

  function cancelActive(): void {
    if (variantsBusy) void cancelVariants();
    else void cancel();
  }

  async function saveToHistory(): Promise<void> {
    if (!activeGeneration) return;
    try {
      const { saveGenerationContent: save } = await import("@/presentation/lib/api");
      await save(activeGeneration.id, content);
      // Editing the content invalidates any prior score — it described the old text.
      setQualityScore(null);
      setStatus(t("savedToHistory"));
    } catch { setStatus(t("saveFailed")); }
  }

  // Reset the badge when the active generation changes; reflect an already-scored one.
  React.useEffect(() => {
    setQualityScore(activeGeneration?.qualityScore ?? null);
  }, [activeGeneration?.id, activeGeneration?.qualityScore]);

  async function handleScore(): Promise<void> {
    if (!activeGeneration || !content.trim() || scoring) return;
    const genId = activeGeneration.id;
    setScoring(true);
    try {
      const score = await scoreGeneration(genId, { presetId, providerProfileId: effectiveProviderId });
      // Ignore a result that landed after the user switched to another generation.
      if (activeGenIdRef.current === genId) setQualityScore(score);
    } catch {
      if (activeGenIdRef.current === genId) setStatus(t("scoreFailed"));
    } finally {
      setScoring(false);
    }
  }

  async function copyMarkdown(): Promise<void> {
    try {
      await navigator.clipboard.writeText(content);
      setStatus(t("markdownCopied"));
    } catch {
      setStatus(t("copyFailed"));
    }
  }

  async function copyPlainText(): Promise<void> {
    try {
      await navigator.clipboard.writeText(stripMarkdown(content));
      setStatus(t("plainTextCopied"));
    } catch {
      setStatus(t("copyFailed"));
    }
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
    setTimeout(() => URL.revokeObjectURL(link.href), 100);
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
        isGenerating={busy}
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
        variantCount={variantCount}
        onVariantCountChange={setVariantCount}
        onGenerate={onPrimaryGenerate}
        onCancel={cancelActive}
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
      ) : variants.length > 0 ? (
        <VariantCompare
          variants={variants}
          busy={variantsBusy}
          onEditVariant={setVariantContent}
          onSelect={selectVariant}
          onCancel={() => void cancelVariants()}
          onDiscard={resetVariants}
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
          qualityScore={qualityScore}
          scoring={scoring}
          onScore={() => void handleScore()}
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

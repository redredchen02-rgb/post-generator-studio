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
import { computePromptPreview } from "@/presentation/lib/preview-prompt";
import type { GenerationControls } from "@/domain/schemas";
import { InputPanel } from "./input-panel";
import { OutputPanel } from "./output-panel";
import { OutlinePanel } from "./outline-panel";
import { VariantCompare } from "./variant-compare";
import { useVariantGeneration } from "./use-variant-generation";
import { DraftSwitcher } from "./draft-switcher";
import { VersionCompare } from "./version-compare";
import { useDraftVersions } from "./use-draft-versions";
import { useRestoreFromHistory } from "./use-restore-from-history";
import { ConfigSidebar } from "./config-sidebar";
import { useScoring } from "./use-scoring";
import { useLocalScore } from "./use-local-score";
import { useHotspot } from "./use-hotspot";
import { useExportActions } from "./use-export-actions";
import { useGeneratorController } from "./use-generator-controller";
import { TopicPanel } from "@/presentation/hotspot/topic-panel";

const sampleTitle = "台湾男子连续30天挑战AI创业";
const sampleSummary = "- 连续30天开发AI产品\n- 使用 Claude Code 与 OpenAI Agent\n- 每天公开开发日志\n- 获得大量关注";

export function GeneratorWorkspace(): React.ReactElement {
  const t = useTranslations("Generation");
  const tVersions = useTranslations("Versions");
  const searchParams = useSearchParams();
  const bootstrap = useBootstrapStore((s) => s.data);
  const bootstrapLoading = useBootstrapStore((s) => s.loading);
  const bootstrapError = useBootstrapStore((s) => s.error);
  const fetchBootstrap = useBootstrapStore((s) => s.fetchIfNeeded);
  const refetchBootstrap = useBootstrapStore((s) => s.refetch);

  const [title, setTitle] = React.useState(searchParams.get("title") || sampleTitle);
  const [eventSummary, setEventSummary] = React.useState(searchParams.get("summary") || sampleSummary);
  const [presetId, setPresetId] = React.useState("");
  const { selectedProfileId, setSelectedProfile } = useProviderStore();
  const [customVarValues, setCustomVarValues] = React.useState<Record<string, string>>({});
  const [controls, setControls] = React.useState<GenerationControls>({});
  const [outlineMode, setOutlineMode] = React.useState(false);
  const [outline, setOutline] = React.useState<string[] | null>(null);
  const [variantCount, setVariantCount] = React.useState(1);
  const [promptPreview, setPromptPreview] = React.useState<{ systemPrompt: string; userPrompt: string } | null>(null);
  const [promptPreviewOpen, setPromptPreviewOpen] = React.useState(false);
  const { rawMode, setRawMode, editorFontSize, setEditorFontSize } = useUiStore();
  const { content, status, error, errorDetail, activeGeneration, metadata, isGenerating, generate, cancel, setContent, setStatus, setActiveGeneration } =
    useGenerationStream();
  const {
    variants,
    isGenerating: variantsBusy,
    generateVariants,
    cancel: cancelVariants,
    setVariantContent,
    reset: resetVariants,
  } = useVariantGeneration();
  const {
    versions,
    saving: draftSaving,
    saved: draftSaved,
    compareId,
    compareVersion,
    saveVersion,
    restore: restoreVersion,
    toggleCompare,
  } = useDraftVersions({
    generationId: activeGeneration?.id,
    content,
    isGenerating,
    onRestoreContent: setContent,
  });

  // Restore-from-History: arriving with ?generationId= loads that generation and
  // its active draft so the user can keep editing where they left off (Unit 12).
  useRestoreFromHistory({
    generationId: searchParams.get("generationId"),
    onRestore: ({ generation, content: restored, presetId: restoredPresetId }) => {
      setTitle(generation.title);
      setEventSummary(generation.eventSummary);
      if (restoredPresetId) setPresetId(restoredPresetId);
      setActiveGeneration(generation, restored);
    },
    onError: () => setStatus(t("restoreFailed")),
  });

  // Derived selections from bootstrap + the current preset/provider choice.
  const selectedPreset = bootstrap?.generationPresets.find((preset) => preset.id === presetId);
  const selectedProvider = bootstrap?.providerProfiles.find(
    (provider) => provider.id === (selectedProfileId ?? selectedPreset?.providerProfileId),
  );
  const selectedTemplate = bootstrap?.promptTemplates.find((template) => template.id === selectedPreset?.promptTemplateId);
  const templateId = selectedPreset?.promptTemplateId;
  const effectiveProviderId = selectedProfileId ?? selectedPreset?.providerProfileId;

  // Concern hooks: quality scoring (state + race guard), content actions, and the
  // generate / variant / outline orchestration. The component stays composition + layout.
  const { qualityScore, scoring, score, clearScore } = useScoring({
    activeGeneration, content, presetId, providerProfileId: effectiveProviderId, setStatus,
  });
  const { localScore, localScoring, localScoreError, scoreLocal, clearLocalScore } = useLocalScore({
    activeGeneration, content,
  });
  const { copyMarkdown, copyPlainText, exportLocal, saveToHistory } = useExportActions({
    content, title, activeGeneration, setStatus,
    // Editing + saving invalidates both the LLM-judge score and the local copy score.
    onSaved: () => { clearScore(); clearLocalScore(); },
  });
  const { hotspotAvailable, probeHotspot, handleSeedTopic } = useHotspot({
    title,
    sampleTitle,
    onSeed: (seedTitle, seedSummary) => { setTitle(seedTitle); setEventSummary(seedSummary); },
  });
  const controller = useGeneratorController({
    bootstrap, title, eventSummary, presetId, effectiveProviderId, templateId,
    controls, customVarValues, variantCount, outlineMode, outline, setOutline,
    stream: { generate, cancel, setActiveGeneration },
    variant: { generateVariants, cancel: cancelVariants, variants, reset: resetVariants, busy: variantsBusy },
  });

  // Keyboard: Ctrl+Enter generates, Escape cancels. Refs hold the latest handlers so
  // the binding list only rebuilds when `busy` changes.
  const handleGenerateRef = React.useRef(controller.onPrimaryGenerate);
  handleGenerateRef.current = controller.onPrimaryGenerate;
  const cancelRef = React.useRef(controller.cancelActive);
  cancelRef.current = controller.cancelActive;

  const busy = isGenerating || controller.outlineBusy || variantsBusy;
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
      const storedId = selectedProfileId;
      const enabledProfiles = bootstrap.providerProfiles.filter((p) => p.enabled);
      if (!storedId || !enabledProfiles.some((p) => p.id === storedId)) {
        setSelectedProfile(defaultPreset.providerProfileId);
      }
    }
  }, [bootstrap, presetId, selectedProfileId, setSelectedProfile]);

  // SWR refresh on visibility change
  React.useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      void fetchBootstrap();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [fetchBootstrap]);

  // Pre-fill custom var values per template
  React.useEffect(() => {
    if (!templateId) { setCustomVarValues({}); return; }
    // Intentional one-shot read: initialise custom vars once when the template
    // changes. A reactive selector would re-run this effect after every
    // generation (setVar writes varMemory), overwriting in-progress input.
    const memory = useVarMemoryStore.getState().varMemory[templateId] ?? {};
    const defaults = selectedTemplate?.customVariableDefaults ?? {};
    setCustomVarValues({ ...defaults, ...memory });
  }, [templateId, selectedTemplate?.customVariableDefaults]);

  // Grouped, memoized InputPanel props — keeps the panel's React.memo effective so it
  // doesn't re-render on every streamed token (content changes, these don't).
  const onCustomVarChange = React.useCallback(
    (varName: string, value: string) => setCustomVarValues((prev) => ({ ...prev, [varName]: value })),
    [],
  );
  const onControlChange = React.useCallback(
    (patch: Partial<GenerationControls>) => setControls((prev) => ({ ...prev, ...patch })),
    [],
  );
  const inputForm = React.useMemo(
    () => ({
      title, eventSummary, presetId, selectedProfileId, customVarValues, controls,
      providerError: controller.providerError, isGenerating: busy,
      selectedTemplate, selectedPreset, outlineMode, variantCount,
    }),
    [title, eventSummary, presetId, selectedProfileId, customVarValues, controls,
      controller.providerError, busy, selectedTemplate, selectedPreset, outlineMode, variantCount],
  );
  const inputHandlers = React.useMemo(
    () => ({
      onTitleChange: setTitle,
      onEventSummaryChange: setEventSummary,
      onPresetIdChange: setPresetId,
      onProfileIdChange: setSelectedProfile,
      onCustomVarChange,
      onControlChange,
      onOutlineModeChange: setOutlineMode,
      onVariantCountChange: setVariantCount,
      onGenerate: controller.onPrimaryGenerate,
      onCancel: controller.cancelActive,
    }),
    [setSelectedProfile, onCustomVarChange, onControlChange, controller.onPrimaryGenerate, controller.cancelActive],
  );

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

  // Show spinner: actively loading, OR first render (not yet started — loading=false, error=null, data=null)
  if (bootstrapLoading || (!bootstrap && !bootstrapError)) {
    return (
      <main className="mx-auto flex max-w-[1680px] items-center justify-center px-4 py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!bootstrap) {
    return (
      <main className="mx-auto flex max-w-[1680px] items-center justify-center px-4 py-16">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <p>{t("failedToLoad")}</p>
          {bootstrapError && <p className="text-sm text-destructive">{bootstrapError}</p>}
          <button
            onClick={() => void refetchBootstrap()}
            className="mt-1 rounded-md border px-4 py-1.5 text-sm hover:bg-accent"
          >
            {t("retry")}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto grid max-w-[1680px] gap-4 px-4 py-4 lg:grid-cols-[320px_minmax(0,1fr)_320px]">
      <InputPanel bootstrap={bootstrap} form={inputForm} handlers={inputHandlers} />
      {outline !== null ? (
        <OutlinePanel
          items={outline}
          busy={controller.outlineBusy}
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
          onRegenerate={() => void controller.generateOutline()}
          onExpand={controller.expandOutline}
          onCancel={() => setOutline(null)}
        />
      ) : variants.length > 0 ? (
        <VariantCompare
          variants={variants}
          busy={variantsBusy}
          onEditVariant={setVariantContent}
          onSelect={controller.selectVariant}
          onCancel={() => void cancelVariants()}
          onDiscard={resetVariants}
        />
      ) : compareVersion ? (
        <VersionCompare
          left={compareVersion.content}
          leftLabel={compareVersion.label || tVersions("versionN", { n: versions.indexOf(compareVersion) + 1 })}
          right={content}
          rightLabel={tVersions("current")}
          onClose={() => toggleCompare(compareVersion.id)}
        />
      ) : (
        <div className="grid content-start gap-3">
          <TopicPanel available={hotspotAvailable} onRetry={probeHotspot} onSeed={handleSeedTopic} />
          {activeGeneration ? (
            <DraftSwitcher
              versions={versions}
              saving={draftSaving}
              saved={draftSaved}
              busy={isGenerating}
              compareId={compareId}
              onSaveVersion={() => void saveVersion()}
              onRestore={(draftId) => void restoreVersion(draftId)}
              onToggleCompare={toggleCompare}
            />
          ) : null}
          <OutputPanel
          content={content}
          status={status}
          error={error}
          errorDetail={errorDetail}
          rawMode={rawMode}
          editorFontSize={editorFontSize}
          isGenerating={isGenerating}
          activeGeneration={activeGeneration}
          title={title}
          presetId={presetId}
          providerProfileId={effectiveProviderId}
          qualityScore={qualityScore}
          scoring={scoring}
          onScore={() => void score()}
          localScore={localScore}
          localScoring={localScoring}
          localScoreError={localScoreError}
          onLocalScore={() => void scoreLocal()}
          onRawModeChange={setRawMode}
          onContentChange={setContent}
          onCopyMarkdown={copyMarkdown}
          onCopyPlainText={copyPlainText}
          onExportMd={() => exportLocal("md")}
          onExportTxt={() => exportLocal("txt")}
          onSave={saveToHistory}
          onRegenerate={() => void controller.handleGenerate(true)}
          onFontSizeChange={setEditorFontSize}
          />
        </div>
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

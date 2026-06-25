"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import {
  ChevronDown,
  ChevronRight,
  Clipboard,
  Download,
  FileText,
  Loader2,
  Play,
  RotateCcw,
  Save,
  Square,
} from "lucide-react";
import { Button } from "@/presentation/components/ui/button";
import { Field } from "@/presentation/components/ui/field";
import { Input } from "@/presentation/components/ui/input";
import { NativeSelect } from "@/presentation/components/ui/native-select";
import { Textarea } from "@/presentation/components/ui/textarea";
import {
  fetchPromptPreview,
  loadBootstrap,
  saveGenerationContent,
  testProviderProfile,
  type BootstrapData,
} from "@/presentation/lib/api";
import { useUiStore } from "@/presentation/store/ui-store";
import { stripMarkdown } from "@/lib/utils";
import { extractTemplateVariables } from "@/application/prompt/renderer";
import { useGenerationStream } from "./use-generation-stream";

const STANDARD_VARS = new Set(["TITLE", "EVENT_SUMMARY", "DATE", "TIME", "LOCALE"]);

const sampleTitle = "台湾男子连续30天挑战AI创业";
const sampleSummary = "- 连续30天开发AI产品\n- 使用 Claude Code 与 OpenAI Agent\n- 每天公开开发日志\n- 获得大量关注";

function getCustomVars(template: { systemPrompt: string; userPromptTemplate: string } | undefined): string[] {
  if (!template) return [];
  const all = [
    ...extractTemplateVariables(template.systemPrompt),
    ...extractTemplateVariables(template.userPromptTemplate),
  ];
  return [...new Set(all)].filter((v) => !STANDARD_VARS.has(v));
}

export function GeneratorWorkspace(): React.ReactElement {
  const [bootstrap, setBootstrap] = React.useState<BootstrapData | null>(null);
  const [title, setTitle] = React.useState(sampleTitle);
  const [eventSummary, setEventSummary] = React.useState(sampleSummary);
  const [presetId, setPresetId] = React.useState("");
  const [providerProfileId, setProviderProfileId] = React.useState("");
  const [customVarValues, setCustomVarValues] = React.useState<Record<string, string>>({});
  const [providerError, setProviderError] = React.useState<string | null>(null);
  const [promptPreview, setPromptPreview] = React.useState<{ systemPrompt: string; userPrompt: string } | null>(null);
  const [promptPreviewOpen, setPromptPreviewOpen] = React.useState(false);
  const { rawMode, setRawMode, editorFontSize, setEditorFontSize } = useUiStore();
  const { content, status, error, activeGeneration, metadata, isGenerating, generate, cancel, setContent, setStatus } =
    useGenerationStream();

  React.useEffect(() => {
    loadBootstrap()
      .then((data) => {
        setBootstrap(data);
        const defaultPreset = data.generationPresets.find((preset) => preset.isDefault) || data.generationPresets[0];
        if (defaultPreset) {
          setPresetId(defaultPreset.id);
          setProviderProfileId(defaultPreset.providerProfileId);
        }
      })
      .catch((loadError: unknown) => {
        setStatus(loadError instanceof Error ? loadError.message : "Failed to load app data");
      });
  }, [setStatus]);

  const selectedPreset = bootstrap?.generationPresets.find((preset) => preset.id === presetId);
  const selectedProvider = bootstrap?.providerProfiles.find(
    (provider) => provider.id === (providerProfileId || selectedPreset?.providerProfileId),
  );
  const selectedTemplate = bootstrap?.promptTemplates.find((template) => template.id === selectedPreset?.promptTemplateId);
  const templateId = selectedPreset?.promptTemplateId;
  const customVars = getCustomVars(selectedTemplate);

  // Provider pre-flight check
  const effectiveProviderId = providerProfileId || selectedPreset?.providerProfileId;
  React.useEffect(() => {
    if (!effectiveProviderId) return;
    setProviderError(null);
    testProviderProfile(effectiveProviderId)
      .then((result) => {
        if (!result.ok) setProviderError(result.message);
      })
      .catch(() => null);
  }, [effectiveProviderId]);

  // Reset custom var values when template changes
  React.useEffect(() => {
    setCustomVarValues({});
  }, [templateId]);

  // Live prompt preview (debounced)
  React.useEffect(() => {
    if (!templateId) return;
    const timer = setTimeout(() => {
      fetchPromptPreview({ templateId, title, eventSummary, customVariables: customVarValues })
        .then(setPromptPreview)
        .catch(() => null);
    }, 400);
    return () => clearTimeout(timer);
  }, [title, eventSummary, templateId, customVarValues]);

  async function handleGenerate(regenerate = false): Promise<void> {
    await generate({ title, eventSummary, presetId, providerProfileId, regenerate, customVariables: customVarValues });
  }

  async function saveToHistory(): Promise<void> {
    if (!activeGeneration) return;
    try {
      await saveGenerationContent(activeGeneration.id, content);
      setStatus("Saved to history");
    } catch {
      setStatus("Save failed");
    }
  }

  async function copyMarkdown(): Promise<void> {
    await navigator.clipboard.writeText(content);
    setStatus("Markdown copied");
  }

  async function copyPlainText(): Promise<void> {
    await navigator.clipboard.writeText(stripMarkdown(content));
    setStatus("Plain text copied");
  }

  function exportLocal(format: "md" | "txt"): void {
    const body = format === "txt" ? stripMarkdown(content) : content;
    const blob = new Blob([body], { type: format === "md" ? "text/markdown" : "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${title || "generation"}.${format}`;
    link.click();
    URL.revokeObjectURL(link.href);
    setStatus(`Exported .${format}`);
  }

  return (
    <main className="mx-auto grid max-w-[1680px] gap-4 px-4 py-4 lg:grid-cols-[320px_minmax(0,1fr)_320px]">
      <section className="app-surface grid h-fit gap-4 rounded-lg p-4">
        <div>
          <h1 className="text-lg font-semibold">Generate</h1>
          <p className="text-sm text-muted-foreground">输入主题，选择 Preset，然后开始流式生成。</p>
        </div>
        <Field label="Title">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="Event Summary">
          <Textarea
            value={eventSummary}
            onChange={(event) => setEventSummary(event.target.value)}
            className="min-h-48"
          />
        </Field>
        <Field label="Preset Selector">
          <NativeSelect value={presetId} onChange={(event) => setPresetId(event.target.value)}>
            {bootstrap?.generationPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Provider Override">
          <NativeSelect value={providerProfileId} onChange={(event) => setProviderProfileId(event.target.value)}>
            {bootstrap?.providerProfiles.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name} {provider.enabled ? "" : "(disabled)"}
              </option>
            ))}
          </NativeSelect>
          {providerError && (
            <p className="mt-1 text-xs text-destructive">{providerError}</p>
          )}
        </Field>
        {customVars.length > 0 && (
          <div className="grid gap-3 rounded-lg border p-3">
            <span className="text-sm font-medium">Template Variables</span>
            {customVars.map((varName) => (
              <Field key={varName} label={varName}>
                <Input
                  value={customVarValues[varName] ?? ""}
                  onChange={(event) =>
                    setCustomVarValues((prev) => ({ ...prev, [varName]: event.target.value }))
                  }
                  placeholder={`Value for {{${varName}}}`}
                />
              </Field>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={isGenerating} onClick={() => void handleGenerate(false)}>
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Generate
          </Button>
          <Button variant="outline" disabled={!isGenerating} onClick={() => void cancel()}>
            <Square className="h-4 w-4" />
            Cancel
          </Button>
        </div>
      </section>

      <section className="app-surface grid min-h-[calc(100vh-6.5rem)] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3 rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Output</h2>
            <p className="text-sm text-muted-foreground">{status}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={rawMode ? "default" : "outline"} size="sm" onClick={() => setRawMode(true)}>
              <FileText className="h-4 w-4" />
              Raw
            </Button>
            <Button variant={!rawMode ? "default" : "outline"} size="sm" onClick={() => setRawMode(false)}>
              <FileText className="h-4 w-4" />
              Preview
            </Button>
          </div>
        </div>
        {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">{error}</div> : null}
        <div className="min-h-0 overflow-hidden rounded-md border bg-background">
          {rawMode ? (
            <Textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Streaming content will appear here..."
              className="h-full min-h-[540px] resize-none border-0 font-mono shadow-none focus-visible:ring-0"
              style={{ fontSize: editorFontSize }}
            />
          ) : (
            <article className="prose prose-neutral max-w-none overflow-auto p-4 dark:prose-invert">
              <ReactMarkdown>{content || "Streaming content will appear here..."}</ReactMarkdown>
            </article>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Font</span>
            <input
              aria-label="Editor font size"
              type="range"
              min="13"
              max="20"
              value={editorFontSize}
              onChange={(event) => setEditorFontSize(Number(event.target.value))}
            />
            <span>{editorFontSize}px</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={!content} onClick={() => void copyMarkdown()}>
              <Clipboard className="h-4 w-4" />
              Copy Markdown
            </Button>
            <Button variant="outline" size="sm" disabled={!content} onClick={() => void copyPlainText()}>
              <Clipboard className="h-4 w-4" />
              Copy Plain Text
            </Button>
            <Button variant="outline" size="sm" disabled={!content} onClick={() => exportLocal("md")}>
              <Download className="h-4 w-4" />
              .md
            </Button>
            <Button variant="outline" size="sm" disabled={!content} onClick={() => exportLocal("txt")}>
              <Download className="h-4 w-4" />
              .txt
            </Button>
            <Button variant="outline" size="sm" disabled={!activeGeneration} onClick={() => void saveToHistory()}>
              <Save className="h-4 w-4" />
              Save
            </Button>
            <Button variant="secondary" size="sm" disabled={isGenerating} onClick={() => void handleGenerate(true)}>
              <RotateCcw className="h-4 w-4" />
              Regenerate
            </Button>
          </div>
        </div>
      </section>

      <aside className="app-surface grid h-fit gap-4 rounded-lg p-4">
        <div>
          <h2 className="text-lg font-semibold">Current Config</h2>
          <p className="text-sm text-muted-foreground">常用配置可在这里快速确认。</p>
        </div>
        <ConfigRow label="Provider" value={selectedProvider?.name || "None"} />
        <ConfigRow label="Model" value={selectedProvider?.model || "None"} />
        <ConfigRow label="Temperature" value={String(selectedPreset?.temperature ?? selectedProvider?.defaultTemperature ?? "-")} />
        <ConfigRow label="Max Tokens" value={String(selectedPreset?.maxTokens ?? selectedProvider?.defaultMaxTokens ?? "-")} />
        <ConfigRow label="Prompt Template" value={selectedTemplate?.name || "None"} />
        <ConfigRow label="Output Format" value={selectedPreset?.outputFormat || "markdown"} />
        <div className="grid gap-2">
          <span className="text-sm font-medium">Pipeline Steps</span>
          <div className="flex flex-wrap gap-1">
            {(selectedPreset?.enabledPipelineSteps || []).map((step) => (
              <span key={step} className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                {step}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-md bg-secondary p-3 text-sm text-secondary-foreground">
          {metadata.outputTokens ? `${metadata.outputTokens} output tokens` : "Token usage appears when providers report it."}
        </div>
        <div className="border-t pt-3">
          <button
            type="button"
            className="flex w-full items-center justify-between text-sm font-medium"
            onClick={() => setPromptPreviewOpen((v) => !v)}
          >
            Prompt Preview
            {promptPreviewOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {promptPreviewOpen && (
            <div className="mt-3 grid gap-3">
              {promptPreview ? (
                <>
                  <div className="grid gap-1">
                    <span className="text-xs uppercase text-muted-foreground">System</span>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{promptPreview.systemPrompt}</pre>
                  </div>
                  <div className="grid gap-1">
                    <span className="text-xs uppercase text-muted-foreground">User</span>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{promptPreview.userPrompt}</pre>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Loading preview...</p>
              )}
            </div>
          )}
        </div>
      </aside>
    </main>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="grid gap-1 border-b pb-2 last:border-0">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <span className="break-words text-sm font-medium">{value}</span>
    </div>
  );
}

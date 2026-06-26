"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import { Clipboard, Download, FileText, RotateCcw, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/presentation/components/ui/button";
import { CodeMirrorEditor } from "@/presentation/generation/editor/codemirror-editor";
import { QualityBadge } from "@/presentation/generation/quality-badge";
import { computeTextMetrics } from "@/lib/text-metrics";
import type { Generation, QualityScore } from "@/domain/schemas";

const ALLOWED_ELEMENTS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr",
  "a", "img",
  "ul", "ol", "li",
  "code", "pre", "blockquote",
  "table", "thead", "tbody", "tr", "th", "td",
  "strong", "em", "del", "sup", "sub",
];

const MemoizedReactMarkdown = React.memo(ReactMarkdown);

type OutputPanelProps = {
  content: string;
  status: string;
  error: string | null;
  rawMode: boolean;
  editorFontSize: number;
  isGenerating: boolean;
  activeGeneration: Generation | null;
  title: string;
  presetId: string;
  providerProfileId?: string;
  qualityScore: QualityScore | null;
  scoring: boolean;
  onScore: () => void;
  onRawModeChange: (v: boolean) => void;
  onContentChange: (v: string) => void;
  onCopyMarkdown: () => void;
  onCopyPlainText: () => void;
  onExportMd: () => void;
  onExportTxt: () => void;
  onSave: () => void;
  onRegenerate: () => void;
  onFontSizeChange: (v: number) => void;
};

export function OutputPanel(props: OutputPanelProps): React.ReactElement {
  const t = useTranslations("Output");
  const metrics = React.useMemo(() => computeTextMetrics(props.content), [props.content]);

  return (
    <section className="app-surface grid min-h-[calc(100vh-6.5rem)] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3 rounded-lg p-4 slide-up" style={{ animationDelay: "0.1s" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{props.status}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={props.rawMode ? "default" : "outline"} size="sm" onClick={() => props.onRawModeChange(true)}>
            <FileText className="h-4 w-4" />
            {t("rawBtn")}
          </Button>
          <Button variant={!props.rawMode ? "default" : "outline"} size="sm" onClick={() => props.onRawModeChange(false)}>
            <FileText className="h-4 w-4" />
            {t("previewBtn")}
          </Button>
        </div>
        <div className="w-full">
          <QualityBadge
            score={props.qualityScore}
            scoring={props.scoring}
            disabled={!props.activeGeneration || !props.content || props.isGenerating}
            onScore={props.onScore}
          />
        </div>
      </div>
      {props.error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">{props.error}</div> : null}
      <div className="min-h-0 overflow-hidden rounded-md border bg-background">
        {props.rawMode ? (
          <CodeMirrorEditor
            value={props.content}
            onChange={props.onContentChange}
            readOnly={props.isGenerating}
            fontSize={props.editorFontSize}
            placeholder={t("streamingPlaceholder")}
            className="h-full min-h-[540px] overflow-auto text-sm"
            title={props.title}
            presetId={props.presetId}
            providerProfileId={props.providerProfileId}
          />
        ) : (
          <article className="prose prose-neutral max-w-none overflow-auto p-4 dark:prose-invert">
            <MemoizedReactMarkdown allowedElements={ALLOWED_ELEMENTS}>{props.content || t("streamingPlaceholder")}</MemoizedReactMarkdown>
          </article>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>{t("fontLabel")}</span>
            <input
              aria-label="Editor font size"
              type="range"
              min="13"
              max="20"
              value={props.editorFontSize}
              onChange={(e) => props.onFontSizeChange(Number(e.target.value))}
            />
            <span>{props.editorFontSize}px</span>
          </div>
          <div className="flex items-center gap-2" aria-label="Document metrics">
            <span>{t("metricsWords", { count: metrics.words })}</span>
            {metrics.cjkChars > 0 ? <span>· {t("metricsCjk", { count: metrics.cjkChars })}</span> : null}
            <span>· {t("metricsReadMin", { count: metrics.readingMinutes })}</span>
            {metrics.readabilityGrade !== null ? (
              <span title={t("metricsAriTitle")}>· {t("metricsAri", { grade: metrics.readabilityGrade })}</span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!props.content} onClick={props.onCopyMarkdown}>
            <Clipboard className="h-4 w-4" />
            {t("copyMarkdownBtn")}
          </Button>
          <Button variant="outline" size="sm" disabled={!props.content} onClick={props.onCopyPlainText}>
            <Clipboard className="h-4 w-4" />
            {t("copyPlainTextBtn")}
          </Button>
          <Button variant="outline" size="sm" disabled={!props.content} onClick={props.onExportMd}>
            <Download className="h-4 w-4" />
            {t("exportMdBtn")}
          </Button>
          <Button variant="outline" size="sm" disabled={!props.content} onClick={props.onExportTxt}>
            <Download className="h-4 w-4" />
            {t("exportTxtBtn")}
          </Button>
          <Button variant="outline" size="sm" disabled={!props.activeGeneration} onClick={props.onSave}>
            <Save className="h-4 w-4" />
            {t("saveBtn")}
          </Button>
          <Button variant="secondary" size="sm" disabled={props.isGenerating} onClick={props.onRegenerate}>
            <RotateCcw className="h-4 w-4" />
            {t("regenerateBtn")}
          </Button>
        </div>
      </div>
    </section>
  );
}

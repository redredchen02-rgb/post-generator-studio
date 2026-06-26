"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import type { PromptTemplate } from "@/domain/schemas";
import { promptTemplateCreateSchema } from "@/domain/schemas";
import type { z } from "zod";
import { Button } from "@/presentation/components/ui/button";
import { Field } from "@/presentation/components/ui/field";
import { Input } from "@/presentation/components/ui/input";
import { NativeSelect } from "@/presentation/components/ui/native-select";
import { Textarea } from "@/presentation/components/ui/textarea";
import { extractTemplateVariables } from "@/application/prompt/renderer";
import { fetchJson } from "@/presentation/lib/api";
import { useVarMemoryStore } from "@/presentation/store/var-memory-store";
import { Header } from "./settings-workspace";
import { ConfirmDialog } from "@/presentation/components/ui/confirm-dialog";

const STANDARD_VARS = new Set(["TITLE", "EVENT_SUMMARY", "DATE", "TIME", "LOCALE"]);

type TemplateForm = z.infer<typeof promptTemplateCreateSchema>;

const CREATE_DEFAULTS: TemplateForm = {
  name: "Custom Template",
  description: "",
  systemPrompt: "你是一名资深内容编辑。",
  userPromptTemplate: "标题：{{TITLE}}\n\n事件：{{EVENT_SUMMARY}}\n\n日期：{{DATE}}",
  supportedVariables: ["TITLE", "EVENT_SUMMARY", "DATE", "TIME", "LOCALE"],
  customVariableDefaults: {},
  outputFormat: "markdown",
  isDefault: false,
};

export function PromptTemplatesPanel({
  templates,
  refresh,
  notify,
}: {
  templates: PromptTemplate[];
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}): React.ReactElement {
  const t = useTranslations("Settings.templates");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const form = useForm<TemplateForm>({
    resolver: zodResolver(promptTemplateCreateSchema),
    defaultValues: CREATE_DEFAULTS,
  });
  const [preview, setPreview] = React.useState<{ systemPrompt: string; userPrompt: string } | null>(null);
  const [detectedVars, setDetectedVars] = React.useState<string[]>([]);
  const watchedDefaults = useWatch({ control: form.control, name: "customVariableDefaults" });
  const watchedSystemPrompt = useWatch({ control: form.control, name: "systemPrompt" });
  const watchedUserPromptTemplate = useWatch({ control: form.control, name: "userPromptTemplate" });

  React.useEffect(() => {
    const timer = setTimeout(() => {
      const all = [
        ...extractTemplateVariables(watchedSystemPrompt ?? ""),
        ...extractTemplateVariables(watchedUserPromptTemplate ?? ""),
      ];
      setDetectedVars([...new Set(all)].filter((v) => !STANDARD_VARS.has(v)));
    }, 400);
    return () => clearTimeout(timer);
  }, [watchedSystemPrompt, watchedUserPromptTemplate]);

  function loadForEdit(template: PromptTemplate): void {
    setEditingId(template.id);
    setPreview(null);
    const all = [
      ...extractTemplateVariables(template.systemPrompt),
      ...extractTemplateVariables(template.userPromptTemplate),
    ];
    setDetectedVars([...new Set(all)].filter((v) => !STANDARD_VARS.has(v)));
    form.reset({
      name: template.name,
      description: template.description ?? "",
      systemPrompt: template.systemPrompt,
      userPromptTemplate: template.userPromptTemplate,
      supportedVariables: template.supportedVariables,
      customVariableDefaults: template.customVariableDefaults,
      outputFormat: template.outputFormat,
      isDefault: template.isDefault,
    });
  }

  function cancelEdit(): void {
    setEditingId(null);
    setPreview(null);
    setDetectedVars([]);
    form.reset(CREATE_DEFAULTS);
  }

  async function submit(values: TemplateForm): Promise<void> {
    const syncedValues: TemplateForm = {
      ...values,
      supportedVariables: [...new Set([...values.supportedVariables, ...detectedVars])],
      customVariableDefaults: Object.fromEntries(
        Object.entries(values.customVariableDefaults).filter(([k]) => detectedVars.includes(k)),
      ),
    };
    try {
      if (editingId) {
        await fetchJson<PromptTemplate>(`/api/prompt-templates/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(syncedValues),
        });
        notify(t("updatedMsg"));
        cancelEdit();
      } else {
        await fetchJson<PromptTemplate>("/api/prompt-templates", {
          method: "POST",
          body: JSON.stringify(syncedValues),
        });
        notify(t("savedMsg"));
      }
      await refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : t("saveFailed"));
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await fetchJson(`/api/prompt-templates/${id}`, { method: "DELETE" });
      useVarMemoryStore.getState().clearTemplate(id);
      if (editingId === id) cancelEdit();
      await refresh();
      notify(t("deletedMsg"));
    } catch (err) {
      notify(err instanceof Error ? err.message : t("deleteFailed"));
    }
  }

  async function previewRendered(): Promise<void> {
    try {
      const values = form.getValues();
      setPreview(
        await fetchJson<{ systemPrompt: string; userPrompt: string }>("/api/prompt-templates/preview", {
          method: "POST",
          body: JSON.stringify(values),
        }),
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : t("previewFailed"));
    }
  }

  return (
    <div className="grid gap-6">
      <Header title={t("title")} description={t("subtitle")} />
      <form className="grid gap-3 rounded-lg border p-4" onSubmit={form.handleSubmit((values) => void submit(values))}>
        {editingId ? (
          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
            <span className="text-sm font-medium">
              {t("editing")} {templates.find((tmpl) => tmpl.id === editingId)?.name}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={cancelEdit}>
              <Plus className="h-4 w-4 rotate-45" />
              {t("newBtn")}
            </Button>
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t("nameLabel")}>
            <Input {...form.register("name")} />
          </Field>
          <Field label={t("outputFormatLabel")}>
            <NativeSelect {...form.register("outputFormat")}>
              <option value="markdown">markdown</option>
              <option value="plain_text">plain_text</option>
              <option value="html">html</option>
            </NativeSelect>
          </Field>
        </div>
        <Field label={t("descriptionLabel")}>
          <Input {...form.register("description")} />
        </Field>
        <Field label={t("systemPromptLabel")}>
          <Textarea className="min-h-40" {...form.register("systemPrompt")} />
        </Field>
        <Field label={t("userPromptLabel")}>
          <Textarea className="min-h-52 font-mono" {...form.register("userPromptTemplate")} />
        </Field>
        {detectedVars.length > 0 && (
          <div className="grid gap-2 rounded-lg border p-3">
            <span className="text-sm font-medium">{t("customVarDefaultsLabel")}</span>
            {detectedVars.map((varName) => (
              <Field key={varName} label={varName}>
                <Input
                  value={watchedDefaults?.[varName] ?? ""}
                  onChange={(e) =>
                    form.setValue("customVariableDefaults", {
                      ...(watchedDefaults ?? {}),
                      [varName]: e.target.value,
                    })
                  }
                  placeholder={`Default value for {{${varName}}}`}
                />
              </Field>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit">
            <Save className="h-4 w-4" />
            {editingId ? t("updateBtn") : t("saveBtn")}
          </Button>
          <Button type="button" variant="outline" onClick={() => void previewRendered()}>
            <Copy className="h-4 w-4" />
            {t("previewBtn")}
          </Button>
        </div>
      </form>
      {preview ? (
        <div className="grid gap-3 rounded-lg border p-4">
          <h3 className="font-medium">{t("previewTitle")}</h3>
          <pre className="overflow-auto rounded bg-muted p-3 text-xs">{preview.systemPrompt}</pre>
          <pre className="overflow-auto rounded bg-muted p-3 text-xs">{preview.userPrompt}</pre>
        </div>
      ) : null}
      <div className="grid gap-2">
        {templates.map((template) => (
          <div
            key={template.id}
            className={`grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_auto] ${
              editingId === template.id ? "border-primary" : ""
            }`}
          >
            <div>
              <h3 className="font-medium">{template.name}</h3>
              <p className="text-sm text-muted-foreground">
                v{template.version} · {template.outputFormat} · {template.isDefault ? t("defaultLabel") : t("customLabel")} ·{" "}
                {template.supportedVariables.join(", ")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => loadForEdit(template)}>
                <Pencil className="h-4 w-4" />
                {t("editBtn")}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setPendingDeleteId(template.id)}>
                <Trash2 className="h-4 w-4" />
                {t("deleteBtn")}
              </Button>
            </div>
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        title={t("confirmDeleteTitle")}
        description={t("confirmDeleteDesc")}
        confirmLabel={t("deleteBtn")}
        onConfirm={async () => {
          if (pendingDeleteId) await remove(pendingDeleteId);
          setPendingDeleteId(null);
        }}
        variant="destructive"
      />
    </div>
  );
}

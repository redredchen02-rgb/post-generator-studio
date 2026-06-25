"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
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
  const [editingId, setEditingId] = React.useState<string | null>(null);
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
        notify("Prompt template updated");
        cancelEdit();
      } else {
        await fetchJson<PromptTemplate>("/api/prompt-templates", {
          method: "POST",
          body: JSON.stringify(syncedValues),
        });
        notify("Prompt template saved");
      }
      await refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await fetchJson(`/api/prompt-templates/${id}`, { method: "DELETE" });
      useVarMemoryStore.getState().clearTemplate(id);
      if (editingId === id) cancelEdit();
      await refresh();
      notify("Prompt template deleted");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Delete failed");
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
      notify(err instanceof Error ? err.message : "Preview failed");
    }
  }

  return (
    <div className="grid gap-6">
      <Header title="Prompt Templates" description="管理版本化模板和受控变量。" />
      <form className="grid gap-3 rounded-lg border p-4" onSubmit={form.handleSubmit((values) => void submit(values))}>
        {editingId ? (
          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
            <span className="text-sm font-medium">
              Editing: {templates.find((t) => t.id === editingId)?.name}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={cancelEdit}>
              <Plus className="h-4 w-4 rotate-45" />
              New
            </Button>
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Name">
            <Input {...form.register("name")} />
          </Field>
          <Field label="Output Format">
            <NativeSelect {...form.register("outputFormat")}>
              <option value="markdown">markdown</option>
              <option value="plain_text">plain_text</option>
              <option value="html">html</option>
            </NativeSelect>
          </Field>
        </div>
        <Field label="Description">
          <Input {...form.register("description")} />
        </Field>
        <Field label="System Prompt">
          <Textarea className="min-h-40" {...form.register("systemPrompt")} />
        </Field>
        <Field label="User Prompt Template">
          <Textarea className="min-h-52 font-mono" {...form.register("userPromptTemplate")} />
        </Field>
        {detectedVars.length > 0 && (
          <div className="grid gap-2 rounded-lg border p-3">
            <span className="text-sm font-medium">Custom Variable Defaults</span>
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
            {editingId ? "Update Template" : "Save Template"}
          </Button>
          <Button type="button" variant="outline" onClick={() => void previewRendered()}>
            <Copy className="h-4 w-4" />
            Preview Rendered Prompt
          </Button>
        </div>
      </form>
      {preview ? (
        <div className="grid gap-3 rounded-lg border p-4">
          <h3 className="font-medium">Preview</h3>
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
                v{template.version} · {template.outputFormat} · {template.isDefault ? "default" : "custom"} ·{" "}
                {template.supportedVariables.join(", ")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => loadForEdit(template)}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
              <Button variant="destructive" size="sm" onClick={() => void remove(template.id)}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

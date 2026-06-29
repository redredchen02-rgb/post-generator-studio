"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import type { GenerationPreset, PromptTemplate, ProviderProfile } from "@/domain/schemas";
import { generationPresetCreateSchema } from "@/domain/schemas";
import { ALL_PIPELINE_STEPS } from "@/domain/pipeline-steps";
import type { z } from "zod";
import { Button } from "@/presentation/components/ui/button";
import { Field } from "@/presentation/components/ui/field";
import { Input } from "@/presentation/components/ui/input";
import { NativeSelect } from "@/presentation/components/ui/native-select";
import { fetchJson } from "@/presentation/lib/api";
import { Header } from "./settings-workspace";
import { DEFAULT_TEMPERATURE, DEFAULT_MAX_TOKENS } from "@/domain/constants";
import { ConfirmDialog } from "@/presentation/components/ui/confirm-dialog";

type PresetForm = z.infer<typeof generationPresetCreateSchema>;

function makeDefaults(providers: ProviderProfile[], templates: PromptTemplate[]): PresetForm {
  return {
    name: "New Preset",
    providerProfileId: providers[0]?.id || "",
    promptTemplateId: templates[0]?.id || "",
    temperature: DEFAULT_TEMPERATURE,
    maxTokens: DEFAULT_MAX_TOKENS,
    locale: "zh-CN",
    outputFormat: "markdown",
    enabledPipelineSteps: [...ALL_PIPELINE_STEPS],
    isDefault: false,
  };
}

export function GenerationPresetsPanel({
  presets,
  providers,
  templates,
  refresh,
  notify,
}: {
  presets: GenerationPreset[];
  providers: ProviderProfile[];
  templates: PromptTemplate[];
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}): React.ReactElement {
  const t = useTranslations("Settings.presets");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const form = useForm<PresetForm>({
    resolver: zodResolver(generationPresetCreateSchema),
    defaultValues: makeDefaults(providers, templates),
  });

  React.useEffect(() => {
    if (!editingId) {
      if (providers[0]?.id && !form.getValues("providerProfileId")) {
        form.setValue("providerProfileId", providers[0].id);
      }
      if (templates[0]?.id && !form.getValues("promptTemplateId")) {
        form.setValue("promptTemplateId", templates[0].id);
      }
    }
  }, [form, providers, templates, editingId]);

  function loadForEdit(preset: GenerationPreset): void {
    setEditingId(preset.id);
    form.reset({
      name: preset.name,
      providerProfileId: preset.providerProfileId,
      promptTemplateId: preset.promptTemplateId,
      temperature: preset.temperature ?? 0.7,
      maxTokens: preset.maxTokens ?? 3000,
      locale: preset.locale,
      outputFormat: preset.outputFormat,
      enabledPipelineSteps: preset.enabledPipelineSteps,
      isDefault: preset.isDefault,
    });
  }

  function cancelEdit(): void {
    setEditingId(null);
    form.reset(makeDefaults(providers, templates));
  }

  async function submit(values: PresetForm): Promise<void> {
    try {
      if (editingId) {
        await fetchJson<GenerationPreset>(`/api/generation-presets/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(values),
        });
        notify(t("updatedMsg"));
        cancelEdit();
      } else {
        await fetchJson<GenerationPreset>("/api/generation-presets", {
          method: "POST",
          body: JSON.stringify(values),
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
      const response = await fetch(`/api/generation-presets/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`Delete failed: ${response.status}`);
      if (editingId === id) cancelEdit();
      await refresh();
      notify(t("deletedMsg"));
    } catch (err) {
      notify(err instanceof Error ? err.message : t("deleteFailed"));
    }
  }

  return (
    <div className="grid gap-6">
      <Header title={t("title")} description={t("subtitle")} />
      <form className="grid gap-3 rounded-lg border p-4" onSubmit={form.handleSubmit((values) => void submit(values))}>
        {editingId ? (
          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
            <span className="text-sm font-medium">
              {t("editing")} {presets.find((p) => p.id === editingId)?.name}
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
          <Field label={t("providerProfileLabel")}>
            <NativeSelect {...form.register("providerProfileId")}>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("promptTemplateLabel")}>
            <NativeSelect {...form.register("promptTemplateId")}>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("localeLabel")}>
            <Input {...form.register("locale")} />
          </Field>
          <Field label={t("temperatureLabel")}>
            <Input type="number" step="0.1" {...form.register("temperature", { valueAsNumber: true })} />
          </Field>
          <Field label={t("maxTokensLabel")}>
            <Input type="number" {...form.register("maxTokens", { valueAsNumber: true })} />
          </Field>
          <Field label={t("outputFormatLabel")}>
            <NativeSelect {...form.register("outputFormat")}>
              <option value="markdown">markdown</option>
              <option value="plain_text">plain_text</option>
              <option value="html">html</option>
            </NativeSelect>
          </Field>
          <label className="flex items-center gap-2 pt-6 text-sm">
            <input type="checkbox" {...form.register("isDefault")} />
            {t("defaultPresetLabel")}
          </label>
        </div>
        <Button className="w-fit" type="submit">
          <Save className="h-4 w-4" />
          {editingId ? t("updateBtn") : t("saveBtn")}
        </Button>
      </form>
      <div className="grid gap-2">
        {presets.map((preset) => (
          <div
            key={preset.id}
            className={`grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_auto] ${
              editingId === preset.id ? "border-primary" : ""
            }`}
          >
            <div>
              <h3 className="font-medium">{preset.name}</h3>
              <p className="text-sm text-muted-foreground">
                {preset.locale} · {preset.outputFormat} · {preset.isDefault ? t("defaultLabel") : t("customLabel")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => loadForEdit(preset)}>
                <Pencil className="h-4 w-4" />
                {t("editBtn")}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setPendingDeleteId(preset.id)}>
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

"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { FlaskConical, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import type { ProviderKind, ProviderProfile } from "@/domain/schemas";
import { providerKindSchema, providerProfileCreateSchema } from "@/domain/schemas";
import type { z } from "zod";
import { Button } from "@/presentation/components/ui/button";
import { Field } from "@/presentation/components/ui/field";
import { Input } from "@/presentation/components/ui/input";
import { NativeSelect } from "@/presentation/components/ui/native-select";
import { fetchJson } from "@/presentation/lib/api";
import { Header } from "./settings-workspace";

type ProviderForm = z.infer<typeof providerProfileCreateSchema>;

const PROVIDER_DEFAULTS: Record<ProviderKind, { baseUrl?: string; model: string; requiresApiKey: boolean }> = {
  openai: { baseUrl: "https://api.openai.com", model: "gpt-4o-mini", requiresApiKey: true },
  anthropic: { model: "claude-sonnet-4-6", requiresApiKey: true },
  gemini: { model: "gemini-2.0-flash", requiresApiKey: true },
  ollama: { baseUrl: "http://localhost:11434", model: "llama3.2", requiresApiKey: false },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "openrouter/auto", requiresApiKey: true },
  "openai-compatible": { baseUrl: "http://localhost:8000", model: "", requiresApiKey: false },
};

const CREATE_DEFAULTS: ProviderForm = {
  name: "OpenAI Compatible",
  providerKind: "openai-compatible",
  baseUrl: "http://localhost:8000",
  model: "local-model",
  apiKey: "",
  defaultTemperature: 0.7,
  defaultMaxTokens: 3000,
  enabled: false,
};

export function ProviderProfilesPanel({
  profiles,
  refresh,
  notify,
}: {
  profiles: ProviderProfile[];
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}): React.ReactElement {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const form = useForm<ProviderForm>({
    resolver: zodResolver(providerProfileCreateSchema),
    defaultValues: CREATE_DEFAULTS,
  });

  const watchedKind = useWatch({ control: form.control, name: "providerKind" });
  const requiresApiKey = PROVIDER_DEFAULTS[watchedKind]?.requiresApiKey ?? true;

  React.useEffect(() => {
    if (editingId !== null) return;
    const d = PROVIDER_DEFAULTS[watchedKind];
    if (!d) return;
    form.setValue("baseUrl", d.baseUrl ?? "");
    form.setValue("model", d.model);
    if (!d.requiresApiKey) form.setValue("apiKey", "");
  }, [watchedKind, editingId, form]);

  function loadForEdit(profile: ProviderProfile): void {
    setEditingId(profile.id);
    form.reset({
      name: profile.name,
      providerKind: profile.providerKind,
      baseUrl: profile.baseUrl ?? "",
      model: profile.model,
      apiKey: "",
      defaultTemperature: profile.defaultTemperature,
      defaultMaxTokens: profile.defaultMaxTokens,
      enabled: profile.enabled,
    });
  }

  function cancelEdit(): void {
    setEditingId(null);
    form.reset(CREATE_DEFAULTS);
  }

  async function submit(values: ProviderForm): Promise<void> {
    try {
      if (editingId) {
        const patch: Record<string, unknown> = { ...values };
        if (!values.apiKey) delete patch.apiKey;
        await fetchJson<ProviderProfile>(`/api/provider-profiles/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        notify("Provider profile updated");
        cancelEdit();
      } else {
        await fetchJson<ProviderProfile>("/api/provider-profiles", {
          method: "POST",
          body: JSON.stringify(values),
        });
        form.reset(CREATE_DEFAULTS);
        notify("Provider profile saved");
      }
      await refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await fetch(`/api/provider-profiles/${id}`, { method: "DELETE" });
      if (editingId === id) cancelEdit();
      await refresh();
      notify("Provider profile deleted");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function test(id: string): Promise<void> {
    try {
      const result = await fetchJson<{ ok: boolean; message: string }>(`/api/provider-profiles/${id}/test`, {
        method: "POST",
      });
      notify(result.message);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Test failed");
    }
  }

  return (
    <div className="grid gap-6">
      <Header title="Provider Profiles" description="新增、测试、启停模型供应商。API Key 只会保存到服务端密文文件。" />
      <form className="grid gap-3 rounded-lg border p-4" onSubmit={form.handleSubmit((values) => void submit(values))}>
        {editingId ? (
          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
            <span className="text-sm font-medium">
              Editing: {profiles.find((p) => p.id === editingId)?.name}
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
          <Field label="Provider">
            <NativeSelect {...form.register("providerKind")}>
              {providerKindSchema.options.map((kind: ProviderKind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Base URL">
            <Input {...form.register("baseUrl")} />
          </Field>
          <Field label="Model">
            <Input {...form.register("model")} />
          </Field>
          {requiresApiKey ? (
            <Field label={editingId ? "API Key (leave blank to keep existing)" : "API Key"}>
              <Input
                type="password"
                placeholder={editingId ? "[saved — type to replace]" : ""}
                {...form.register("apiKey")}
              />
            </Field>
          ) : null}
          <Field label="Temperature">
            <Input type="number" step="0.1" {...form.register("defaultTemperature", { valueAsNumber: true })} />
          </Field>
          <Field label="Max Tokens">
            <Input type="number" {...form.register("defaultMaxTokens", { valueAsNumber: true })} />
          </Field>
          <label className="flex items-center gap-2 pt-6 text-sm">
            <input type="checkbox" {...form.register("enabled")} />
            Enabled
          </label>
        </div>
        <Button className="w-fit" type="submit">
          <Save className="h-4 w-4" />
          {editingId ? "Update Provider" : "Save Provider"}
        </Button>
      </form>
      <div className="grid gap-2">
        {profiles.map((profile) => (
          <div
            key={profile.id}
            className={`grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_auto] ${
              editingId === profile.id ? "border-primary" : ""
            }`}
          >
            <div>
              <h3 className="font-medium">{profile.name}</h3>
              <p className="text-sm text-muted-foreground">
                {profile.providerKind} · {profile.model} · {profile.enabled ? "enabled" : "disabled"} ·{" "}
                {profile.keyMasked || "no key"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => loadForEdit(profile)}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => void test(profile.id)}>
                <FlaskConical className="h-4 w-4" />
                Test
              </Button>
              <Button variant="destructive" size="sm" onClick={() => void remove(profile.id)}>
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

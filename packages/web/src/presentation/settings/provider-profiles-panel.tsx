"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { FlaskConical, KeyRound, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import type { ProviderKind, ProviderProfile } from "@postgen/domain";
import { providerKindSchema, providerProfileCreateSchema } from "@postgen/domain";
import type { z } from "zod";
import { Button } from "@/presentation/components/ui/button";
import { Field } from "@/presentation/components/ui/field";
import { Input } from "@/presentation/components/ui/input";
import { NativeSelect } from "@/presentation/components/ui/native-select";
import { client } from "@/presentation/lib/api";
import { Header } from "./settings-workspace";

type ProviderForm = z.infer<typeof providerProfileCreateSchema>;

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
        const patch = values.apiKey ? values : { ...values, apiKey: undefined };
        await client.updateProviderProfile(editingId, patch);
        notify("Provider profile updated");
        cancelEdit();
      } else {
        await client.createProviderProfile(values);
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
      await client.deleteProviderProfile(id);
      if (editingId === id) cancelEdit();
      await refresh();
      notify("Provider profile deleted");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function test(id: string): Promise<void> {
    try {
      const result = await client.testProviderProfile(id);
      notify(result.message);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Test failed");
    }
  }

  async function clearKey(id: string): Promise<void> {
    try {
      await client.updateProviderProfile(id, { clearApiKey: true });
      await refresh();
      notify("API key cleared");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Clear failed");
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
          <Field label={editingId ? "API Key (leave blank to keep existing)" : "API Key"}>
            <Input
              type="password"
              placeholder={editingId ? "[saved — type to replace]" : ""}
              {...form.register("apiKey")}
            />
          </Field>
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
        <div className="flex gap-2">
          <Button className="w-fit" type="submit">
            <Save className="h-4 w-4" />
            {editingId ? "Update Provider" : "Save Provider"}
          </Button>
          {editingId && profiles.find((p) => p.id === editingId)?.keyMasked ? (
            <Button className="w-fit" type="button" variant="outline" onClick={() => void clearKey(editingId)}>
              <KeyRound className="h-4 w-4" />
              Clear API Key
            </Button>
          ) : null}
        </div>
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

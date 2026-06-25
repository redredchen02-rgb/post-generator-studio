"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { FlaskConical, Save, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
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

export function ProviderProfilesPanel({
  profiles,
  refresh,
  notify,
}: {
  profiles: ProviderProfile[];
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}): React.ReactElement {
  const form = useForm<ProviderForm>({
    resolver: zodResolver(providerProfileCreateSchema),
    defaultValues: {
      name: "OpenAI Compatible",
      providerKind: "openai-compatible",
      baseUrl: "http://localhost:8000",
      model: "local-model",
      apiKey: "",
      defaultTemperature: 0.7,
      defaultMaxTokens: 3000,
      enabled: false,
    },
  });

  async function submit(values: ProviderForm): Promise<void> {
    await fetchJson<ProviderProfile>("/api/provider-profiles", {
      method: "POST",
      body: JSON.stringify(values),
    });
    form.reset({ ...values, apiKey: "" });
    await refresh();
    notify("Provider profile saved");
  }

  async function remove(id: string): Promise<void> {
    await fetch(`/api/provider-profiles/${id}`, { method: "DELETE" });
    await refresh();
    notify("Provider profile deleted");
  }

  async function test(id: string): Promise<void> {
    const result = await fetchJson<{ ok: boolean; message: string }>(`/api/provider-profiles/${id}/test`, {
      method: "POST",
    });
    notify(result.message);
  }

  return (
    <div className="grid gap-6">
      <Header title="Provider Profiles" description="新增、测试、启停模型供应商。API Key 只会保存到服务端密文文件。" />
      <form className="grid gap-3 rounded-lg border p-4" onSubmit={form.handleSubmit((values) => void submit(values))}>
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
          <Field label="API Key">
            <Input type="password" {...form.register("apiKey")} />
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
        <Button className="w-fit" type="submit">
          <Save className="h-4 w-4" />
          Save Provider
        </Button>
      </form>
      <div className="grid gap-2">
        {profiles.map((profile) => (
          <div key={profile.id} className="grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_auto]">
            <div>
              <h3 className="font-medium">{profile.name}</h3>
              <p className="text-sm text-muted-foreground">
                {profile.providerKind} · {profile.model} · {profile.enabled ? "enabled" : "disabled"} · {profile.keyMasked || "no key"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
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

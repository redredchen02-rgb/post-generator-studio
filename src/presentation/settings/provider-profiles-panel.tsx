"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Eye, EyeOff, FlaskConical, KeyRound, Loader2, Pencil, Plus, Power, Save, Trash2, XCircle } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import type { ProviderKind, ProviderProfile } from "@/domain/schemas";
import { providerKindSchema, providerProfileCreateSchema } from "@/domain/schemas";
import type { z } from "zod";
import { Button } from "@/presentation/components/ui/button";
import { Field } from "@/presentation/components/ui/field";
import { Input } from "@/presentation/components/ui/input";
import { NativeSelect } from "@/presentation/components/ui/native-select";
import { fetchJson, testProviderProfile } from "@/presentation/lib/api";
import { Header } from "./settings-workspace";
import { DEFAULT_TEMPERATURE, DEFAULT_MAX_TOKENS } from "@/domain/constants";
import { ConfirmDialog } from "@/presentation/components/ui/confirm-dialog";

type ProviderForm = z.infer<typeof providerProfileCreateSchema>;

type ProviderMeta = {
  baseUrl?: string;
  model: string;
  requiresApiKey: boolean;
  displayName: string;
  apiKeyUrl?: string;
};

const PROVIDER_META: Record<ProviderKind, ProviderMeta> = {
  openai: { baseUrl: "https://api.openai.com", model: "gpt-4o-mini", requiresApiKey: true, displayName: "OpenAI", apiKeyUrl: "https://platform.openai.com/api-keys" },
  anthropic: { model: "claude-sonnet-4-6", requiresApiKey: true, displayName: "Anthropic", apiKeyUrl: "https://console.anthropic.com/settings/keys" },
  gemini: { model: "gemini-2.0-flash", requiresApiKey: true, displayName: "Google Gemini", apiKeyUrl: "https://aistudio.google.com/app/apikey" },
  ollama: { baseUrl: "http://localhost:11434", model: "llama3.2", requiresApiKey: false, displayName: "Ollama (Local)" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "openrouter/auto", requiresApiKey: true, displayName: "OpenRouter", apiKeyUrl: "https://openrouter.ai/keys" },
  "openai-compatible": { baseUrl: "http://localhost:8000", model: "", requiresApiKey: true, displayName: "OpenAI-Compatible" },
  grok: { baseUrl: "https://api.x.ai", model: "grok-3", requiresApiKey: true, displayName: "Grok (xAI)", apiKeyUrl: "https://console.x.ai/" },
};

const CREATE_DEFAULTS: ProviderForm = {
  name: "OpenAI Compatible",
  providerKind: "openai-compatible",
  baseUrl: "http://localhost:8000",
  model: "local-model",
  apiKey: "",
  defaultTemperature: DEFAULT_TEMPERATURE,
  defaultMaxTokens: DEFAULT_MAX_TOKENS,
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
  const t = useTranslations("Settings.providers");
  const tCommon = useTranslations("Common");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const [testStatus, setTestStatus] = React.useState<Record<string, "idle" | "testing" | "ok" | "error">>({});
  const [testMessage, setTestMessage] = React.useState<Record<string, string>>({});
  const [toggleStatus, setToggleStatus] = React.useState<Record<string, "idle" | "toggling">>({});
  const [showApiKey, setShowApiKey] = React.useState(false);
  const form = useForm<ProviderForm>({
    resolver: zodResolver(providerProfileCreateSchema),
    defaultValues: CREATE_DEFAULTS,
  });

  const watchedKind = useWatch({ control: form.control, name: "providerKind" });
  const meta = PROVIDER_META[watchedKind];
  const requiresApiKey = meta?.requiresApiKey ?? true;
  const apiKeyUrl = meta?.apiKeyUrl;

  React.useEffect(() => {
    if (editingId !== null) return;
    const d = PROVIDER_META[watchedKind];
    if (!d) return;
    form.setValue("baseUrl", d.baseUrl ?? "");
    form.setValue("model", d.model);
    if (!d.requiresApiKey) form.setValue("apiKey", "");
  }, [watchedKind, editingId, form]);

  function loadForEdit(profile: ProviderProfile): void {
    setEditingId(profile.id);
    setShowApiKey(false);
    setTestStatus((prev) => ({ ...prev, [profile.id]: "idle" }));
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
    setShowApiKey(false);
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
        notify(t("updatedMsg"));
        cancelEdit();
      } else {
        await fetchJson<ProviderProfile>("/api/provider-profiles", {
          method: "POST",
          body: JSON.stringify(values),
        });
        setShowApiKey(false);
        form.reset(CREATE_DEFAULTS);
        notify(t("savedMsg"));
      }
      await refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : t("saveFailed"));
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      const response = await fetch(`/api/provider-profiles/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`Delete failed: ${response.status}`);
      if (editingId === id) cancelEdit();
      await refresh();
      notify(t("deletedMsg"));
    } catch (err) {
      notify(err instanceof Error ? err.message : t("deleteFailed"));
    }
  }

  async function handleClearApiKey(id: string): Promise<void> {
    try {
      await fetchJson<ProviderProfile>(`/api/provider-profiles/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ clearApiKey: true }),
      });
      await refresh();
      notify(t("keyClearedMsg"));
    } catch (err) {
      notify(err instanceof Error ? err.message : t("clearKeyFailed"));
    }
  }

  async function handleToggleEnabled(profile: ProviderProfile): Promise<void> {
    setToggleStatus((prev) => ({ ...prev, [profile.id]: "toggling" }));
    try {
      await fetchJson<ProviderProfile>(`/api/provider-profiles/${profile.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !profile.enabled }),
      });
      await refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : t("toggleFailed"));
    } finally {
      setToggleStatus((prev) => ({ ...prev, [profile.id]: "idle" }));
    }
  }

  async function handleTest(id: string): Promise<void> {
    setTestStatus((prev) => ({ ...prev, [id]: "testing" }));
    setTestMessage((prev) => ({ ...prev, [id]: "" }));
    try {
      const result = await testProviderProfile(id);
      if (result.ok) {
        const msg = result.models?.length ? `Connected · ${result.models.length} models` : result.message;
        setTestStatus((prev) => ({ ...prev, [id]: "ok" }));
        setTestMessage((prev) => ({ ...prev, [id]: msg }));
      } else {
        setTestStatus((prev) => ({ ...prev, [id]: "error" }));
        setTestMessage((prev) => ({ ...prev, [id]: result.message }));
      }
    } catch (err) {
      setTestStatus((prev) => ({ ...prev, [id]: "error" }));
      setTestMessage((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : "Test failed" }));
    }
  }

  return (
    <div className="grid gap-6">
      <Header title={t("title")} description={t("subtitle")} />
      <form className="grid gap-3 rounded-lg border p-4" onSubmit={form.handleSubmit((values) => void submit(values))}>
        {editingId ? (
          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
            <span className="text-sm font-medium">
              {t("editing")} {profiles.find((p) => p.id === editingId)?.name}
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
          <Field label={t("providerLabel")}>
            <NativeSelect {...form.register("providerKind")}>
              {providerKindSchema.options.map((kind: ProviderKind) => (
                <option key={kind} value={kind}>
                  {PROVIDER_META[kind].displayName}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("baseUrlLabel")}>
            <Input {...form.register("baseUrl")} />
          </Field>
          <Field label={t("modelLabel")}>
            <Input {...form.register("model")} />
          </Field>
          {requiresApiKey ? (
            <div className="grid gap-1.5 text-sm">
              <span className="font-medium">{editingId ? t("apiKeyEditLabel") : t("apiKeyLabel")}</span>
              <div className="relative flex items-center">
                <Input
                  type={showApiKey ? "text" : "password"}
                  className="pr-10"
                  placeholder={editingId ? t("apiKeyPlaceholder") : ""}
                  {...form.register("apiKey")}
                />
                <button
                  type="button"
                  aria-label={showApiKey ? t("hideKey") : t("showKey")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowApiKey((v) => !v)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {apiKeyUrl ? (
                <a
                  href={apiKeyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  {t("apiKeyGetLink")}
                </a>
              ) : null}
            </div>
          ) : null}
          <Field label={t("temperatureLabel")}>
            <Input type="number" step="0.1" {...form.register("defaultTemperature", { valueAsNumber: true })} />
          </Field>
          <Field label={t("maxTokensLabel")}>
            <Input type="number" {...form.register("defaultMaxTokens", { valueAsNumber: true })} />
          </Field>
          <label className="flex items-center gap-2 pt-6 text-sm">
            <input type="checkbox" {...form.register("enabled")} />
            {t("enabledLabel")}
          </label>
        </div>
        <Button className="w-fit" type="submit">
          <Save className="h-4 w-4" />
          {editingId ? t("updateBtn") : t("saveBtn")}
        </Button>
      </form>
      {profiles.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">{t("empty")}</p>
      ) : null}
      <div className="grid gap-2">
        {profiles.map((profile) => (
          <div
            key={profile.id}
            className={`grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_auto] ${
              editingId === profile.id ? "border-primary" : ""
            }`}
          >
            <div className={profile.enabled ? "" : "opacity-60"}>
              <h3 className="font-medium">{profile.name}</h3>
              <p className="text-sm text-muted-foreground">
                {PROVIDER_META[profile.providerKind]?.displayName ?? profile.providerKind} · {profile.model} ·{" "}
                <span className={profile.enabled ? "font-medium text-green-600 dark:text-green-400" : ""}>
                  {profile.enabled ? tCommon("enabled") : tCommon("disabled")}
                </span>{" "}
                · {profile.keyMasked || tCommon("noKey")}
              </p>
              {testMessage[profile.id] ? (
                <p className={`mt-1 text-xs ${testStatus[profile.id] === "ok" ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                  {testMessage[profile.id]}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={toggleStatus[profile.id] === "toggling"}
                onClick={() => void handleToggleEnabled(profile)}
              >
                {toggleStatus[profile.id] === "toggling" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Power className="h-4 w-4" />
                )}
                {profile.enabled ? t("disableBtn") : t("enableBtn")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => loadForEdit(profile)}>
                <Pencil className="h-4 w-4" />
                {t("editBtn")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={testStatus[profile.id] === "testing"}
                onClick={() => void handleTest(profile.id)}
              >
                {testStatus[profile.id] === "testing" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : testStatus[profile.id] === "ok" ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : testStatus[profile.id] === "error" ? (
                  <XCircle className="h-4 w-4 text-red-500" />
                ) : (
                  <FlaskConical className="h-4 w-4" />
                )}
                {t("testBtn")}
              </Button>
              {profile.keyMasked ? (
                <Button variant="outline" size="sm" onClick={() => void handleClearApiKey(profile.id)}>
                  <KeyRound className="h-4 w-4" />
                  {t("clearKeyBtn")}
                </Button>
              ) : null}
              <Button variant="destructive" size="sm" onClick={() => setPendingDeleteId(profile.id)}>
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

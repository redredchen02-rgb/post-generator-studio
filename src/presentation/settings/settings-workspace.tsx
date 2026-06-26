"use client";

import * as React from "react";
import { Copy, Database, KeyRound, Layers, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { loadBootstrap } from "@/presentation/lib/api";
import { useApi } from "@/presentation/lib/use-api";
import { ProviderProfilesPanel } from "./provider-profiles-panel";
import { PromptTemplatesPanel } from "./prompt-templates-panel";
import { GenerationPresetsPanel } from "./generation-presets-panel";
import { StoragePanel } from "./storage-panel";

type SettingsTab = "providers" | "templates" | "presets" | "storage";

export function Header({ title, description }: { title: string; description: string }): React.ReactElement {
  return (
    <div>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function SettingsWorkspace(): React.ReactElement {
  const t = useTranslations("Settings");
  const [tab, setTab] = React.useState<SettingsTab>("providers");
  const [message, setMessage] = React.useState<string | null>(null);
  const messageTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data: bootstrap, loading, isRefetching, error, refetch } = useApi(loadBootstrap);

  React.useEffect(() => {
    return () => {
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    };
  }, []);

  function notify(value: string): void {
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    setMessage(value);
    messageTimerRef.current = setTimeout(() => setMessage(null), 3000);
  }

  return (
    <main className="mx-auto grid max-w-[1480px] gap-4 px-4 py-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="app-surface h-fit rounded-lg p-3">
        <nav className="grid gap-1">
          <TabButton active={tab === "providers"} onClick={() => setTab("providers")} icon={<KeyRound className="h-4 w-4" />} label={t("tabs.providers")} />
          <TabButton active={tab === "templates"} onClick={() => setTab("templates")} icon={<Copy className="h-4 w-4" />} label={t("tabs.templates")} />
          <TabButton active={tab === "presets"} onClick={() => setTab("presets")} icon={<Layers className="h-4 w-4" />} label={t("tabs.presets")} />
          <TabButton active={tab === "storage"} onClick={() => setTab("storage")} icon={<Database className="h-4 w-4" />} label={t("tabs.storage")} />
        </nav>
      </aside>
      <section className="app-surface min-h-[calc(100vh-6.5rem)] rounded-lg p-4">
        {message ? <div className="mb-4 rounded-md bg-secondary p-3 text-sm text-secondary-foreground">{message}</div> : null}
        {error ? <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">{error}</div> : null}
        {isRefetching ? (
          <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t("refreshing")}
          </div>
        ) : null}
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t("loading")}</div>
        ) : bootstrap ? (
          <>
            {tab === "providers" ? <ProviderProfilesPanel profiles={bootstrap.providerProfiles} refresh={refetch} notify={notify} /> : null}
            {tab === "templates" ? <PromptTemplatesPanel templates={bootstrap.promptTemplates} refresh={refetch} notify={notify} /> : null}
            {tab === "presets" ? (
              <GenerationPresetsPanel
                presets={bootstrap.generationPresets}
                providers={bootstrap.providerProfiles}
                templates={bootstrap.promptTemplates}
                refresh={refetch}
                notify={notify}
              />
            ) : null}
            {tab === "storage" ? <StoragePanel /> : null}
          </>
        ) : null}
      </section>
    </main>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}): React.ReactElement {
  return (
    <button
      className={`flex h-9 items-center gap-2 rounded-md px-3 text-left text-sm transition-colors ${
        active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
      }`}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

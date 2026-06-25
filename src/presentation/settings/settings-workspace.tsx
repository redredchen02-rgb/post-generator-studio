"use client";

import * as React from "react";
import { Copy, Database, KeyRound, Layers } from "lucide-react";
import { loadBootstrap, type BootstrapData } from "@/presentation/lib/api";
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
  const [tab, setTab] = React.useState<SettingsTab>("providers");
  const [bootstrap, setBootstrap] = React.useState<BootstrapData | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setBootstrap(await loadBootstrap());
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  function notify(value: string): void {
    setMessage(value);
    window.setTimeout(() => setMessage(null), 3000);
  }

  return (
    <main className="mx-auto grid max-w-[1480px] gap-4 px-4 py-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="app-surface h-fit rounded-lg p-3">
        <nav className="grid gap-1">
          <TabButton active={tab === "providers"} onClick={() => setTab("providers")} icon={<KeyRound className="h-4 w-4" />} label="Provider Profiles" />
          <TabButton active={tab === "templates"} onClick={() => setTab("templates")} icon={<Copy className="h-4 w-4" />} label="Prompt Templates" />
          <TabButton active={tab === "presets"} onClick={() => setTab("presets")} icon={<Layers className="h-4 w-4" />} label="Generation Presets" />
          <TabButton active={tab === "storage"} onClick={() => setTab("storage")} icon={<Database className="h-4 w-4" />} label="Storage & Security" />
        </nav>
      </aside>
      <section className="app-surface min-h-[calc(100vh-6.5rem)] rounded-lg p-4">
        {message ? <div className="mb-4 rounded-md bg-secondary p-3 text-sm text-secondary-foreground">{message}</div> : null}
        {!bootstrap ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">加载中...</div>
        ) : (
          <>
            {tab === "providers" ? <ProviderProfilesPanel profiles={bootstrap.providerProfiles} refresh={refresh} notify={notify} /> : null}
            {tab === "templates" ? <PromptTemplatesPanel templates={bootstrap.promptTemplates} refresh={refresh} notify={notify} /> : null}
            {tab === "presets" ? (
              <GenerationPresetsPanel
                presets={bootstrap.generationPresets}
                providers={bootstrap.providerProfiles}
                templates={bootstrap.promptTemplates}
                refresh={refresh}
                notify={notify}
              />
            ) : null}
            {tab === "storage" ? <StoragePanel /> : null}
          </>
        )}
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

"use client";

import dynamic from "next/dynamic";

const SettingsWorkspace = dynamic(
  () => import("@/presentation/settings/settings-workspace").then((m) => ({ default: m.SettingsWorkspace })),
  { ssr: false },
);

export default function SettingsPage(): React.ReactElement {
  return <SettingsWorkspace />;
}


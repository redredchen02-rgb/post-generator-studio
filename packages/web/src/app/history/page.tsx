"use client";

import dynamic from "next/dynamic";

const HistoryWorkspace = dynamic(
  () => import("@/presentation/history/history-workspace").then((m) => ({ default: m.HistoryWorkspace })),
  { ssr: false },
);

export default function HistoryPage(): React.ReactElement {
  return <HistoryWorkspace />;
}


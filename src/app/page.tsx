import * as React from "react";
import { GeneratorWorkspace } from "@/presentation/generation/generator-workspace";

export default function Page(): React.ReactElement {
  return (
    <React.Suspense fallback={<div className="flex h-screen items-center justify-center text-muted-foreground text-sm">Loading…</div>}>
      <GeneratorWorkspace />
    </React.Suspense>
  );
}


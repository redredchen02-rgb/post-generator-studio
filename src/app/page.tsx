import * as React from "react";
import { GeneratorWorkspace } from "@/presentation/generation/generator-workspace";

export default function Page(): React.ReactElement {
  return (
    <React.Suspense fallback={null}>
      <GeneratorWorkspace />
    </React.Suspense>
  );
}


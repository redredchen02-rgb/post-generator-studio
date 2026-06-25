import { NextResponse } from "next/server";
import { errorResponse } from "@/application/errors";
import { listGenerationPresets } from "@/application/presets/preset-service";
import { listPromptTemplates } from "@/application/prompt/prompt-service";
import { listProviderProfiles } from "@/application/providers/provider-service";
import { listPipelineSteps } from "@/plugins/pipeline/registry";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const [providerProfiles, promptTemplates, generationPresets] = await Promise.all([
      listProviderProfiles(),
      listPromptTemplates(),
      listGenerationPresets(),
    ]);
    return NextResponse.json({
      providerProfiles,
      promptTemplates,
      generationPresets,
      pipelineSteps: listPipelineSteps().map((step) => ({ id: step.id, name: step.name })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}


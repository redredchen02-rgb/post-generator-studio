import { z } from "zod";

/**
 * One-shot completion request: a single prompt resolved against a preset's
 * provider/model. Used by editor actions (rewrite a passage) and quality
 * scoring, distinct from the streaming generation request.
 */
export const completionRequestSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  systemPrompt: z.string().optional(),
  presetId: z.string().min(1),
  providerProfileId: z.string().optional(),
});
export type CompletionRequest = z.infer<typeof completionRequestSchema>;

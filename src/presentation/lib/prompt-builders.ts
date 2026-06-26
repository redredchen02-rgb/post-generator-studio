/**
 * Browser-safe bridge: re-exports prompt builders from the application layer.
 *
 * All functions here are pure (no React / Next.js / Node.js dependencies) and
 * are safe to call in both server and client contexts. Presentation components
 * should import from this path rather than from `@/application/content/prompt-builders`
 * directly, so the layering rule (presentation → lib bridge → application) is
 * enforced by the ESLint import/no-restricted-paths rule added in Unit 8.
 */
/* eslint-disable import/no-restricted-paths -- presentation/lib/ is the sanctioned bridge layer; these re-exports are the crossing point */
export {
  buildRewritePrompt,
  buildContinuePrompt,
  buildOutlinePrompt,
  buildParagraphPrompt,
  parseOutline,
  serializeOutline,
} from "@/application/content/prompt-builders";

export type { RewriteActionId, RewriteContext } from "@/application/content/prompt-builders";
/* eslint-enable import/no-restricted-paths */

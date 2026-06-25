---
date: 2026-06-25
topic: open-ideation
focus: open-ended
---

# Ideation: Post Generator Studio — Open Ideation

## Codebase Context

**Project shape:** TypeScript + Next.js 15 (App Router), SQLite/Drizzle ORM, Tailwind CSS, pnpm, Node 22. Clean layered architecture: Presentation → Application → Domain ← Infrastructure.

**Notable patterns:**
- Pipeline registry (`src/plugins/pipeline/`) with 4 steps: build-context, render-prompt, clean-content, format-output
- Provider adapters: Anthropic, Gemini, Ollama, OpenAI-compatible — all implement `LLMProviderAdapter` with SSE streaming
- Template system: `{{VARIABLE}}` syntax, `extractTemplateVariables`, 5 hardcoded standard vars
- Generation schema stores `renderedSystemPrompt`, `renderedUserPrompt`, `inputTokens`, `outputTokens`, `providerProfileSnapshot`, `generationPresetSnapshot` — rich audit trail already captured
- `prompt_template_versions` table exists in schema — no UI consumes it

**Obvious pain points:**
- Save button is a no-op (confirmed bug)
- Seeds reference non-existent pipeline step IDs (confirmed bug)
- Naming inconsistency: `application/prompt/` vs `application/prompts/`
- Custom template variables silently fail at runtime — no way to inject values
- Users can't see what prompt they're actually sending until mid-generation failure

---

## Ranked Ideas

### 1. Fix: Save Button is a No-Op
**Description:** `generator-workspace.tsx` `onClick={() => setStatus("Saved to history")}` — no API call, edited content is lost on page leave.  
**Rationale:** PATCH `/api/generations/[id]` already exists. One-line fix with maximum user impact.  
**Downsides:** None.  
**Confidence:** 100%  
**Complexity:** Low  
**Status:** ✅ Implemented (prior session)

### 2. Fix: Seeds Reference Non-Existent Pipeline Step IDs
**Description:** `seeds.ts` lists `generate-content` and `persist-generation` step IDs; `registry.ts` only has 4 real steps. New-user presets silently skip unknown steps.  
**Rationale:** Every fresh install hits this. Zero user-visible error, broken behaviour from day one.  
**Downsides:** None.  
**Confidence:** 100%  
**Complexity:** Low  
**Status:** ✅ Implemented (prior session — seeds simplified, `prompts/` not created)

### 3. Refactor: Merge `application/prompt/` and `application/prompts/`
**Description:** Two near-identical directories exist (`prompt/` with renderer + variables, `prompts/` with prompt-service). Merge into one.  
**Rationale:** Naming confusion costs every future contributor. TypeScript auto-rename handles import updates cleanly.  
**Downsides:** Small import churn; needs careful find/replace.  
**Confidence:** 95%  
**Complexity:** Low  
**Status:** ✅ Implemented (prior session — only `application/prompt/` exists, no merge needed)

### 4. Live Prompt Preview in Generator
**Description:** Collapsible panel in the generator that shows the fully-rendered system/user prompt (with all variables resolved) before the user clicks Generate. Debounced, driven by existing `/api/prompt-templates/preview` endpoint.  
**Rationale:** Eliminates "generate → bad result → guess what the prompt was → fix → retry" loop. The endpoint already exists; only the UI connection is missing.  
**Downsides:** One extra debounced API call per edit; needs UI real estate (collapsible mitigates).  
**Confidence:** 92%  
**Complexity:** Low–Medium  
**Status:** ✅ Implemented (prior session)

### 5. Per-Generation Prompt Inspector in History
**Description:** Collapsible "Prompt Used" section in history detail view, showing `renderedSystemPrompt` and `renderedUserPrompt` already stored in the DB.  
**Rationale:** Zero schema changes. When a generation produces bad output, the user can see exactly what was sent — no guessing.  
**Downsides:** None meaningful.  
**Confidence:** 95%  
**Complexity:** Low  
**Status:** ✅ Implemented (prior session)

### 6. Provider Error Pre-flight Check
**Description:** When the user selects a Provider Profile in the Generator, immediately call `validateConfig()` via the existing `/api/provider-profiles/[id]/test` route. Show any error inline next to the selector before generation starts.  
**Rationale:** Converts mid-stream failures (bad API key, wrong endpoint) into actionable upfront errors. Both `validateConfig()` and the test route already exist but are never called from the generator.  
**Downsides:** One extra API call per provider selection (debounce or fire only on change).  
**Confidence:** 88%  
**Complexity:** Low  
**Status:** ✅ Implemented (prior session)

### 7. Custom Variable Injection in Generator
**Description:** When a selected Template contains non-standard `{{VARIABLE}}` tokens (e.g. `{{PLATFORM}}`), the Generator form auto-detects and renders additional input fields for them. Currently any custom variable causes a silent runtime failure.  
**Rationale:** `extractTemplateVariables()` already parses tokens; `supportedVariables` already exists in schema. The form just needs to read these and render dynamic fields. Upgrades templates from "fixed 5 vars" to truly extensible.  
**Downsides:** Dynamic unknown-count fields require careful form UX; template authors must name variables intentionally.  
**Confidence:** 85%  
**Complexity:** Medium  
**Status:** Unexplored

---

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| A | Batch Generation Queue | Single-user tool doesn't need async queue infrastructure |
| B | Token Cost Estimation | Deprioritised but later implemented (R2-3) — token counts now shown with cost estimate in progress sidebar |
| C | Prompt Template Version Diff UI | Infrastructure exists but single-user use case doesn't justify diff UI complexity yet |
| E | Custom Pipeline Steps (user-authored JS) | Arbitrary JS execution is a security black hole |
| F | History Filter (simplified) | ✅ Implemented (R2-5) — search + pagination added |
| G | Ratings/Feedback Loop | Single-user sample size makes statistics meaningless |
| L | Provider Auto-Fallback | Silent provider switching is worse than a visible error |
| M | Async Background Tasks | Over-engineering for a local single-user tool |
| N | Chained Prompt Templates | New execution model, ROI doesn't justify complexity |
| O | External Variable Sources | Introduces network dependency, complexity exceeds value |
| P | Inline Edit → Regenerate Loop | High implementation cost for the architectural change required |
| Q | Auto-Suggest Variables | Requires ML/embedding layer not present in the stack |
| R | Pipeline Step Timing | Debug utility with limited actionability for users |
| S | Preset Clone + Experiment Tagging | Simple clone is trivial; experiment tagging is overreaching |
| T | Workspace / Multi-tenant Layer | Single-user tool, problem doesn't exist |
| U | Webhook Output Delivery | No integration pipelines needed for local tool |
| V | Bulk ZIP Export | Niche, low frequency, adds maintenance surface |
| W | Exportable Preset Bundles | Useful but low urgency; deferred until preset system stabilises |

---

## Session Log
- 2026-06-25: Initial open ideation — 48 raw candidates generated (6 parallel agents × 8 frames), merged/deduped to 25 unique (A–Y), 2 adversarial critique agents (pragmatism + value lenses), 7 survivors ranked

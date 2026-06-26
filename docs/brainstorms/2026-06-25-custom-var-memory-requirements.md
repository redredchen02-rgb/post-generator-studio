---
date: 2026-06-25
topic: custom-var-memory
---

# Custom Variable Memory + Template Defaults

## Problem Frame

Users with stable template workflows — fixed brand names, platform targets, audience descriptions — must re-enter the same custom variable values every session. This has two root causes:

1. **Reset bug**: switching to a preset that uses a different template clears all var values (`setCustomVarValues({})` in generator-workspace.tsx:98-100).
2. **No persistence**: var values are pure React state, gone on every page reload.
3. **No starting point**: templates have no concept of default values — every cold start begins blank.

This feature introduces two complementary layers: **template defaults** (factory starting values defined once in Settings) and **user memory** (the last-used values persisted in localStorage per template). Together they reduce var re-entry to near-zero for users with predictable workflows.

## User Flow

```
Open Generator
  → Select preset with Template A
      var fields = user memory for A  →  template defaults for A  →  empty
  → Fill / modify vars
  → Generate (success)
      memory for A ← current var values (auto-saved to localStorage)
  → Switch to another preset also using Template A
      var fields = unchanged (no reset, same templateId)
  → Switch to a preset using Template B
      var fields = user memory for B  →  template defaults for B  →  empty
  → Switch back to a preset with Template A
      var fields = restored from memory
```

```
Settings → Prompt Templates → Edit a template
  → Edit systemPrompt: "Your brand is {{BRAND_NAME}}. Target: {{AUDIENCE}}"
      "Custom Variable Defaults" section auto-appears below
      Shows: BRAND_NAME [____]   AUDIENCE [____]
  → Fill in BRAND_NAME = "MyBrand", AUDIENCE = "Gen Z"
  → Save template
      customVariableDefaults = {"BRAND_NAME": "MyBrand", "AUDIENCE": "Gen Z"} stored
```

## Requirements

**Template Defaults (Settings)**

- R1. The template edit form automatically extracts non-standard custom variables from the current `systemPrompt` + `userPromptTemplate` text and displays a "Custom Variable Defaults" section with one labeled input field per detected var.
- R2. The defaults section updates as the user edits the prompt text — var fields appear, rename, or disappear to match the extracted variable set. Updates are debounced at 400ms (same pattern as the live prompt preview) to avoid flickering while a variable name is being typed mid-word.
- R3. Default values are stored on the `PromptTemplate` record as a new optional field `customVariableDefaults: Record<string, string>`.
- R4. Vars detected in the prompt text but with no stored default display an empty field (not hidden).

**User Memory (Generator)**

- R5. Var values are persisted in the Zustand persist store (localStorage) keyed by `templateId`. Structure: `varMemory: Record<templateId, Record<varName, string>>`.
- R6. Var values are written to memory after each successful generation (on-complete, not on every keystroke).
- R7. When the generator loads a template, var fields are pre-filled in this priority order: **user memory → template defaults → empty**.
- R8. Switching between presets that use the **same template** does not clear or change var values.
- R9. Switching to a preset that uses a **different template** loads memory/defaults for the new template. Values from the previous template are NOT transferred.

**Clear Affordance**

- R10. No dedicated clear control is needed. Users clear a var by selecting the field content and deleting it; the next successful generation saves the empty value to memory, replacing the previous remembered value.

## Success Criteria

- A user who fills in `BRAND_NAME = "MyBrand"` and generates can reload the page, select the same template, and see `"MyBrand"` pre-filled.
- A first-time user who selects a template with defined defaults sees those defaults pre-filled without having typed anything.
- Switching between two presets using different templates loads the correct memory/defaults for each, with no bleed-over between them.
- Switching between two presets using the same template preserves the user's current var values unchanged.

## Scope Boundaries

- No cross-template var transfer: a var named `BRAND_NAME` in Template A does not auto-populate `BRAND_NAME` in Template B.
- No per-preset memory: the storage key is `templateId` only, not `templateId + presetId`.
- Memory is not editable in Settings; only defaults are editable there. Memory is managed by using the generator.
- No "bulk clear memory" UI in this iteration. The × button per field is sufficient.
- No "Set as default from Generator" flow (bypassed in favor of the Settings-first approach).

## Key Decisions

- **R2-1 + R2-4 combined**: The two features are implemented together because they define a single coherent priority chain (defaults → memory → input). Doing one without the other leaves a gap.
- **templateId-only key**: Vars are semantically tied to a template's variable structure, not to any particular preset. Users who run the same template across multiple presets share memory — this is the common case.
- **Auto-detect vars in Settings**: Template defaults are defined via auto-extracted var fields in the prompt editor. No manual JSON entry; no "Set from Generator" button. The prompt text is the authoritative source for which vars exist.
- **Write memory on generation, not on keystroke**: Avoids persisting incomplete in-progress values; only values that were actually submitted persist.

## Dependencies / Assumptions

- Zustand `persist` middleware is already wired in `ui-store.ts`. `varMemory` storage requires either adding the field to the existing store or creating a separate `varMemory-store.ts`. The existing store holds only UI preferences (`rawMode`, `editorFontSize`, `darkMode`); the right home for user-input data is a planning-time decision.
- `extractTemplateVariables()` from `application/prompt/renderer.ts` is the authoritative function for parsing `{{VAR}}` tokens. The defaults section in Settings must use the same function to stay in sync with runtime behavior.
- A Drizzle migration is needed to add `customVariableDefaults` to the `prompt_templates` table.
- `promptTemplateSchema`, `promptTemplateCreateSchema`, and `promptTemplateUpdateSchema` in `src/domain/schemas/template.ts` all require the new optional field. This propagates to `TemplateForm` type inference in `prompt-templates-panel.tsx`.

## Outstanding Questions

### Deferred to Planning

- [Affects R3][Technical] What Drizzle migration strategy handles existing template rows cleanly (nullable column or column with empty-object default)?
- [Affects R5][Technical] Should `varMemory` live in the existing `ui-store.ts` (simpler) or a dedicated `varMemory-store.ts` (cleaner separation of UI preferences vs. user data)?

## Next Steps

→ `/ce:plan` for structured implementation planning

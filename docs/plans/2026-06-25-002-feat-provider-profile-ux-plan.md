---
title: "feat: Provider Profile UX Optimization"
type: feat
status: completed
date: 2026-06-25
deepened: 2026-06-25
---

# feat: Provider Profile UX Optimization

## Overview

Three friction points in the current provider configuration UX:

1. **Selection resets on reload** — `providerProfileId` is pure React `useState`; every page reload returns to the default preset's provider, losing the user's manual selection.
2. **No per-kind smart defaults** — creating a new profile requires manually looking up the correct base URL, model name, and whether an API key is needed for each ProviderKind.
3. **Connection test gives weak feedback** — the Test button works but only shows error text below the form; no visual distinction between success/failure, no loading state, no status indicator on the profile card itself.

This plan addresses all three with frontend-only changes (no DB migrations).

## Problem Frame

Users configure multiple provider profiles (OpenAI, Anthropic, Ollama, OpenRouter, etc.) and switch between them for different content types. The current UX forces them to re-select on every reload, manually fill in known-good base URLs and model names, and rely on plain-text error output to diagnose connection issues.

The backend is already complete: CRUD API, connection test endpoint (`POST /api/provider-profiles/[id]/test`), application service `testProviderProfile()`, and per-provider `listModels()` adapters.

## Requirements Trace

- R1. Selected provider profile persists across page reloads (per-browser, localStorage-backed)
- R2. Creating a new profile auto-fills sensible `baseUrl` and `model` defaults per `ProviderKind`
- R3. Connection test shows clear visual success/failure state (spinner, green check, red X, model count)
- R4. Generator workspace selector shows only `enabled` profiles
- R5. Profile cards in settings show live connection status badge after testing
- R6. Generator workspace refreshes its profile list when returning from settings (bootstrap stale-data prevention — side effect of R1/R4; without it a profile created in settings would not appear in the selector, and a persisted ID could reference a deleted profile)

## Scope Boundaries

- No DB schema change for "default provider profile" — `isDefault` concept stays on `GenerationPreset`, not on `ProviderProfile`
- No per-profile temperature/max-tokens override in the generator (that lives in presets)
- No bulk test or batch operations
- No auto-test on profile save (keeps save path fast)
- Connection status is session-local only (not persisted to DB)
- No implementation for `clearApiKey` field in update schema (deferred to future clear-key affordance)

## Context & Research

### Relevant Code and Patterns

- **Zustand store pattern**: `src/presentation/store/var-memory-store.ts` — `create<State>()(persist(..., { name: "..." }))` with `"use client"` directive
- **Zustand store with simple flags**: `src/presentation/store/use-ui-store.ts` — simpler state shape, same pattern
- **Provider profiles panel**: `src/presentation/settings/provider-profiles-panel.tsx` — RHF with `editingId` toggle, `useWatch`, `fetchJson` for API calls, Lucide icons
- **per-kind auto-detect pattern**: `src/presentation/settings/prompt-templates-panel.tsx` — `useWatch` + `useEffect` + 400ms debounce for reactive field logic (similar to what we need for per-kind defaults)
- **Generator workspace**: `src/presentation/generation/generator-workspace.tsx` — `useState` for `providerProfileId`; pre-flight test already wired; profiles passed from bootstrap
- **API wrapper**: `src/presentation/lib/api.ts` — `testProviderProfile(id)` already exists. Current TypeScript return type is `{ ok: boolean; message: string }` — note: `models?` is present in the HTTP response body at runtime (the application service returns it) but is absent from the TypeScript wrapper type; Unit 4 must fix this
- **Bootstrap flow**: `src/app/api/bootstrap` — single GET loads all profiles; generator uses on mount only (no live sync)
- **Lucide icons available**: `Loader2`, `CheckCircle2`, `XCircle`, `Circle` — import from `lucide-react`

### Institutional Learnings

- Empty/whitespace guard on Zustand `setVar` (from `var-memory-store.ts`) — not directly applicable here, but the store pattern is the direct model
- No `docs/solutions/` entries specifically about provider UX

### External References

- None required — Zustand v5 `persist` pattern is well-established in the repo

## Key Technical Decisions

- **Persist via Zustand store, not DB**: Adding `isDefault` to the `provider_profiles` table would require a migration, backend changes, and sync logic. A Zustand `persist` store is per-browser (localStorage), which is the right granularity for "last used provider" selection. Same approach as `useUiStore` for dark mode. Tradeoff: selection is per-device, not account-level — acceptable for a local-first tool.

- **Per-kind defaults as inline constants in the panel**: No external consumers of this data. Keeping the `PROVIDER_DEFAULTS` map local to `provider-profiles-panel.tsx` avoids premature extraction. If a config panel ever needs them elsewhere, extracting is cheap.

- **Connection test UI: local state map, not a store**: Test status (`idle | testing | ok | error`) is session-ephemeral UI state — not worth persisting. `Record<profileId, "idle" | "testing" | "ok" | "error">` in component state is the right scope.

- **Filter disabled from generator selector**: `profiles.filter(p => p.enabled)` before rendering the `<NativeSelect>`. If the persisted `selectedProfileId` points to a now-disabled or deleted profile, silently fall back to the default preset's profile and clear the store — no error shown to user.

- **Bootstrap refresh on tab focus**: Bootstrap data is loaded once on mount with no live sync. If the user edits/adds profiles in settings then returns to the generator, the `<NativeSelect>` shows stale profiles and the pre-flight test can fire against an ID that no longer exists. Fix: add a `visibilitychange` event listener in the workspace that re-calls `loadBootstrap()` when `document.visibilityState === "visible"`. This covers both the stale-selector and the pre-flight-on-deleted-profile risks in one change. Tradeoff: one extra API call per tab-switch — acceptable for a local-first tool with a fast SQLite bootstrap.

- **Pre-flight guard before test**: The existing pre-flight test effect fires whenever `providerProfileId` changes, with only `.catch(() => null)` for error handling. Before calling `testProviderProfile(id)`, verify the ID is present in the currently-loaded `bootstrap.providerProfiles`. If not found (deleted between bootstrap and selection), skip the test and surface a visible "Profile not found — please refresh" message rather than silently swallowing a 404.

- **`apiKey` conditional visibility — clear value, not unregister**: `apiKey` is `z.string().optional()` in `providerProfileCreateSchema`, so Zod will not throw validation errors if the field is hidden. Safe approach: call `form.setValue("apiKey", "")` when `requiresApiKey === false` (clears stale value on kind change) rather than `form.unregister`. No `superRefine` needed — the schema already handles optionality correctly.

- **Per-kind defaults apply only to new profiles**: When editing an existing profile and changing ProviderKind, do NOT auto-overwrite `baseUrl`/`model` fields — the user likely has working values.

## Open Questions

### Resolved During Planning

- **Should auto-fill trigger on kind change when editing?** No — only for new profiles (`editingId === null`). Editing is user-owns-the-values territory.
- **Should disabled profiles be hidden from generator selector or shown with a warning?** Hidden. Users explicitly disabled them; showing them with a warning adds noise and false choices.
- **Store persistence scope?** Per-browser (localStorage). Account-level sync is out of scope.
- **`apiKey` field conditional hide — use `unregister` or `setValue`?** `form.setValue("apiKey", "")` is sufficient. `apiKey` is already `z.string().optional()` in `providerProfileCreateSchema`, so the field being present in the DOM does not force validation. No `unregister` or `superRefine` required.
- **`clearApiKey` field in `providerProfileUpdateSchema`**: This field is declared in the schema but never consumed by the settings panel UI or API client. It is out of scope for this plan — document as a future "clear API key" affordance if needed.

### Deferred to Implementation

- **Exact Lucide icon for "testing" state**: `Loader2` with `animate-spin` is the standard pattern — verify it's used similarly elsewhere in the codebase before choosing.
- **`ProviderValidationResult` usability**: Check if `ProviderValidationResult` from `src/domain/schemas/provider.ts` is exportable and usable as a type alias — note this schema currently omits `models?` too, so it may need updating alongside the api.ts wrapper.
- **`visibilitychange` listener cleanup**: Confirm the listener is removed in the useEffect cleanup function to avoid duplicate handlers on hot-reload in development.
- **Pre-flight effect `bootstrap` dependency**: When the existence guard is added to the pre-flight useEffect (which already runs on `providerProfileId` change), `bootstrap` becomes a logical dependency. Either add `bootstrap` to the effect's dep array, or read it via `useRef` to satisfy `react-hooks/exhaustive-deps` without triggering redundant test runs on every bootstrap refresh.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

**State flow after this plan:**

```
localStorage["post-generator-provider"]
  ↓
useProviderStore { selectedProfileId }
  ↓
generator-workspace.tsx
  → on mount (bootstrap loaded):
      validate selectedProfileId ∈ enabledProfiles (bootstrap list)
      → valid:   use selectedProfileId
      → invalid: fallback to defaultPreset.providerProfileId, clearSelectedProfile()
  → on visibilitychange (tab regains focus): re-call loadBootstrap()
      → re-validates selectedProfileId against fresh profile list
  → pre-flight effect (on providerProfileId change):
      guard: profile ID must exist in bootstrap.providerProfiles → else show error, skip test
  → on manual select: setSelectedProfile(id)
  → render: profiles.filter(p => p.enabled) → <NativeSelect>

provider-profiles-panel.tsx
  → testStatus: Record<string, "idle"|"testing"|"ok"|"error">  (local state)
  → testMessage: Record<string, string>  (local state)
  → PROVIDER_DEFAULTS: Record<ProviderKind, { baseUrl?, model?, requiresApiKey }>
  → watch("providerKind") + editingId===null → reset baseUrl/model to defaults
  → requiresApiKey===false → form.setValue("apiKey", "") + hide apiKey field
```

## Implementation Units

- [x] **Unit 1: `useProviderStore` Zustand persist store**

**Goal:** Introduce a localStorage-backed store for the user's selected provider profile.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Create: `src/presentation/store/provider-store.ts`
- Test: `src/tests/unit/provider-store.test.ts`

**Approach:**
- State shape: `{ selectedProfileId: string | null }`
- Actions: `setSelectedProfile(id: string)`, `clearSelectedProfile()`
- `persist` name: `"post-generator-provider"`
- Add `"use client"` directive at top (same as `var-memory-store.ts`)
- No guards needed on `setSelectedProfile` — any string (including empty) is a valid profile ID at this layer; validation happens in the consuming component

**Patterns to follow:**
- `src/presentation/store/var-memory-store.ts` — exact structure

**Test scenarios:**
- Happy path: `setSelectedProfile("profile-abc")` → `selectedProfileId` equals `"profile-abc"`
- Happy path: `clearSelectedProfile()` → `selectedProfileId` is `null`
- Happy path: initial state → `selectedProfileId` is `null`
- Edge case: `setSelectedProfile` called twice in sequence → second value wins

**Verification:**
- 4 unit tests pass
- `localStorage["post-generator-provider"]` key appears after `setSelectedProfile` is called

---

- [x] **Unit 2: Wire `useProviderStore` into Generator Workspace**

**Goal:** Replace volatile `useState` for `providerProfileId` with the persisted store; filter disabled profiles from the selector.

**Requirements:** R1, R4, R6

**Dependencies:** Unit 1

**Files:**
- Modify: `src/presentation/generation/generator-workspace.tsx`
- Test: `src/tests/unit/generator-workspace.test.ts` (update existing if present, or note integration coverage)

**Approach:**
- Import `useProviderStore` from `@/presentation/store/provider-store`
- **Timing constraint**: read from `useProviderStore` only *inside* the bootstrap `.then()` / after `setBootstrap(data)` succeeds — not at component mount before data arrives. Reading before bootstrap loads would trigger the pre-flight guard against an empty profile list and flash a false "Profile not found" error.
- After bootstrap loads: read `useProviderStore.getState().selectedProfileId`; check it exists in `profiles.filter(p => p.enabled)` (where `profiles` is from the freshly-loaded bootstrap data `bootstrap.providerProfiles`); if valid → `setProviderProfileId(storedId)`; if not → use `defaultPreset.providerProfileId`, call `clearSelectedProfile()`
- On `<NativeSelect>` onChange: call `useProviderStore.getState().setSelectedProfile(newId)` alongside existing `setProviderProfileId(newId)`
- Compute `enabledProfiles = profiles.filter(p => p.enabled)` and pass only those to the selector
- Add `visibilitychange` listener in a useEffect: when `document.visibilityState === "visible"`, re-call `loadBootstrap()` to refresh the profile list (handles settings changes in another tab). Remove listener in cleanup.
- **Pre-flight guard**: In the existing pre-flight useEffect (which calls `testProviderProfile`), add an existence check against `bootstrap?.providerProfiles`; if ID not found, skip the test and surface a visible "Profile not found — please refresh" message using the existing `preflightError` state slot in the workspace (the one that already renders below the Provider Override selector). See `generator-workspace.tsx` lines ~104-113 for the current pre-flight structure.

**Patterns to follow:**
- `src/presentation/generation/generator-workspace.tsx` (existing useEffect/bootstrap structure, lines ~80-93)
- `src/presentation/store/var-memory-store.ts` (accessing store from component with `getState()`)

**Test scenarios:**
- Happy path: persisted profile ID matches an enabled profile → that profile is pre-selected on mount
- Edge case: persisted ID references a disabled profile → falls back to default preset's profile; store cleared
- Edge case: persisted ID references a deleted profile (not in list) → falls back to default; store cleared
- Happy path: user selects a new profile via selector → store's `selectedProfileId` updates
- Integration: pre-flight effect skips `testProviderProfile` when profile ID not in bootstrap list → shows "Profile not found" error message

**Verification:**
- Select a non-default profile → reload page → same profile selected
- Disable a profile that was selected → reload → falls back gracefully
- Add a profile in settings → switch tabs to generator → new profile appears in selector (bootstrap refreshed via `visibilitychange`)

---

- [x] **Unit 3: Per-kind Smart Defaults in Provider Profiles Panel**

**Goal:** Auto-fill `baseUrl` and `model` when selecting a `ProviderKind` for a new profile.

**Requirements:** R2

**Dependencies:** None (independent UI change)

**Files:**
- Modify: `src/presentation/settings/provider-profiles-panel.tsx`
- Test: `src/tests/unit/provider-profiles-panel.test.ts` (new, for `PROVIDER_DEFAULTS` map completeness)

**Approach:**
- Define `PROVIDER_DEFAULTS` constant at the top of the file (module-level, not inside the component) mapping each `ProviderKind` to `{ baseUrl?: string; model?: string; requiresApiKey: boolean }`
  - `openai`: baseUrl `https://api.openai.com`, model `gpt-4o-mini`, requiresApiKey `true`
  - `anthropic`: no baseUrl, model `claude-sonnet-4-6`, requiresApiKey `true`
  - `gemini`: no baseUrl, model `gemini-2.0-flash`, requiresApiKey `true`
  - `ollama`: baseUrl `http://localhost:11434`, model `llama3.2`, requiresApiKey `false`
  - `openrouter`: baseUrl `https://openrouter.ai/api/v1`, model `openrouter/auto`, requiresApiKey `true`
  - `openai-compatible`: baseUrl `http://localhost:8000`, model ``, requiresApiKey `false`
- `useWatch({ control, name: "providerKind" })` already available — add a `useEffect` on it
- In the effect: if `editingId === null` (new profile only), call `form.setValue("baseUrl", defaults.baseUrl ?? "")`, `form.setValue("model", defaults.model ?? "")`, and if `!defaults.requiresApiKey` also call `form.setValue("apiKey", "")` to clear any stale value
- Conditionally render the `apiKey` field based on `defaults.requiresApiKey` — the `form.setValue("apiKey", "")` call above already clears the value when hiding, so Zod validation is not a concern (`apiKey` is `z.string().optional()` and an empty string satisfies it). No `form.unregister` needed.
- On `cancelEdit()` / switching to create mode: defaults apply for the initial `CREATE_DEFAULTS` (already set to openai-compatible)

**Patterns to follow:**
- `src/presentation/settings/prompt-templates-panel.tsx` — `useWatch` + `useEffect` auto-detect pattern (lines ~51-64)

**Test scenarios:**
- Happy path: switch kind to `ollama` on new profile → `baseUrl` updates to `http://localhost:11434`, apiKey field hidden
- Happy path: switch kind to `anthropic` → `baseUrl` cleared, apiKey field shown
- Happy path: switch kind to `openai` → model filled to `gpt-4o-mini`
- Edge case: switch kind while editing existing profile (`editingId !== null`) → fields NOT overwritten

**Verification:**
- Creating new profile: change ProviderKind → see correct defaults fill in immediately
- apiKey field visibility toggles correctly per kind
- Editing existing profile: ProviderKind change does not destroy user's configured values

---

- [x] **Unit 4: Connection Test UI Polish**

**Goal:** Add visual status indicators (spinner, success, failure) to test button and profile cards.

**Requirements:** R3, R5

**Dependencies:** None (isolated UI change)

**Files:**
- Modify: `src/presentation/settings/provider-profiles-panel.tsx`
- Modify: `src/presentation/lib/api.ts` (update `testProviderProfile` return type to include `models?: { id: string; name?: string }[]` — current type is `{ ok: boolean; message: string }` but the HTTP response already includes `models` at runtime from the application service)

**Approach:**
- Add local state: `testStatus: Record<string, "idle" | "testing" | "ok" | "error">` (useState, not Zustand — session-ephemeral)
- Add local state: `testMessage: Record<string, string>`
- `handleTest(id)` updates `testStatus[id] = "testing"` → calls `testProviderProfile(id)` → sets `"ok"` or `"error"` with message; if `result.models?.length`, show count in message
- Test button: replace current implementation with icon-only states:
  - `"idle"` / no entry: `<FlaskConical>` (or keep existing label)
  - `"testing"`: `<Loader2 className="animate-spin" />`
  - `"ok"`: `<CheckCircle2 className="text-green-500" />`
  - `"error"`: `<XCircle className="text-red-500" />`
- Profile card: add a small status dot next to the profile name — `<Circle>` filled gray/green/red based on `testStatus[id]`
- When a profile enters edit mode (`loadForEdit`): reset `testStatus[id]` to `"idle"` so stale success doesn't mislead
- Success message example: `"Connected · 42 models"` or `"Connected"` if no models returned

**Patterns to follow:**
- `src/presentation/settings/provider-profiles-panel.tsx` — existing `remove()` async handler shape (try/catch with `notify()`)
- `src/presentation/settings/prompt-templates-panel.tsx` — similar loading pattern if present

**Test scenarios:**
- Happy path: Test button clicked → Loader2 spinner shown → success → CheckCircle2 shown, message "Connected · N models" (or "Connected")
- Error path: test fails → XCircle shown, error message displayed
- Edge case: edit button clicked after successful test → status dot resets to idle/gray
- Happy path: two profiles tested independently → each shows its own status (no cross-contamination)

**Verification:**
- Test button shows clear spinner, then green/red icon after response
- Profile card status dot matches test result
- Editing a profile resets its status indicator

## System-Wide Impact

- **Interaction graph**: `useProviderStore` is a pure Zustand store with no subscriptions outside generator workspace. `visibilitychange` listener triggers `loadBootstrap()` re-call on tab focus — same bootstrap path as mount, no new API surface.
- **Error propagation**: Invalid persisted `selectedProfileId` → silent fallback to default. Pre-flight test against missing profile ID → visible "Profile not found" error (was previously silent 404). Connection test failures in settings panel → local `testStatus` state only, no API error propagation.
- **State lifecycle risks**: Profile deleted while its ID is persisted in store → `visibilitychange` refresh + mount fallback both resolve this. Store not auto-cleared on profile delete from settings panel (acceptable; next workspace visit or tab-switch self-heals).
- **API surface parity**: No new API endpoints. All four units are frontend-only. Existing `/test` endpoint contract unchanged.
- **Integration coverage**: Generator workspace profile selection → pre-flight test → generation flow is unchanged in behavior; only persistence layer and guard added around the existing pre-flight.
- **Unchanged invariants**: `BootstrapData` API response shape unchanged. Provider profile CRUD API unchanged. `GenerationPreset.isDefault` logic unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Persisted `selectedProfileId` becomes stale (profile deleted or disabled) | Fallback validation in Unit 2 mount logic + `visibilitychange` bootstrap refresh both guard against this |
| Pre-flight test fires against a deleted/missing profile ID (404 currently silenced) | Unit 2 adds existence check before calling `testProviderProfile`; show visible error if ID not found |
| `PROVIDER_DEFAULTS` model names become outdated | Defaults are "suggested starting point" convenience only — user can override. Not a correctness risk; no validation depends on them. |
| `apiKey` conditional hide sends stale key for `requiresApiKey: false` providers | `form.setValue("apiKey", "")` called in the kind-change effect when `requiresApiKey === false`; field is `optional()` so no Zod surprise |
| `visibilitychange` handler not cleaned up on unmount | Confirm `removeEventListener` in useEffect cleanup function at implementation time |

## Documentation / Operational Notes

- No DB migration required
- No environment variable changes
- localStorage key added: `post-generator-provider` — can be cleared by user via DevTools or the Storage tab in settings (if that feature exists)

## Sources & References

- Provider profile schema: `src/domain/schemas/provider.ts`
- Provider profiles panel: `src/presentation/settings/provider-profiles-panel.tsx`
- Generator workspace: `src/presentation/generation/generator-workspace.tsx`
- Existing Zustand stores: `src/presentation/store/use-ui-store.ts`, `src/presentation/store/var-memory-store.ts`
- API wrapper (testProviderProfile): `src/presentation/lib/api.ts`
- Bootstrap API: `src/app/api/bootstrap/`
- Prompt templates panel (useWatch + useEffect pattern): `src/presentation/settings/prompt-templates-panel.tsx`

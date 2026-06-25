# Changelog

## 0.0.2 — 2026-06-25

### Added
- **Language switching (EN / 简体中文)**: UI now fully supports English and Simplified
  Chinese. A language switcher in the header writes a `NEXT_LOCALE` cookie and
  refreshes server components; all 11 presentation components use `next-intl`
  translation keys with 162-key parity across both message files.
- **Dark mode flash prevention**: an inline script in `<head>` reads localStorage
  before first paint and applies `.dark` on the root element, eliminating the
  white flash on hard reload when dark mode is active.

### Fixed
- **OpenAI-compatible providers**: the API key field now appears in the provider
  form (was hidden), and `/v1` is no longer doubled when a base URL already ends
  with `/v1` (e.g. `https://host/v1/chat/completions` instead of `/v1/v1/`).
- **Locale switcher UX**: rapid double-click is guarded by an `isRefreshing` flag;
  buttons are disabled during the RSC refresh window. Skeleton renders both labels
  as neutral (no premature active highlight before hydration).

### Changed
- `NextIntlClientProvider` wraps the app body; `<html lang>` is now dynamic
  (`lang="en"` or `lang="zh-CN"` based on active locale).
- Zustand `ui-store` extended with `locale` field; cookie-to-store sync on mount
  recovers from localStorage-cleared divergence.
- Three sequential `await` calls in `RootLayout` parallelized via `Promise.all`
  (reduces server component TTFB).
- Language switcher buttons carry `aria-current` for the active locale;
  pre-mount skeleton marked `aria-busy` for screen readers.

### Tests
- Added `i18n-request.test.ts` (12 cases), `ui-store.test.ts` (4 cases),
  `language-switcher.test.tsx` (6 cases), and extended
  `openai-compatible-adapter.test.ts` (9 cases). Total: 172 tests across 32 files.

## 0.0.1 — First preliminary release

First baseline that is considered usable. This release consolidates the codebase
into a single canonical tree and hardens the core input → generate → archive
pipeline. No new AI features.

### Consolidation
- Single canonical source tree (`src/`); removed the unused `packages/` monorepo
  staging area and `pnpm-workspace.yaml`. The app runs as one Next.js process with
  same-origin `/api/*` routes.
- Landed the generator refactor: `generator-workspace` split into
  `input-panel` / `output-panel` / `config-sidebar`, with `bootstrap-store`,
  `preview-prompt`, and centralized `DEFAULT_ENABLED_STEPS`.

### Reliability & security
- Secrets: deleting or overwriting an API key now invalidates the in-memory cache,
  so a revoked key can no longer be read back within the cache TTL.
- Providers: requests are bounded by a configurable timeout
  (`POST_GENERATOR_PROVIDER_TIMEOUT_MS`, default 120s); timeouts and network errors
  surface as retryable error events instead of hanging.
- Providers: malformed or non-object stream chunks now surface an observable error
  instead of being silently dropped.
- History: a selection that leaves the list (after search or delete) resets instead
  of going stale; out-of-order fetches can no longer overwrite newer results.

### Type safety & tests
- Extracted a shared `notFound()` storage helper (was duplicated across four repos).
- Added coverage for the secrets cache contract, the `useApi` race guard, the
  `useGenerationStream` SSE state machine, provider timeout / chunk hardening, and a
  cancel integration test. End-to-end test verifies generate, export, and history
  search on `src/`.

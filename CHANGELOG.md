# Changelog

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

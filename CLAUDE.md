# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm start:clean    # Recommended: reclaim port 3000 (kill strays) → migrate → build → start ONE instance
pnpm dev:clean      # Reclaim port 3000, then start dev server (HMR)
pnpm dev            # Start dev server (does NOT reclaim the port — can stack duplicates if 3000 is busy)
pnpm build && pnpm start  # Production build — closest to real behavior for browser testing
pnpm test           # Run all unit + integration tests (Vitest)
pnpm test:watch     # Vitest watch mode
pnpm test:e2e       # Playwright e2e tests
pnpm typecheck      # TypeScript type check (no emit)
pnpm lint           # ESLint

# Run a single test file
pnpm vitest run src/tests/unit/provider-service.test.ts

# Database
pnpm db:migrate     # Apply migrations
pnpm db:seed        # Seed default Provider / Template / Preset data
```

### Node version & the native SQLite module

This project is pinned to **Node 22.22.3** (`.nvmrc`, `.node-version`, `package.json#engines`).
`.npmrc` sets `use-node-version=22.22.3`, so every `pnpm` command uses that Node regardless
of the shell PATH — important on machines with multiple Node installs.

`better-sqlite3` ships a native addon compiled against a specific Node ABI
(`NODE_MODULE_VERSION`). If it's loaded under a different Node major, it crashes with
`compiled against a different Node.js version using NODE_MODULE_VERSION X`. To prevent this,
every script runs `scripts/ensure-native.mjs` first — it loads the addon and, only on a real
ABI mismatch, runs `pnpm rebuild better-sqlite3` automatically (no-op when already valid).
If you ever hit the error manually, the fix is `pnpm rebuild better-sqlite3` under Node 22.

## Architecture

This is a **local-first AI content generation app** built on Next.js 15 App Router. The architecture follows a strict layered dependency rule: `presentation → app (API routes) → application → domain ← infrastructure`.

### Layer Map

| Layer | Path | Role |
|---|---|---|
| Domain | `src/domain/` | Zod schemas, port interfaces (contracts), pipeline step IDs |
| Application | `src/application/` | Use-case services — orchestrate storage + providers, no HTTP |
| Infrastructure | `src/infrastructure/` | Implements ports: SQLite repos, LLM adapters, secrets, logging |
| API Routes | `src/app/api/` | Next.js route handlers — thin wrappers calling application services |
| Presentation | `src/presentation/` | React components + Zustand stores + client-side API client |
| Plugins | `src/plugins/pipeline/` | Pipeline step implementations (registered separately from domain) |

**Critical rule**: Application services import from `@/infrastructure/*` directly (no DI container). Tests swap the storage layer via `setStorage()` from `@/infrastructure/storage/sqlite-storage`.

### Key Data Flow

1. **Generation** (streaming): `POST /api/generations` → `streamGeneration()` in `application/generation/generation-service.ts` → pulls pipeline steps from `plugins/pipeline/registry.ts` → calls `LLMProviderAdapter.generate()` from `infrastructure/providers/` → SSE stream back to client.

2. **Pipeline steps** (`plugins/pipeline/registry.ts`): `buildContext → renderPrompt → applyControls → cleanContent → formatOutput`. Steps are pure `PipelineStep<I,O>` objects. `PIPELINE_STEPS` constants in `domain/pipeline-steps.ts` are the single source of truth for step IDs.

3. **Bootstrap**: On app load, the client calls `GET /api/bootstrap` which returns all ProviderProfiles, PromptTemplates, GenerationPresets, and pipeline step metadata in one shot. The `useBootstrapStore` (Zustand) caches this with a 30-second SWR-style staleness window.

4. **Quality scoring**: `POST /api/generations/[id]/score` → `application/quality/judge-service.ts` — LLM-as-Judge, five dimensions.

### Provider Adapter Pattern

All LLM providers extend `BaseAdapter` (`infrastructure/providers/base-adapter.ts`) and implement `LLMProviderAdapter` port (`domain/ports/provider.ts`). The registry (`infrastructure/providers/registry.ts`) maps `ProviderKind` to adapter instances (lazy-initialized, cached). Adding a new provider = add adapter class + register in the registry.

### Storage Port Pattern

`StoragePort` (`domain/ports/storage.ts`) defines repository interfaces. `createSqliteStorage()` returns the concrete implementation. Tests inject a fresh in-memory SQLite instance per run via `setStorage()`. Never import repo classes directly in application code — always go through `getStorage()`.

### API Key Security

API keys are never stored in the database. `saveSecret()` (`infrastructure/security/secrets.ts`) encrypts with AES-256-GCM and writes to `~/.post-generator/secrets/`. The DB stores only a `apiKeyRef` (file reference) and `keyMasked` (display). The presentation layer only ever sees the masked label.

### Internationalization

`next-intl` with EN / zh-CN. Message files in `messages/`. Use `useTranslations()` in client components. The locale is persisted via `NEXT_LOCALE` cookie and stored in `useUiStore`.

### Client State

Four Zustand stores in `src/presentation/store/`:
- `useBootstrapStore` — server config cache (provider profiles, templates, presets)
- `useUiStore` — persisted UI prefs (dark mode, font size, locale, raw mode)
- `useProviderStore` — selected provider profile ID
- `useVarMemoryStore` — remembered custom variable values between sessions

### Test Patterns

- Unit/integration tests live in `src/tests/unit/`. Vitest runs in `node` environment.
- `src/tests/setup.ts` sets `POST_GENERATOR_HOME` to a temp dir and `POST_GENERATOR_SECRET_KEY` to a test key — no real filesystem state bleeds between tests.
- Tests seed real SQLite state via application service calls (`createProviderProfile`, etc.), not direct DB writes.
- Mock fetch with `vi.spyOn(global, "fetch")` for provider HTTP calls.
- Components tests use `@testing-library/react` with jsdom (env overridden per test file with `@vitest-environment jsdom`).

### Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `POST_GENERATOR_HOME` | `~/.post-generator` | Data root (DB, secrets, exports, logs) |
| `POST_GENERATOR_SECRET_KEY` | auto-derived | AES-256-GCM key (64-char hex) |
| `POST_GENERATOR_DB_PATH` | `{HOME}/post-generator.db` | SQLite path override |
| `POST_GENERATOR_PROVIDER_TIMEOUT_MS` | `120000` | Streaming provider timeout |
| `POST_GENERATOR_COMPLETION_TIMEOUT_MS` | `60000` | One-shot completion timeout |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Used in OpenRouter Referer header |

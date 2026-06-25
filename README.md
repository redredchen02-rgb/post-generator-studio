# Post Generator Studio

Local-first AI content generation engine built as a modular Next.js monolith.

## Install

```bash
pnpm install
cp .env.example .env.local
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open http://localhost:3000.

## Configure Providers

Provider Profiles live in Settings. API keys are encrypted on the server and stored as secret files under `~/.post-generator/secrets` by default. The browser only receives masked key labels, never the full value.

Seeded cloud providers start disabled until a key is configured. Ollama is seeded as a local default and uses `http://localhost:11434`.

## Prompt Templates

Prompt Templates are versioned and use controlled variables such as `{{TITLE}}`, `{{EVENT_SUMMARY}}`, `{{DATE}}`, `{{TIME}}`, and `{{LOCALE}}`. Add templates from Settings or seed them with `pnpm db:seed`.

## Provider Adapters

Add a provider by implementing `LLMProviderAdapter`, registering it in `src/infrastructure/providers/registry.ts`, and adding tests. UI and application services call the registry, not provider-specific APIs.

## Pipeline Steps

Pipeline steps implement `PipelineStep` and are registered in `src/plugins/pipeline/registry.ts`. The v1 pipeline builds context, renders prompts, generates content, cleans content, formats output, and persists the final generation.

## Storage

Set `POST_GENERATOR_HOME` to override the default data root. The default structure is:

```txt
~/.post-generator/
  post-generator.db
  secrets/
  exports/
  logs/
  backups/
```

## Export

Generated articles can be exported as `.md` or `.txt` from the main workspace or via `/api/generations/:id/export`.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

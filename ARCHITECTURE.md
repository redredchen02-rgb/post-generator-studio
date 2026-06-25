# Architecture

Post Generator Studio is a modular monolith. It keeps deployment simple while preserving boundaries that can be extracted later.

```txt
src/app              Next.js routes and route handlers
src/presentation     React UI, forms, layout, local UI state
src/application      Use cases and orchestration
src/domain           Entities, schemas, ports, business rules
src/infrastructure   SQLite, encryption, files, provider adapters
src/plugins          Pipeline step registry
src/lib              Shared utilities
src/tests            Unit, integration, and e2e tests
```

Dependency direction:

```txt
Presentation -> Application -> Domain <- Infrastructure
```

React components do not call LLM providers or SQLite directly. API routes validate input, call application services, and return sanitized responses. Provider adapters normalize vendor-specific APIs into `GenerationEvent` streams. Prompt rendering is centralized and uses a fixed variable syntax without JavaScript execution.

Sensitive provider keys are stored outside profile rows. Profiles hold an `apiKeyRef`; encrypted secret files live under the configured local data root. Logs and API responses mask secret-looking values.

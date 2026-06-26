# Contributing to Post Generator Studio

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js >= 22
- pnpm >= 10

### Getting Started

```bash
# Clone the repository
git clone https://github.com/redredchen02-rgb/post-generator-studio.git
cd post-generator-studio

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local

# Initialize database
pnpm db:migrate

# Seed default data
pnpm db:seed

# Start development server
pnpm dev
```

Open http://localhost:3000.

## Development Workflow

### Branch Naming

- `feat/*` — New features
- `fix/*` — Bug fixes
- `docs/*` — Documentation changes
- `refactor/*` — Code refactoring
- `test/*` — Adding or updating tests

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
feat: add new feature
fix: resolve bug
docs: update documentation
refactor: improve code structure
test: add test coverage
chore: maintenance tasks
```

### Code Style

- TypeScript strict mode
- ESLint with next/core-web-vitals config
- Prettier for formatting (configured in .prettierrc)

Run linting before committing:

```bash
pnpm lint
pnpm typecheck
```

### Testing

```bash
# Unit and integration tests
pnpm test

# Watch mode
pnpm test:watch

# E2E tests (requires running dev server)
pnpm test:e2e
```

### Database Changes

When modifying the schema:

1. Update `src/infrastructure/storage/schema.ts`
2. Add migration in `src/infrastructure/storage/migrations.ts`
3. Run `pnpm db:generate` to create migration SQL
4. Test with `pnpm db:migrate`

## Architecture

The project follows a modular monolith architecture with clear layer boundaries:

```
Presentation → Application → Domain ← Infrastructure
```

- **Domain**: Pure types and business rules (zero external dependencies)
- **Application**: Use case orchestration (depends on Domain ports)
- **Infrastructure**: External integrations (implements Domain ports)
- **Presentation**: React UI ( communicates via API client)

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed documentation.

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes following the code style guidelines
3. Add tests for new functionality
4. Ensure all tests pass: `pnpm test`
5. Update documentation if needed
6. Create a pull request with a clear description

### PR Description Template

```markdown
## Summary

Brief description of changes.

## Changes

- List of specific changes

## Verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` succeeds
```

## Adding New Providers

1. Create adapter in `src/infrastructure/providers/`
2. Extend `BaseAdapter` and implement `buildRequest()` + `parseChunk()`
3. Register in `src/infrastructure/providers/registry.ts`
4. Add enum value in `src/domain/schemas/enums.ts`
5. Add tests

## Adding New Pipeline Steps

1. Create step in `src/plugins/pipeline/`
2. Register in `src/plugins/pipeline/registry.ts`
3. Add constant in `src/domain/pipeline-steps.ts`
4. Add tests

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- Include reproduction steps for bugs
- Specify your environment (OS, Node version, browser)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

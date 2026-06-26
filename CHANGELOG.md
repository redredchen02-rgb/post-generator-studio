# Changelog

All notable changes to Post Generator Studio will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- SQLite busy_timeout for concurrent write safety
- ReactMarkdown XSS prevention with allowedElements whitelist
- Content-Security-Policy header added
- SSE ReadableStream reader lock properly released
- LIKE wildcard escaping in search input
- CodeMirror handleUpdate callback stability (diff ref)
- Variant token batch buffering for streaming performance
- Escape key conflict with CodeMirror editor
- VariantCard metrics memoization
- React.memo added to InputPanel, OutputPanel, ConfigSidebar
- QualityBadge memo penetration (handleScore useCallback)
- CodeMirror dynamic import for code splitting
- DELETE responses unified to 204 No Content
- PATCH Zod schema validation for generations

### Security
- Gemini API key via header instead of URL query parameter
- Export API no longer exposes server filesystem path
- Logger x-api-key and x-goog-api-key redaction patterns
- Security response headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, CSP)

### Performance
- Token batch update mechanism (100ms flush) for streaming
- CodeMirror lazy loading via next/dynamic
- optimizePackageImports for lucide-react and Radix UI

## [0.0.2] - 2026-06-25

### Added
- Quality scoring system (LLM-as-Judge with 5 dimensions)
- Multi-variant comparison (Unit 10)
- Version history UI with autosave and version compare (Unit 11)
- CodeMirror 6 editor with selection rewrite toolbar
- Outline-first generation workflow
- Custom template variable memory
- Generation drafts with working draft and snapshots
- Request-level controls (tone, length, audience, custom instruction)
- Outline panel with drag-and-drop reordering
- Quality badge component
- Shared constants (DEFAULT_TEMPERATURE, DEFAULT_MAX_TOKENS)

### Changed
- Upgraded to Next.js 15, React 19, TypeScript 5
- Migrated to Zustand 5 with persist middleware
- Updated README with current features and project structure
- Updated ARCHITECTURE.md with quality scoring and editor modules

### Fixed
- Clipboard API error handling
- setTimeout cleanup in language-switcher and settings-workspace
- URL.revokeObjectURL timing issue
- deleteGenerationRecord response check
- isErrorPayload structural validation
- OpenRouter dynamic Referer from NEXT_PUBLIC_APP_URL
- Server error messages in English for i18n

## [0.0.1] - 2026-06-20

### Added
- Initial release
- Multi-provider support (OpenAI, Anthropic, Gemini, Ollama, OpenRouter)
- Prompt template management with versioning
- Generation presets
- Streaming generation with SSE
- API key encryption (AES-256-GCM)
- Multi-language interface (EN / zh-CN)
- Dark mode support
- Generation history with export (Markdown / Plain text)
- Real-time text metrics (word count, reading time, ARI readability)

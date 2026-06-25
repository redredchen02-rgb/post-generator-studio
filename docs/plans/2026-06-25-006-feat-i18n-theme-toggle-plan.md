---
title: "feat: Add i18n Language Switching (EN / ZH-CN) + Dark Theme Toggle Verification"
type: feat
status: active
date: 2026-06-25
---

# feat: Add i18n Language Switching (EN / ZH-CN) + Dark Theme Toggle Verification

## Overview

Two complementary UX features: (1) language switching between English and Simplified Chinese using next-intl without URL routing; (2) verify the existing dark/light theme toggle is production-ready (the infrastructure already exists). Both preferences persist via localStorage (Zustand) across sessions.

## Problem Frame

The app currently hardcodes English nav labels while `<html lang="zh-CN">` — an inconsistency signaling Chinese support was intended but never completed. Users who prefer Chinese have no way to switch. The dark mode infrastructure (CSS variables, Tailwind `darkMode: ["class"]`, Zustand store, `ThemeToggle` component) is fully implemented but needs end-to-end verification for hydration flash on reload.

## Requirements Trace

- R1. A language switcher in the header lets users toggle between EN and ZH-CN
- R2. All visible static UI strings are externalized to translation files; no hardcoded display text remains in presentation components
- R3. Locale preference persists across sessions (localStorage via Zustand + cookie for SSR)
- R4. Dark/light theme toggle persists across sessions with no flash of wrong theme on reload
- R5. `<html lang>` attribute accurately reflects the active locale on every server render

## Scope Boundaries

- Two locales only: `en` (default) and `zh-CN`
- No URL-based routing (no `/en/…` or `/zh-CN/…` path changes)
- AI-generated content output is not translated — only static UI chrome
- No date/number locale formatting (not needed for this app)
- No new API routes or database changes

## Context & Research

### Relevant Code and Patterns

- Dark mode (complete): `src/presentation/components/theme-toggle.tsx` — hydration-safe, reads/writes Zustand
- UI state store: `src/presentation/store/ui-store.ts` — Zustand with `persist`, pattern to extend for locale
- Layout entry: `src/app/layout.tsx` — server component, `suppressHydrationWarning` already on `<html>`
- Nav strings: `"Generate"`, `"History"`, `"Settings"` hardcoded in `layout.tsx` (desktop + mobile)
- Workspace components: `src/presentation/generation/`, `src/presentation/settings/`, `src/presentation/history/`

### External References

- next-intl without i18n routing: https://next-intl.dev/docs/getting-started/app-router/without-i18n-routing

## Key Technical Decisions

- **next-intl over react-i18next**: next-intl is the idiomatic choice for Next.js App Router; provides `getTranslations()` for server components and `useTranslations()` for client components with no extra Context setup
- **Cookie-based locale for SSR**: `getRequestConfig` reads `NEXT_LOCALE` cookie so the server can set the correct `<html lang>` and load the right messages bundle before sending HTML — eliminates mismatch between SSR and client
- **Zustand locale state mirrors cookie**: `LanguageSwitcher` writes both the cookie (for next server render) and Zustand (for immediate client state); on locale change call `router.refresh()` to re-run server components and pick up new messages bundle without full page reload
- **English as default locale**: nav labels are already English; `en` becomes the canonical default, `zh-CN` is the alternative
- **Message namespaces**: one namespace per major page/feature (Navigation, Generation, Output, Config, History, Settings, Common) for clarity without deep nesting

## Open Questions

### Resolved During Planning

- **Reload vs. refresh on locale change**: Use `router.refresh()` from `next/navigation` — re-runs server components and picks up new cookie/messages without a full browser reload, better UX than `window.location.reload()`
- **Theme flash prevention**: Current `ThemeToggle` applies `.dark` class in `useEffect` after mount, which can cause a brief flash. Address in Unit 6 with an inline `<script>` in `<head>` that reads localStorage synchronously before first paint.

### Deferred to Implementation

- **Exact translation keys for all workspace components**: requires reading each component to catalog strings; implementation-time discovery
- **Whether `router.refresh()` is sufficient**: if next-intl requires a hard reload to swap message bundles in some edge case, fall back to `window.location.reload()`

## Implementation Units

```
Unit 1 ──► Unit 2
           │
           ▼
Unit 3 ──► Unit 4 ──► Unit 5

Unit 6 (independent, can run in parallel with any unit)
```

- [ ] **Unit 1: Install and configure next-intl**

**Goal:** Wire up next-intl in "without i18n routing" mode so server and client components can consume locale-aware messages.

**Requirements:** R1, R3, R5

**Dependencies:** None

**Files:**
- Modify: `package.json` (add `next-intl@^3`)
- Create: `src/i18n/request.ts`
- Modify: `next.config.ts`

**Approach:**
- Install `next-intl@^3.22` (first version with confirmed Next.js 15 support)
- `src/i18n/request.ts`: implement `getRequestConfig` that reads `NEXT_LOCALE` cookie via `cookies()` from `next/headers`; fall back to `'en'` if absent or invalid
- `next.config.ts`: wrap existing export with `createNextIntlPlugin('./src/i18n/request.ts')`

**Patterns to follow:**
- `next.config.ts` existing structure (check for existing plugins before wrapping)

**Test scenarios:**
- Happy path: `next dev` starts without errors after adding plugin
- Happy path: `getLocale()` in a server component returns `'en'` when no cookie is set
- Happy path: `getLocale()` returns `'zh-CN'` when `NEXT_LOCALE=zh-CN` cookie is present
- Error path: invalid locale value in cookie (e.g., `'fr'`) → falls back to `'en'` without throwing

**Verification:**
- TypeScript compiles with no errors after install
- `getLocale()` call in layout resolves correctly for both locales

---

- [ ] **Unit 2: Create translation message files**

**Goal:** Externalize all hardcoded UI strings into `messages/en.json` and `messages/zh-CN.json` with matching key structure.

**Requirements:** R2

**Dependencies:** Unit 1 (establishes locale names)

**Files:**
- Create: `messages/en.json`
- Create: `messages/zh-CN.json`

**Approach:**
- Audit all presentation components for hardcoded display strings; catalog into namespaces before writing files
- Namespace structure:
  ```
  Navigation:  generate | history | settings | appName
  Generation:  title | submit | inputPlaceholder | ...
  Output:      copy | copied | clear | rawToggle | ...
  Config:      provider | preset | template | variables | ...
  History:     title | empty | deleteConfirm | ...
  Settings:    providers | presets | templates | storage | save | ...
  Common:      loading | error | cancel | delete | confirm | ...
  ```
- `en.json` captures current English strings
- `zh-CN.json` provides Simplified Chinese equivalents with same exact key structure

**Test scenarios:**
- Happy path: both files parse as valid JSON without errors
- Edge case: all keys present in `en.json` exist in `zh-CN.json` (no missing keys at runtime)

**Verification:**
- Key sets are identical between both files (diff shows only values, not keys)
- No presentation component still contains hardcoded display text after Unit 5 is complete

---

- [ ] **Unit 3: Add locale to UI store + Language Switcher component**

**Goal:** Extend the Zustand ui-store with locale state and build a header toggle component.

**Requirements:** R1, R3

**Dependencies:** Unit 1

**Files:**
- Modify: `src/presentation/store/ui-store.ts`
- Create: `src/presentation/components/language-switcher.tsx`

**Approach:**
- Add `locale: 'en' | 'zh-CN'` (default `'en'`) and `setLocale(value: 'en' | 'zh-CN')` to `UiState` in ui-store; persists automatically via existing `post-generator-ui` key
- `LanguageSwitcher`: client component; on click: (1) set cookie `NEXT_LOCALE` with 365-day expiry via `document.cookie`, (2) call `setLocale()`, (3) call `router.refresh()` from `useRouter()`
- Visual: text-based toggle `EN / 中文` styled like existing nav links (same `className` as `NavLink`), with the active locale highlighted via `text-foreground` vs `text-muted-foreground`
- Include hydration guard (same `mounted` check pattern as `ThemeToggle`) to prevent SSR/client mismatch

**Patterns to follow:**
- `src/presentation/components/theme-toggle.tsx` — `mounted` guard pattern, same button styling
- `src/presentation/store/ui-store.ts` — Zustand persist action pattern

**Test scenarios:**
- Happy path: clicking `中文` sets cookie, updates store, page refreshes with zh-CN strings visible
- Happy path: clicking `EN` restores English; preference survives hard browser reload
- Edge case: first visit with no cookie renders `EN` as active without hydration warning
- Integration: LanguageSwitcher and ThemeToggle coexist in header without layout shift

**Verification:**
- Locale persists after hard reload
- `document.cookie` includes `NEXT_LOCALE=zh-CN` after switching to Chinese

---

- [ ] **Unit 4: Update layout.tsx with NextIntlClientProvider**

**Goal:** Wire layout.tsx to serve the correct messages bundle and set `<html lang>` from the active locale on each server render.

**Requirements:** R1, R3, R5

**Dependencies:** Units 1–3

**Files:**
- Modify: `src/app/layout.tsx`

**Approach:**
- Make `RootLayout` async; add `const locale = await getLocale()` and `const messages = await getMessages()` from `next-intl/server`
- Replace hardcoded `lang="zh-CN"` with `lang={locale}`
- Wrap `<body>` children with `<NextIntlClientProvider messages={messages}>`
- Add `<LanguageSwitcher />` to desktop header (alongside existing `<ThemeToggle />`) and to mobile bottom nav
- `NavLink` labels (`"Generate"`, `"History"`, `"Settings"`) will be translated in Unit 5

**Patterns to follow:**
- Existing `ThemeToggle` placement and sizing in header

**Test scenarios:**
- Happy path: `document.documentElement.lang` equals `'en'` or `'zh-CN'` matching active locale
- Happy path: `NextIntlClientProvider` correctly provides messages to all nested client components
- Integration: layout renders correctly with both locale values; no console errors about missing provider

**Verification:**
- HTML source in browser shows `<html lang="en">` or `<html lang="zh-CN">` correctly
- No TypeScript errors in layout.tsx after changes

---

- [ ] **Unit 5: Apply `useTranslations()` to all presentation components**

**Goal:** Replace every hardcoded display string in presentation components with `t()` translation calls.

**Requirements:** R2

**Dependencies:** Units 2–4

**Files:**
- Modify: `src/app/layout.tsx` (NavLink/MobileNavLink labels)
- Modify: `src/presentation/generation/generator-workspace.tsx`
- Modify: `src/presentation/generation/input-panel.tsx`
- Modify: `src/presentation/generation/output-panel.tsx`
- Modify: `src/presentation/generation/config-sidebar.tsx`
- Modify: `src/presentation/settings/settings-workspace.tsx`
- Modify: `src/presentation/settings/provider-profiles-panel.tsx`
- Modify: `src/presentation/settings/generation-presets-panel.tsx`
- Modify: `src/presentation/settings/prompt-templates-panel.tsx`
- Modify: `src/presentation/settings/storage-panel.tsx`
- Modify: `src/presentation/history/history-workspace.tsx`

**Approach:**
- Server components (layout.tsx): use `import { getTranslations } from 'next-intl/server'` and `const t = await getTranslations('Navigation')`
- Client components (all workspace/panel components): add `"use client"` if not present, use `import { useTranslations } from 'next-intl'` and `const t = useTranslations('Namespace')`
- Do not translate: API request bodies, database column names, AI prompt template content, user-entered text values, or developer-facing error details

**Patterns to follow:**
- next-intl: `const t = useTranslations('Navigation')` → `{t('generate')}`

**Test scenarios:**
- Happy path: switching to zh-CN and refreshing shows all static UI text in Chinese
- Happy path: switching back to en shows all static UI text in English
- Edge case: components rendered conditionally (modals, error states, empty states) also switch locale correctly
- Integration: no English strings visible when locale is zh-CN (full UI sweep)

**Verification:**
- Full manual sweep of all pages in zh-CN mode: zero untranslated English strings
- Full manual sweep of all pages in en mode: zero untranslated Chinese strings
- TypeScript compilation passes with no errors

---

- [ ] **Unit 6: Verify dark/light theme toggle — fix hydration flash if present**

**Goal:** Confirm the existing `ThemeToggle` is production-ready; add flash prevention if the wrong theme briefly appears on reload.

**Requirements:** R4

**Dependencies:** None (independent)

**Files:**
- Modify: `src/presentation/components/theme-toggle.tsx` (only if fixes needed)
- Modify: `src/app/layout.tsx` (add inline script to `<head>` if flash is confirmed)

**Approach:**
- **Test first**: hard-reload the app with `darkMode: true` saved in localStorage; observe whether light theme flashes before hydration
- **Current risk**: `ThemeToggle` applies `.dark` class in `useEffect` after mount; this is after first paint, causing a potential light flash
- **Fix if needed**: add a minimal inline `<script>` tag in `<head>` that synchronously reads `localStorage.getItem('post-generator-ui')` and applies `document.documentElement.classList.add('dark')` before React hydrates — this is the standard pattern used by `next-themes` and similar libraries
- **Script must be minimal**: raw JS only, no framework dependencies; must not throw if localStorage is unavailable (wrap in try/catch)

**Patterns to follow:**
- Standard Tailwind dark mode flash prevention script (same approach as next-themes source)

**Test scenarios:**
- Happy path: hard-reload with dark mode saved → dark theme visible immediately, no light flash
- Happy path: ThemeToggle shows Sun icon in dark mode, Moon icon in light mode (correct icons)
- Edge case: first visit (no localStorage entry) → light mode renders without error
- Edge case: localStorage unavailable (private browsing) → defaults to light mode gracefully

**Verification:**
- No visible theme flash on hard reload in either dark or light mode
- Toggle persists after browser restart

## System-Wide Impact

- **Unchanged invariants:** All API routes, database schemas, Zustand stores except `ui-store.ts`, AI generation pipeline, and server-side logic are untouched
- **State lifecycle risks:** Locale state in Zustand (localStorage) and cookie must stay in sync — if a user clears localStorage but cookie persists, SSR and client may disagree on locale briefly until next page load writes both
- **Integration coverage:** All client components using `useTranslations()` must be inside `NextIntlClientProvider`; components rendered outside (e.g., via portals or error boundaries) will throw at runtime
- **API surface parity:** No API surface changes

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Missing translation keys cause runtime throw | next-intl throws clearly with key name; run full UI sweep in both locales after Unit 5 |
| next-intl version incompatibility with Next.js 15 | Use `next-intl@^3.22`; check release notes for Next.js 15 compatibility |
| `router.refresh()` insufficient to swap messages (rare edge case) | Fall back to `window.location.reload()` if messages don't update after refresh |
| Dark mode flash not fixable with inline script | Verify localStorage key name matches Zustand `persist` name `"post-generator-ui"` exactly in inline script |
| String catalog incomplete (missed components) | Do a grep for common Chinese characters and hardcoded English labels after Unit 5 |

## Sources & References

- Related code: `src/presentation/components/theme-toggle.tsx`
- Related code: `src/presentation/store/ui-store.ts`
- Related code: `src/app/layout.tsx`
- External: next-intl without i18n routing — https://next-intl.dev/docs/getting-started/app-router/without-i18n-routing

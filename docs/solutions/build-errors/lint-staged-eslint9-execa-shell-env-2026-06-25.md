---
title: lint-staged Pre-Commit Hook Fails with ENOENT When Using Environment Variable Prefix
module: lint-staged / ESLint pre-commit integration
date: 2026-06-25
problem_type: build_error
component: tooling
severity: medium
symptoms:
  - "next lint --fix --file fails in lint-staged under Node.js 22"
  - "eslint --fix exits with error because ESLint 9 defaults to flat config but project uses .eslintrc.json"
  - "ESLINT_USE_FLAT_CONFIG=false eslint --fix fails with ENOENT because lint-staged uses execa (not a shell), so env-var prefix is treated as the command name"
root_cause: config_error
resolution_type: tooling_addition
related_components:
  - development_workflow
tags:
  - lint-staged
  - eslint-9
  - flat-config
  - execa
  - shell-wrapper
  - pre-commit
  - node-22
  - eslintrc
---

# lint-staged Pre-Commit Hook Fails with ENOENT When Using Environment Variable Prefix

## Problem

The lint-staged pre-commit hook silently failed on every commit attempt in a Next.js/TypeScript project using ESLint 9 with a legacy `.eslintrc.json` config. The hook exited with code 1, blocking all commits until the root cause — a mismatch between how lint-staged spawns processes and how shell environment variable assignment works — was identified and worked around.

## Symptoms

- `husky - pre-commit script failed (code 1)` on every commit attempt
- `✖ Task failed to spawn: ESLINT_USE_FLAT_CONFIG=false eslint --fix` with error code `ENOENT`
- `Could not find config file. eslint.config.js` from ESLint 9 when invoked without the env var workaround
- `Error: Could not find a Node.js version` or similar Node.js 22 compatibility errors when using `next lint --fix --file`

## What Didn't Work

- **`"*.{ts,tsx}": "next lint --fix --file"`** — Failed due to Node.js 22 compatibility issues in the `next lint` CLI path. The `--file` flag also requires a full path argument and does not compose cleanly with lint-staged's file-passing behavior.

- **`"*.{ts,tsx}": "eslint --fix"`** — Failed because ESLint 9 defaults to flat config mode and looks for `eslint.config.js`. The project uses `.eslintrc.json` (legacy config format), which ESLint 9 does not discover in flat config mode.

- **`"*.{ts,tsx}": "ESLINT_USE_FLAT_CONFIG=false eslint --fix"`** — Failed with `ENOENT` because lint-staged uses `execa` internally to spawn processes **without a shell**. When there is no shell, the `VAR=value command` shell syntax does not work — `execa` interprets the entire string `ESLINT_USE_FLAT_CONFIG=false eslint --fix` as a literal executable name and tries to find that binary on `PATH`. No such binary exists, so the OS returns "No such file or directory" (`ENOENT`).

## Solution

**Step 1.** Create `scripts/eslint-fix.sh` at the project root:

```bash
#!/bin/sh
ESLINT_USE_FLAT_CONFIG=false ./node_modules/.bin/eslint --fix "$@"
```

Make it executable:

```bash
chmod +x scripts/eslint-fix.sh
```

**Step 2.** Update the `lint-staged` config in `package.json`:

```json
"lint-staged": {
  "*.{ts,tsx}": "sh scripts/eslint-fix.sh"
}
```

The `"$@"` at the end of the script receives the staged file paths that lint-staged appends automatically when invoking the command.

## Why This Works

lint-staged uses [execa](https://github.com/sindresorhors/execa) to spawn linter processes. `execa` does **not** invoke a shell by default — it calls `execvp` directly with the first token as the executable name and the rest as arguments. This means the POSIX shell convention of prefixing a command with `VAR=value` is unavailable: there is no shell to parse and apply the assignment before exec.

The fix works by delegating the env var assignment into a wrapper shell script (`scripts/eslint-fix.sh`). When lint-staged runs `sh scripts/eslint-fix.sh <files>`, `sh` is a real executable that `execa` can find and launch. `sh` then starts a shell session, which processes the `ESLINT_USE_FLAT_CONFIG=false` assignment natively before calling `eslint`. The `"$@"` token expands to the staged file arguments passed in by lint-staged, so ESLint receives the correct file list.

Setting `ESLINT_USE_FLAT_CONFIG=false` switches ESLint 9 back to legacy config resolution mode, where it discovers `.eslintrc.json` instead of requiring `eslint.config.js`.

## Prevention

- **Check whether your task runner uses `execa` (no-shell) before reaching for `VAR=value` prefixes.** Tools that use `execa` without `shell: true` — including lint-staged, many Jest runners, and similar Node.js-based hooks — cannot process shell syntax in the command string. When in doubt, prefer a wrapper script.

- **Prefer wrapper scripts over inline env var tricks for hook commands.** A one-line `#!/bin/sh` script is explicit, debuggable (`bash -x scripts/eslint-fix.sh`), and version-controlled. It also survives tool upgrades that might change how the host runner spawns processes.

- **When migrating to ESLint 9 in a project with `.eslintrc.*`, audit every place ESLint is called** (CI, pre-commit hooks, editor integrations) and add `ESLINT_USE_FLAT_CONFIG=false` to each call site or set it globally until migration to flat config is complete.

- **Document the legacy config intent** with a comment or README note so future contributors know `.eslintrc.json` is intentional and not an oversight that should be replaced with `eslint.config.js`.

---
title: "refactor: Complete structural optimization — errorResponse layer separation + controller cleanup"
type: refactor
status: completed
date: 2026-06-26
---

# refactor: Complete structural optimization — errorResponse layer separation + controller cleanup

## Overview

工作樹中有一組結構性優化已部分完成，但處於 broken 狀態：`errorResponse` 已從
`application/errors.ts` 移出並建立了 `api/api-helpers.ts`，但 18 個 route 文件的 import
尚未更新，導致 TypeScript 編譯失敗。同時 `streamToProvider` 的 `finally` 中存在
`releaseGenerationController` 的雙重調用（外層 `streamGeneration` 也有 `finally`）。

本計畫：完成這兩項未完成的收尾工作，恢復 `pnpm typecheck` + `pnpm test` 全部通過。

## Problem Frame

當前工作樹（`fix/reliability` 分支，未 push）包含：

- `src/app/api/api-helpers.ts` — 新增，含正確分層的 `errorResponse`（在 API 層）
- `src/application/errors.ts` — 已移除 `errorResponse`，只剩 `toAppError`
- `src/application/index.ts`、`domain/index.ts`、`infrastructure/index.ts` — 已刪除 barrel 文件

但 **18 個 route.ts** 仍從 `@/application/errors` import `errorResponse`（已不存在），
TypeScript 編譯必然失敗。此外 `streamToProvider` 的 `finally` 重複調用了
`releaseGenerationController`（外層 `streamGeneration` 的 `finally` 已是清理點），
屬於冗余代碼。

## Requirements Trace

- R1. `pnpm typecheck` 零錯誤
- R2. `pnpm test` 全部通過（目標：457 個測試）
- R3. `errorResponse` 只在 `src/app/api/` 層定義，Application 層對 Next.js 框架無感知
- R4. `releaseGenerationController` 在每次 generation 生命周期中只調用一次

## Scope Boundaries

- 不重構 GeneratorWorkspace（高風險，獨立 PR）
- 不移動 `plugins/pipeline` → `application/pipeline`（路徑影響面大，獨立評估）
- 不改動任何業務邏輯，只修正 import 路徑和移除冗余調用
- 不修改測試邏輯（mock 路徑已正確，i18n keys 已確認存在）

## Context & Research

### Relevant Code and Patterns

| 文件 | 現狀 |
|---|---|
| `src/app/api/api-helpers.ts` | ✅ 已建立，含正確 `errorResponse` |
| `src/application/errors.ts` | ✅ 只剩 `toAppError`，框架無關 |
| `src/app/api/generations/[id]/score/route.ts` | ✅ 已更新 import |
| 其餘 18 個 route.ts | ❌ 仍 import from `@/application/errors` |
| `src/application/generation/generation-service.ts` line 323-324 | ❌ `streamToProvider` finally 重複 release |
| `src/tests/unit/logger-redact.test.ts` | ⚠️ 新增，未 tracked，需確認通過 |

### Import 遷移完整清單（18 個文件）

以下文件需將 `import { errorResponse } from "@/application/errors"` 改為
`import { errorResponse } from "@/app/api/api-helpers"`：

```
src/app/api/bootstrap/route.ts
src/app/api/provider-profiles/route.ts
src/app/api/provider-profiles/[id]/route.ts
src/app/api/provider-profiles/[id]/test/route.ts
src/app/api/completions/route.ts
src/app/api/generation-presets/route.ts
src/app/api/generation-presets/[id]/route.ts
src/app/api/prompt-templates/route.ts
src/app/api/prompt-templates/[id]/route.ts
src/app/api/prompt-templates/preview/route.ts
src/app/api/generations/[id]/route.ts
src/app/api/generations/[id]/cancel/route.ts
src/app/api/generations/[id]/drafts/route.ts
src/app/api/generations/[id]/export/route.ts
src/app/api/storage/backup/route.ts
src/app/api/storage/backup/[id]/route.ts
src/app/api/storage/restore/route.ts
```

**特殊處理：**
`src/app/api/generations/route.ts` 同時 import `{ errorResponse, toAppError }` from `@/application/errors`：
- `errorResponse` → 改為 `@/app/api/api-helpers`
- `toAppError` → 保留 from `@/application/errors`（這是正確的，Application 層函數）

### Double Release 分析

`streamGeneration`（外層 generator）的 `try/catch/finally`（line 226-227）：
```
finally { releaseGenerationController(generation.id) }
```

`streamToProvider`（內層 generator，被 `yield*` 調用）的 `try/catch/finally`（line 323-324）：
```
finally { releaseGenerationController(generation.id) }
```

當 `yield*` 完成後，兩個 `finally` 都會執行 → double call。`Map.delete` 幂等不 crash，
但語義不清晰且違反「單一清理點」原則。

**修正**：移除 `streamToProvider`'s `finally` 中的 `releaseGenerationController` 調用。
理由：`streamToProvider` 是私有 helper，由 `streamGeneration` 負責生命周期管理；
`streamToProvider` 中 error/return 路徑的 `// finally will release the controller`
注釋已說明這是預期行為。

## Key Technical Decisions

- **`toAppError` 保留在 `application/errors.ts`**：`api-helpers.ts` 本身 import 它，是正確的跨層引用（API 層依賴 Application 層）
- **移除 `streamToProvider` 的 release 而非 `streamGeneration`**：外層函數控制生命周期，內層函數只負責 streaming 邏輯

## Open Questions

### Resolved During Planning

- i18n keys `Generation.statusReady`：確認存在於 `messages/en.json:48` 和 `messages/zh-CN.json:48`，無需修改
- `api-routes.test.ts` mock 路徑：已正確使用 `@/application/prompt/prompt-service`，無需修改
- `logger-redact.test.ts`：新增測試，邏輯完整，只需確認測試通過

### Deferred to Implementation

- GeneratorWorkspace 拆分（優化 E）：高風險，建議獨立 PR 評估
- `plugins/pipeline` → `application/pipeline` 移動（優化 F）：需先確認 CI scripts 和 external tooling 無引用

## Implementation Units

- [ ] **Unit 1: 完成 errorResponse import 遷移（18 個 route 文件）**

**Goal:** 所有 API route 從正確位置 import `errorResponse`，恢復 TypeScript 編譯

**Requirements:** R1, R3

**Dependencies:** 無（`api-helpers.ts` 已存在）

**Files:**
- Modify: 上方清單中的 18 個 `route.ts` 文件
- Modify（特殊）: `src/app/api/generations/route.ts`

**Approach:**
- 對 17 個純 `errorResponse` import 的文件：直接替換 from 路徑
- 對 `generations/route.ts`：拆分為兩行 import（`errorResponse` from `api-helpers`，`toAppError` from `application/errors`）
- 可以用 `sed` 批量替換，再手動處理 `generations/route.ts` 的特殊情況

**Test scenarios:**
- Happy path: `pnpm typecheck` 零錯誤後立即通過
- Integration: `pnpm test` 中所有 route 的 error handler 測試仍通過（errorResponse 行為不變）
- Edge case: `generations/route.ts` 的 `toAppError` import 不被誤刪

**Verification:**
- `pnpm typecheck` 無任何 TS2305（Module has no exported member 'errorResponse'）錯誤

---

- [ ] **Unit 2: 移除 streamToProvider 冗余的 releaseGenerationController 調用**

**Goal:** `releaseGenerationController` 在 generation 生命周期中只調用一次（由 `streamGeneration` 的 `finally` 負責）

**Requirements:** R4

**Dependencies:** 無

**Files:**
- Modify: `src/application/generation/generation-service.ts`（line 323-324）

**Approach:**
- 移除 `streamToProvider` 的 `finally` 塊中的 `releaseGenerationController(generation.id)` 調用
- 若移除後 `finally` 塊為空，將其整個移除
- 更新 line 274 和 296 的注釋 `// finally will release the controller` → 刪除或改為更精確的說明（可選，不強求）

**Test scenarios:**
- Happy path: 正常完成 generation → `releaseGenerationController` 在 `streamGeneration` finally 中調用一次
- Error path: provider 返回 error → `streamToProvider` catch 處理 → `streamGeneration` finally 仍調用一次
- Error path: cancel → controller.signal.aborted 分支 → `streamGeneration` finally 調用一次
- Integration: `pnpm test` 中 generation streaming 測試全部通過

**Verification:**
- `pnpm test` 無 generation-service 相關失敗
- 代碼審查確認 `releaseGenerationController` 在 `streamToProvider` 函數體內只剩 0 次調用

---

- [ ] **Unit 3: 最終驗證**

**Goal:** 確認所有測試通過、類型正確、新測試文件正常納入

**Requirements:** R1, R2

**Dependencies:** Unit 1, Unit 2

**Files:**
- Test: `src/tests/unit/logger-redact.test.ts`（確認通過）
- Test: `src/tests/unit/api-routes.test.ts`（確認 GET /api/bootstrap 不超時）

**Approach:**
- `pnpm typecheck`
- `pnpm test`
- 確認 `logger-redact.test.ts` 的 logger 模組在 test 環境中行為符合預期（使用 `console.info` spy）

**Test scenarios:**
- 全部 457 個測試通過
- 無 TypeScript 錯誤
- `GET /api/bootstrap` 在 api-routes.test.ts 中 10s 內完成

**Verification:**
- `pnpm test` 輸出 `457 passed` 或更多（`logger-redact.test.ts` 新增若干測試）
- `pnpm typecheck` 零錯誤

## System-Wide Impact

- **Interaction graph:** `errorResponse` 行為完全不變（只搬移定義位置），所有 route 的錯誤格式一致
- **Error propagation:** 不變
- **State lifecycle risks:** `releaseGenerationController` 調用次數減少為 1，`cancel-registry` 的 Map 不再被重複 delete（幂等安全但語義更清晰）
- **API surface parity:** 全部 route 統一使用 `@/app/api/api-helpers`，無例外
- **Unchanged invariants:** `toAppError` 仍在 `application/errors.ts`；`api-helpers.ts` 繼續引用它；HTTP 狀態碼映射邏輯不變

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| 遺漏某個 route 文件 | 遷移後立即跑 `pnpm typecheck`；TS 編譯會明確報告剩餘的 broken import |
| `generations/route.ts` import 拆分出錯 | 該文件特殊標記，手動處理後確認 `toAppError` 調用仍正常 |
| `logger-redact.test.ts` 在 vitest node 環境中 `console.info` spy 行為異常 | 確認 logger 使用 `console.info`；若 logger 內部有緩衝或格式化，需調整 test 的 spy 目標 |

## Sources & References

- Working tree diff: `git diff HEAD -- src/application/errors.ts`（確認 errorResponse 已移除）
- `src/app/api/api-helpers.ts`（已存在的正確 errorResponse 定義）
- `src/application/generation/generation-service.ts` line 226-228, 323-325（雙重 release 位置）
- 現有測試：`src/tests/unit/api-routes.test.ts` line 23（mock 路徑已正確）

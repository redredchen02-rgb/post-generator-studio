---
date: 2026-06-25
topic: comprehensive-iteration
---

# Post Generator Studio — 全面迭代

## Problem Frame

Monorepo 遷移（`packages/`）引入了幾個無聲功能回歸，同時代碼審計揭示了橫跨 Application / Infrastructure / Presentation 三層的類型安全漏洞、重複模式和測試盲區。與此同時，「自定義變量注入」這個核心功能從 UI 到服務端都有結構性缺口，導致帶有 `{{CUSTOM}}` 占位符的模板在預覽和生成時都會報錯。

本文件定義從當前狀態（v0.2.0）到下一個健壯版本的完整迭代範圍。

---

## Requirements

**P0：回歸修復（Monorepo 遷移後的功能損壞）**

- R1. 修復 `loadGenerations` 靜默丟棄 `search` 和 `offset` 參數的 bug。`packages/web/src/presentation/lib/api.ts` 的 `loadGenerations` 函數接收這些參數但只傳 `limit` 給 `client.listGenerations`，導致 History 頁的搜索框和分頁完全無效。
- R2. 修復 `abortRef` 死代碼：`use-generation-stream.ts` 的 `abortRef` 從未被設置為 AbortController，`cancel()` 的客戶端中斷邏輯無效。取消功能應可靠觸發服務端取消 API 調用。
- R3. 確認 E2E 測試（Playwright）在 Monorepo 遷移後仍可正常運行；若路徑失效則修復配置。

**P0：自定義變量端到端修復**

- R4. 修復自定義變量被完整鏈路截斷的問題：`generationRequestSchema`（Domain）、`client.streamGeneration`（SDK）、`streamGeneration` Application service 三處都缺少 `customVariables` 字段，導致所有帶有 `{{CUSTOM}}` 占位符的模板在生成時必定觸發 `TEMPLATE_VARIABLE_MISSING` 異常。
- R5. 修復模板預覽的自定義變量支持：`promptPreviewRequestSchema`（Domain）缺少 `customVariables` 字段，包含自定義變量的模板預覽返回 500 錯誤，而非顯示渲染結果。
- R6. `resolvePromptVariables`（`application/prompt/variables.ts`）應處理 `customVariables` map，與 Domain 層的 `customVariableDefaults` 字段已有的建模保持一致。

**P1：前端狀態 Bug**

- R7. 修復 Generator 鍵盤快捷鍵的 stale closure：`generator-workspace.tsx` 中 `bindings` useMemo 捕獲了 stale 的 `handleGenerate`（因為 `handleGenerate` 未用 `useCallback` 包裝），Ctrl+Enter 觸發時使用上次 `isGenerating` 改變時的舊 `title`/`eventSummary`。
- R8. 修復 History 頁的 stale `selected`：當搜索過濾或刪除某條 generation 後，`selected` 不自動重置為第一條，仍指向不在列表中的陳舊對象。
- R9. 修復 `useApi` 的競態條件：快速連續觸發 `load`（例如搜索 + 分頁 offset 同時改變）可能使較早的響應覆蓋較新的結果。應用 `AbortController` 或 ignore-stale 模式確保最新 fetch 的結果總是獲勝。
- R10. Provider Override selector 應只顯示 `enabled` 的 profile（計劃 R4 要求但未實現）：當前用戶可選中 disabled profile 並點擊 Generate，觸發可預防的錯誤。修復：在 `packages/web/src/app/(workspaces)/generator/generator-workspace.tsx` 中，將渲染 NativeSelect 的 `bootstrap?.providerProfiles.map(...)` 改為 `bootstrap?.providerProfiles.filter(p => p.enabled).map(...)`。

**P1：類型安全**

- R11. 消除所有 route handler 中的 `status as any`：`errorResponse` 返回 `number`，Hono `c.json()` 需要 `StatusCode`。調整 `errorResponse` 返回類型為 `StatusCode` 或在調用處做正確的類型轉換（非 `as any`）。
- R12. 修復 `wiring.ts` 中的 `kind as any`：`getProviderAdapter` 的 `kind` 參數應為 `ProviderKind` 而非 `string`，消除 `as any` 橋接。
- R13. Provider adapter 的 `parseChunk` 方法（Anthropic、Gemini、OpenAI-compatible）對 `unknown` 類型做未驗證的類型斷言（`raw as AnthropicEvent` 等）。應加入 guard 或 Zod 解析，讓 Provider 返回非預期結構時產生可觀測錯誤而非靜默錯誤行為。

**P1：重複模式消除**

- R14. 提取 `notFound()` 輔助函數：四個 repo 文件（`generation-repo`, `generation-preset-repo`, `provider-profile-repo`, `prompt-template-repo`）中一字不差地複製了 4 次，應提取到 `packages/infrastructure/src/storage/` 的共享工具文件。
- R15. 統一 route handler 的錯誤處理：22 個 route handler 重複相同的 `try/catch` 塊。使用 Hono 的 `app.onError` middleware 統一處理，消除重複。
- R16. 消除 `BootstrapData` 類型重複定義：`packages/sdk/src/client.ts`（規範來源）和 `packages/web/src/presentation/lib/api.ts` 都定義了完全相同的類型。修復：刪除 `api.ts` 中的本地定義，改為 `export type { BootstrapData } from '@postgen/sdk'`。
- R17. 統一 `api.ts` 和 `PostgenClient` 的調用路徑：`provider-profiles-panel.tsx` 直接調用 `fetchJson<ProviderProfile>(...)` 繞過 SDK client，與其他面板不一致，應改為通過 SDK client 調用。

**P2：功能完整性**

- R18. Generator 自定義變量 UI：當所選模板包含非標準 `{{VARIABLE}}` token 時，Generator 表單動態渲染對應的額外輸入欄。`extractTemplateVariables()` 已存在，只需讀取並渲染。（依賴 R4-R6 的後端修復已完成才有效果。）
- R19. Provider Profile 的 `clearApiKey` UI 入口：後端已完整實現（`provider-service.ts` 的 `deleteSecret` 調用、`provider-profile-repo.ts` 的 null 覆寫），`providerProfileUpdateSchema` 也已有 `clearApiKey` 字段。唯一缺失的是 UI：在 Settings 面板編輯現有 profile 時新增「清除 API Key」按鈕，點擊後發送 `PATCH { clearApiKey: true }` 到現有端點。無需後端變更。

**P3：測試覆蓋**

- R20. 為 `use-generation-stream.ts` 添加單元測試：此 hook 處理 6 種 SSE 事件類型、管理中斷狀態、累積 token，是最複雜的客戶端邏輯，且目前完全無測試覆蓋。
- R21. 為 `wiring.ts` 添加集成測試或 smoke test：依賴注入組裝代碼無測試，service 間連線錯誤不會被捕捉。
- R22. 補充 `provider-profile-repo.ts` 的 `clearApiKey` 三態邏輯測試（`null`/`undefined`/string 的嵌套三元邏輯）。
- R23. 補充生成取消的集成測試：驗證 `status === "cancelled"` 路徑影響 generation 狀態的完整流程。

---

## Success Criteria

- 所有 P0 問題（R1-R6）修復後，`pnpm test` 全部通過，History 搜索 + 分頁在瀏覽器中恢復正常工作，帶自定義變量的模板可預覽且可生成。
- P1 修復（R7-R17）後，TypeScript 嚴格模式無 `as any` 殘留（除已知 Hono StatusCode 的特定場合），Zustand / React hook 的 lint 規則無 exhaustive-deps 警告。
- P2 完成（R18-R19）後，用戶可在 Generator 中為自定義變量填值並生成。
- P3 完成（R20-R23）後，測試總數從 99 增長到 115+，`use-generation-stream` 有 ≥8 個測試。

---

## Scope Boundaries

- 不新增 AI 功能（LLM-as-Judge 評分框架、Prompt A/B 測試）— 屬於下一迭代
- 不做 `prompt_template_versions` 版本歷史 UI — 基礎設施存在，但 single-user 工具的 ROI 待評估
- 不遷移 `src/` → `packages/` 的剩餘文件（如果還有）— 不破壞現有 Monorepo 遷移成果
- 不添加 WebSocket / 長連接 — SSE 流式輸出已足夠

---

## Key Decisions

- **P0 優先於功能**：R1-R6 是回歸 bug，影響現有用戶的核心使用路徑（History 搜索、生成取消、自定義變量模板），必須在 P1/P2 之前完成。
- **自定義變量注入（R18）後置於後端修復（R4-R6）**：如果後端不支持 customVariables 傳遞，前端 UI 改動沒有意義。Backend → Frontend 順序執行。
- **R15 使用 Hono 中間件而非重構 handler**：保持 handler 簡單，錯誤處理的一致性通過框架機制強制，而非代碼規範。

---

## Dependencies / Assumptions

- 當前分支 `feat/provider-profile-ux` 的所有 Unit（1-4）已標記 `[x]`，假設已完整落地；R10 是該計劃 R4 的補完。
- `packages/` Monorepo 結構中，`packages/web` 通過 `NEXT_PUBLIC_API_URL` 調用 `packages/server`，兩者分離運行（`pnpm dev` 啟動兩個進程或 Next.js 同時承擔前後端）。

---

## Outstanding Questions

### Resolve Before Planning

- [影響 R2][用戶決策] 生成取消的預期行為是什麼？當前服務端通過 `CancelRegistry` 取消（發信號給 generator），客戶端的 `abortRef` 本意是同時中斷 HTTP 連接還是只通知服務端？確認這個語義才能正確修復 R2。

### Deferred to Planning

- [影響 R15][技術] Hono `app.onError` middleware 是否與現有的 `errorResponse()` helper 兼容，還是需要調整 `AppError` 的 serialization？需要確認 Hono 的錯誤中間件 API。
- [影響 R13][Needs research] `parseChunk` 的 `unknown` 驗證：是否用 Zod schema 解析（增加 bundle size 風險）還是手寫 type guard？每個 Provider 的 chunk 結構不同，需要逐個評估。
- [影響 R20][技術] `use-generation-stream.ts` 的測試需要 mock SSE 事件流，確認 Vitest 的 `ReadableStream` mock 支持程度。

---

## Next Steps

→ 解決「Resolve Before Planning」的問題後，執行 `/ce:plan` 進行結構化實施規劃

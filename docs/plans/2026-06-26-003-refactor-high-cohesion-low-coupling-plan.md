---
title: "refactor: Enforce High Cohesion / Low Coupling Across All Layers"
type: refactor
status: completed
date: 2026-06-26
deepened: 2026-06-26
---

# refactor: Enforce High Cohesion / Low Coupling Across All Layers

## Overview

全面掃描 codebase 後找出 8 個具體的內聚/耦合違規點，按 P1/P2/P3 分三波處理。P1 是有真實 bug 風險的層邊界違反（stale data、runtime undefined、繞過 port）；P2 是高衝擊的職責混合；P3 是長期維護負債。

## Problem Frame

架構定義了嚴格的依賴方向 `presentation → app routes → application → domain ← infrastructure`，但掃描發現：

- **Bootstrap 快取分裂**：`api.ts` 和 `bootstrap-store.ts` 各自維護一個快取，`refetch()` 實際上讀的是舊快取，設定更新後資料不刷新
- **API 路由繞過應用服務**：`/api/generations/[id]/drafts` 直接 import `getStorage()`，打破唯一例外原則
- **Pipeline registry 謊報**：`applyControlsStep` 存在但不在 `steps` 陣列，讓 bootstrap advertise 的步驟清單不完整
- **上帝組件**：`GeneratorWorkspace` 473 行，包辦 8 個不同職責，且有 reactive bypass 的 `.getState()` 讀取
- **提示詞構建邏輯在 presentation**：domain/application 關心的業務邏輯放在 `presentation/generation/editor/`
- **DocumentService 不一致**：唯一使用 class + 建構函式注入，其他 service 全是函式
- **Export 缺 Port**：唯一沒有 Port 抽象的持久化操作，直接讀 `fs`
- **無 lint 強制層邊界**：presentation 可以自由 import application 函式，無靜態防護

## Requirements Trace

- R1. 任何 settings mutation 後 bootstrap 資料必須真正刷新，不能讀舊快取
- R2. 所有 API 路由必須只透過 application service，不直接觸碰 storage port
- R3. Pipeline registry 是步驟的唯一來源，advertise 的步驟清單必須完整且一致
- R4. prompt 構建邏輯必須在 application 層，presentation 只負責呼叫
- R5. GeneratorWorkspace 的 store 讀取必須走 reactive selector，不繞過 React 訂閱
- R6. 所有 application service 遵循一致的函式模式（或一致的 class 模式）
- R7. Export 有 ExportPort 抽象，可在測試中替換
- R8. ESLint 規則靜態強制 presentation → application 的 import 邊界

## Scope Boundaries

- **不在此計劃**：功能增加、UI 改版、新 provider 支援
- **不在此計劃**：E2E 測試補充（屬於另一個計劃）
- **不動**：domain 層（已驗證無污染，保持現狀）
- **不動**：StoragePort / LLMProviderAdapter 介面定義（設計正確）
- **不動**：BaseAdapter 繼承鏈（設計正確）
- **不動**：四個 Zustand store 的互不 import 原則（已做好）

## Context & Research

### Relevant Code and Patterns

- `src/presentation/lib/api.ts:59-79` — 模組級 `bootstrapCache` 變數（需消滅）
- `src/presentation/store/bootstrap-store.ts:44-56` — Zustand `data` + `loadedAt` SWR 快取（保留，成為唯一快取）
- `src/app/api/generations/[id]/drafts/route.ts:5,21` — 直接 `import { getStorage }`（違規）
- `src/plugins/pipeline/registry.ts:57,95-99` — `applyControlsStep` 宣告但排除在 `steps` 陣列外
- `src/application/generation/generation-service.ts:130` — `applyControlsStep` 在此無條件執行
- `src/presentation/generation/generator-workspace.tsx:128,157,202` — `.getState()` 繞過 reactive
- `src/presentation/generation/editor/rewrite-actions.ts` — 業務 prompt 構建邏輯（應搬到 application）
- `src/application/content/document-service.ts` — 唯一的 class pattern service
- `src/application/export/export-service.ts:1-3` — 直接 import `fs`，無 port 抽象
- `src/presentation/lib/preview-prompt.ts` — 已有「browser-safe bridge」模式，可作為 R8 的基礎

### Institutional Learnings

- `docs/solutions/` 目前無架構相關記錄；本次重構完成後應補一份 `docs/solutions/best-practices/coupling-patterns.md`

### External References

- Next.js App Router 不支援 `useLayoutEffect` in server components；Zustand selector 訂閱是 client-only，`.getState()` 適合 event handler 中的「寫」操作，不適合「讀」
- `import/no-restricted-paths` (eslint-plugin-import) 是標準做法，可靜態強制 monorepo 層邊界

## Key Technical Decisions

- **Bootstrap 快取統一策略**：保留 `bootstrap-store.ts` 的 SWR 快取（它有 staleness 概念），刪除 `api.ts` 的模組級快取，改由 store 的 `loadedAt` 控制去重。`loadBootstrap()` 直接打 HTTP，store 決定是否該打。這樣 `refetch()` 就能真正觸發新請求。
  - 理由：store 已有完整的 SWR 邏輯，模組級快取是冗餘的，且是 stale data bug 的根因。

- **applyControlsStep 的歸屬**：將它加入 `steps` 陣列並透過 `enabledPipelineSteps` 字串陣列（非 bitmask integer，實際儲存格式是 `string[]` JSON）控制，而非保留為「無條件執行的隱藏步驟」。
  - 理由：registry 是 single source of truth 的承諾必須兌現；隱藏步驟會讓 preset 的 enabledPipelineSteps 陣列產生誤導（設定了也無效）。
  - 注意：`PIPELINE_STEPS.APPLY_CONTROLS` 常數已存在於 `pipeline-steps.ts` line 10，但被 line 9 注釋明確排除在 `ALL_PIPELINE_STEPS` 之外。需同步更新 `ALL_PIPELINE_STEPS`、`DEFAULT_ENABLED_STEPS`（因為 `DEFAULT_ENABLED_STEPS = ALL_PIPELINE_STEPS`）及 `scripts/seed.ts` 的硬編碼陣列。

- **DocumentService 一致性方向**：轉換成函式模式（與其他 service 一致），而非把所有 service 升格成 class。
  - 理由：函式模式透過 `getStorage()` 使用 global swap test seam，已被所有測試驗證；class 注入雖更靈活，但需要改動所有 service 和所有呼叫點，風險高於收益。

- **ExportPort 設計**：只定義最小介面 `writeFile(path: string, content: string): Promise<void>` 和 `ensureDir(path: string): Promise<void>`，不過度抽象。
  - 理由：export 的核心測試痛點是「是否寫到正確路徑」，不需要模擬完整 fs API。

## Open Questions

### Resolved During Planning

- **`applyControlsStep` 是否應在 UI 可見？** 是。現在 preset 的 `enabledPipelineSteps` 陣列缺少 `apply-controls`，導致 bitmask 誤導。加入 registry 後讓它可以被 preset 的字串陣列控制。

- **刪除 `bootstrapCache` 後 concurrent fetch 如何防重（`fetchIfNeeded`）？** 用 `bootstrap-store.ts` 的 `isLoading` flag：若 `isLoading === true`，`loadBootstrap()` 直接 return 而不發新請求。

- **`refetch()` 的並發問題？** `refetch()` 目前沒有 `isLoading` 守衛——兩個 mutation handler 同時呼叫 `refetch()`（如 toast + navigation 同時觸發失效）會發出兩個 HTTP 請求。Unit 1 實作時需在 `refetch()` 開頭加 `if (state.loading) return` 守衛。

- **re-fetch 失敗後的 data 狀態？** 明確決策：re-fetch 失敗時保留 `data`（讓 UI 繼續顯示已載入的內容），但設 `error` 且清除 `loadedAt`（下次觸發時重試）。不靜默顯示 stale data 而無任何錯誤指示。

### Deferred to Implementation

- `GeneratorWorkspace` 拆分的最終 hook 邊界：拆分時依實際程式碼 entanglement 做調整，計劃只定義方向，不定義最終 hook 名稱
- `ExportPort` 是否需要 `deleteFile`：實作時看 export-service 的實際用途再決定

## High-Level Technical Design

> *這只是方向性說明，不是實作規格。實作代理應以此為上下文，不應直接複製。*

```
Bootstrap 快取統一後的資料流：

UI mutation (e.g., save provider)
  → API 寫入成功
  → 呼叫 bootstrapStore.invalidate()    ← 新增：每個 mutation 完成後清 loadedAt
  → 下次讀取 bootstrap 時 isStale() = true
  → store.loadBootstrap() 發真實 HTTP 請求
  → 更新 store.data + loadedAt

api.ts 的 bootstrapCache 變數被刪除
api.ts 的 loadBootstrap() 永遠直接 fetch，不做快取判斷
快取決策完全在 bootstrap-store.ts
```

```
Pipeline registry 修正後：

PIPELINE_STEPS.APPLY_CONTROLS 加入 steps 陣列
generation-service.ts 的 applyControlsStep 呼叫改為
  透過 getEnabledSteps(preset.enabledPipelineSteps) 過濾
  （若 preset 未啟用，跳過；若啟用，執行）
/api/bootstrap 的 pipelineSteps 清單包含 apply-controls
UI preset editor 可顯示並切換此步驟
```

## Implementation Units

以下是真實依賴圖（Wave A/B 可並行，縮短 3 倍 wall-clock）：

```
Wave A（同時執行）:  Unit 1   Unit 2   Unit 3
                      ↓        ↓
Wave B（同時執行）:  Unit 4   Unit 5   Unit 7   （Unit 7 不依賴 Unit 6）
                               ↓
Wave C:              Unit 6   （依賴 Wave A 的 Unit 2 完成）
                      ↓
Wave D:              Unit 8   （所有完成後，確保無遺留違規）
```

Unit 3 原本依賴 Unit 2 的理由是「理解 service 模式」，這是知識依賴而非程式碼依賴，可並行。

---

- [x] **Unit 1: 統一 Bootstrap 快取，修復 stale-data bug** _(done 2026-06-26, branch fix/webui-all-features-usable: 刪除 api.ts 模組級快取，store 成為唯一快取；settings mutation 經 invalidate() 標記失效)_

**Goal:** 刪除 `api.ts` 的模組級 `bootstrapCache`，讓 `bootstrap-store.ts` 成為唯一的快取控制器；每次 settings mutation 後自動失效快取

**Requirements:** R1

**Dependencies:** 無

**Files:**
- Modify: `src/presentation/lib/api.ts`
- Modify: `src/presentation/store/bootstrap-store.ts`
- Test: `src/tests/unit/api-bootstrap-cache.test.ts`

**Approach:**
- `api.ts` 的 `loadBootstrap()` 移除 `bootstrapCache` 變數和 in-flight 去重邏輯，直接 return `fetch('/api/bootstrap').then(r => r.json())`
- `bootstrap-store.ts` 新增 `invalidate()` action（清除 `loadedAt`），`loadBootstrap()` 在 `isLoading` 時跳過
- 所有 settings mutation API 呼叫（provider save/delete, template save/delete, preset save/delete）完成後呼叫 `bootstrapStore.invalidate()`；追蹤這些呼叫點在 `src/presentation/` 中的位置
- `invalidateBootstrapCache()` 函式（目前只在測試用）可保留為對 `bootstrapStore.invalidate()` 的薄包裝，或直接讓測試改呼叫 store action

**Patterns to follow:**
- `src/presentation/store/bootstrap-store.ts` 現有 SWR staleness 邏輯
- `src/tests/unit/api-bootstrap-cache.test.ts` 現有測試結構

**Test scenarios:**
- Happy path: 第一次呼叫 `bootstrapStore.load()` 發 HTTP 請求，資料存入 store
- Happy path: 第二次在 staleness window 內呼叫，不發新 HTTP 請求（讀快取）
- Happy path: `invalidate()` 後再呼叫 `load()`，發新 HTTP 請求（stale）
- Edge case: `isLoading === true` 時呼叫 `load()`，不發重複請求（fetchIfNeeded 守衛）
- Edge case: `isLoading === true` 時呼叫 `refetch()`，不發重複請求（refetch 守衛，Unit 1 新增）
- Edge case: 兩個 mutation handler 同時呼叫 `invalidate()` + `load()`，只發一個 HTTP 請求
- Integration: provider 儲存成功後，bootstrapStore.data 在下次 load() 後更新
- Error path: 首次 fetch 失敗時，store 設 error，data 為 null，loadedAt 不更新
- Error path: re-fetch 失敗時，store 保留現有 data，設 error，清除 loadedAt（下次可重試）；UI 顯示錯誤指示而非靜默顯示 stale data

**Verification:**
- 刪除 `api.ts` 中的 `bootstrapCache` 後，`api-bootstrap-cache.test.ts` 全綠
- 在 settings 頁面儲存 provider 後，generator workspace 能讀到最新 provider 列表（無需手動重整）

---

- [ ] **Unit 2: 修復 drafts route 直接呼叫 getStorage()**

**Goal:** `GET /api/generations/[id]/drafts` 改透過 `DocumentService` 取得 `activeDraftId`，移除路由對 storage 的直接依賴

**Requirements:** R2

**Dependencies:** 無（Wave A，可與 Unit 1、Unit 3 並行）

**Files:**
- Modify: `src/app/api/generations/[id]/drafts/route.ts`
- Modify: `src/application/content/document-service.ts`
- Test: `src/tests/unit/api-routes-crud.test.ts`

**Approach:**
- `DocumentService` 新增 `getActiveDraftId(generationId: string): Promise<string | null>` 函式（注意：Unit 6 會把 class 轉函式，此 Unit 先保持 class 不動，只加方法）
- 路由的 GET handler 改呼叫 `documentService.getActiveDraftId(id)`，刪除 `import { getStorage }`
- 路由的 response shape 保持不變（不改 API contract）

**Patterns to follow:**
- `src/app/api/generations/route.ts` — 標準路由只 import service 的模式
- `src/application/content/document-service.ts` — 現有 method 命名和 error handling

**Test scenarios:**
- Happy path: GET `/api/generations/:id/drafts` 返回含 `activeDraftId` 的資料
- Edge case: generation 存在但 `activeDraftId` 為 null 時，返回 `{ activeDraftId: null }`（不應 crash）
- Error path: generation 不存在時返回 404
- Integration: route handler 不包含任何 `getStorage` 的直接呼叫（可用 import 分析驗證）

**Verification:**
- `grep -n "getStorage" src/app/api/generations/\[id\]/drafts/route.ts` 無結果
- 現有 drafts 相關測試全綠

---

- [ ] **Unit 3: 修復 applyControlsStep 不在 registry steps 陣列**

**Goal:** `applyControlsStep` 加入 pipeline registry 的 `steps` 陣列，並透過 `enabledPipelineSteps`（`string[]` 格式，非 integer bitmask）控制執行，讓 registry 真正成為 single source of truth

**Requirements:** R3

**Dependencies:** 無（Wave A，可與 Unit 1、Unit 2 並行）

**Files:**
- Modify: `src/plugins/pipeline/registry.ts`（加入 `applyControlsStep` 至 `steps` 陣列）
- Modify: `src/domain/pipeline-steps.ts`（將 `APPLY_CONTROLS` 加入 `ALL_PIPELINE_STEPS` 陣列；同步更新 `DEFAULT_ENABLED_STEPS`）
- Modify: `scripts/seed.ts`（更新硬編碼 `pipelineSteps` 字串陣列，加入 `"apply-controls"`）
- Create: `drizzle/migrations/YYYYMMDD_add_apply_controls_to_presets.ts`（為現有 preset 在 `enabledPipelineSteps` 的 JSON 陣列中 append `"apply-controls"`）
- Modify: `src/application/generation/generation-service.ts`（改為透過 registry + Set 過濾執行步驟）
- Test: `src/tests/unit/pipeline-registry.test.ts`
- Test: `src/tests/fixtures.ts`（更新 fixture preset 的 `enabledPipelineSteps` 以含 `apply-controls`）

**Approach:**
- `PIPELINE_STEPS.APPLY_CONTROLS` 在 `pipeline-steps.ts` line 10 已存在，但 line 9 注釋說「stays out of ALL_PIPELINE_STEPS」—— 移除該注釋，將 APPLY_CONTROLS 加入 `ALL_PIPELINE_STEPS`
- `registry.ts` 的 `steps` 陣列加入 `applyControlsStep`（執行順序：render-prompt 之後、clean-content 之前，維持現有行為）
- DB migration：讀取每個 preset 的 `enabledPipelineSteps` JSON → 若不含 `"apply-controls"` 則 append → 重新序列化存回（Drizzle migration script 而非純 SQL，因為需要 JSON parse/append/stringify）
- `seeds.ts` 的硬編碼陣列從 `["build-context","render-prompt","clean-content","format-output"]` 更新為含 `"apply-controls"` 的版本，確保新安裝行為與 migrated 安裝一致

**Patterns to follow:**
- `src/plugins/pipeline/registry.ts` 其他 step 的宣告和排序模式
- `src/tests/unit/pipeline-registry.test.ts` 現有測試結構

**Test scenarios:**
- Happy path: `listPipelineSteps()` 返回包含 `apply-controls` 的清單
- Happy path: `getPipelineStep("apply-controls")` 返回 step 物件（不再是 undefined）
- Happy path: preset 的 `enabledPipelineSteps` 含 `"apply-controls"` 時，generation-service 執行此步驟
- Happy path: preset 的 `enabledPipelineSteps` **不含** `"apply-controls"` 時，generation-service 跳過此步驟（opt-out 行為驗證）
- Happy path: `DEFAULT_ENABLED_STEPS` 含 `"apply-controls"`，新建 preset 透過 schema default 自動包含
- Integration: `/api/bootstrap` 回傳的 pipelineSteps 包含 apply-controls
- Integration: 透過 `scripts/seed.ts` 建立的 preset 含 `"apply-controls"`（新安裝 = migrated 安裝行為一致）

**Verification:**
- `pipeline-registry.test.ts` 全綠
- `getPipelineStep("apply-controls")` 不再回傳 undefined
- `grep "apply-controls" scripts/seed.ts` 有結果

---

- [ ] **Unit 4: 將 prompt 構建邏輯從 presentation 搬到 application（含 bridge 解決 ESLint 衝突）**

**Goal:** `rewrite-actions.ts` 中的業務 prompt 函式移到 `src/application/content/prompt-builders.ts`；同時在 `src/presentation/lib/` 建立顯式橋接，讓 presentation 的 import 路徑符合 Unit 8 的 Rule 3

**Requirements:** R4

**Dependencies:** 無（Wave B，可與 Unit 5、Unit 7 並行）

**Files:**
- Create: `src/application/content/prompt-builders.ts`（業務函式定義）
- Create: `src/presentation/lib/prompt-builders.ts`（bridge：從 application re-export，附 browser-safe 保證注釋）
- Modify: `src/presentation/generation/editor/rewrite-actions.ts`（改 import 自 `@/presentation/lib/prompt-builders`）
- Modify: `src/presentation/generation/generator-workspace.tsx`（若直接 import prompt 函式，改自 `@/presentation/lib/prompt-builders`）
- Test: 新增 `src/tests/unit/prompt-builders.test.ts`

**Approach:**
- 搬移的函式：`buildRewritePrompt`、`buildOutlinePrompt`、`buildContinuePrompt`、`buildParagraphPrompt`、`parseOutline`、`serializeOutline`
- `application/content/prompt-builders.ts` 只接受 plain data 參數（string、object），不 import 任何 React 或 Next.js 模組，無 Node.js 專屬 API
- `presentation/lib/prompt-builders.ts` 只做 re-export，附注釋說明 browser-safe 契約（模仿 `preview-prompt.ts` 模式）
- `rewrite-actions.ts` 仍保留 presentation 層關切（`REWRITE_ACTIONS`、`RewriteAction` type、`availableActions()`、`replaceRange()`、`sanitizeCompletion()`、`paragraphRangeAt()`），只刪除業務 prompt 函式定義
- 這個設計解決了 Unit 8 Rule 3 的結構性衝突：presentation/generation/editor/ 內的文件只 import 自 `presentation/lib/`，而非直接 import `application/`

**Patterns to follow:**
- `src/presentation/lib/preview-prompt.ts` — browser-safe bridge 模式
- `src/application/` 其他 service 函式的簽名風格

**Test scenarios:**
- Happy path: `buildRewritePrompt(content, instruction)` 返回正確格式的 prompt 字串
- Happy path: `buildOutlinePrompt(content)` 返回大綱生成 prompt
- Happy path: `parseOutline(outlineText)` 正確解析大綱結構
- Happy path: `serializeOutline(outline)` 輸出與 parse 可逆的格式
- Edge case: 空 content 的 prompt 構建行為（不應 crash，有合理 fallback 或拋出明確錯誤）
- Edge case: empty instruction 傳入 `buildRewritePrompt` 的行為

**Verification:**
- `grep -rn "buildRewritePrompt\|buildOutlinePrompt" src/application/content/prompt-builders.ts` 有結果（定義在此）
- `grep -rn "buildRewritePrompt\|buildOutlinePrompt" src/presentation/generation/` 只剩 import 行，無定義
- 新測試全綠
- TypeScript build 無錯誤

---

- [ ] **Unit 5: 修復 GeneratorWorkspace 的 reactive bypass 問題**

**Goal:** 修復 `generator-workspace.tsx` 中三個 `.getState()` 讀取繞過 React reactivity 的問題；此 Unit 不做大規模拆分（那是獨立的重構任務），只修精確的 bug

**Requirements:** R5

**Dependencies:** 無（Wave B，可與 Unit 4、Unit 7 並行）

**Files:**
- Modify: `src/presentation/generation/generator-workspace.tsx`
- Test: `src/tests/unit/use-generation-stream.test.tsx`（驗證相關行為）

**Approach:**
- `line 128: useProviderStore.getState().selectedProfileId` → 改成 `const selectedProfileId = useProviderStore(s => s.selectedProfileId)`，在 component top level 宣告
- `line 157: useVarMemoryStore.getState().varMemory[templateId]` → 改成 reactive selector `useVarMemoryStore(s => s.varMemory[templateId])`
- `line 202: useVarMemoryStore.getState().setVar(...)` → 這是寫操作在異步 callback（handleGenerate 的 onSuccess）中，不在 render cycle，是 Zustand 的標準用法；**可保留不動**（正確性審查確認安全）
- 注意：確保新增的 top-level hook 呼叫不違反 React hooks 規則（不在條件/迴圈中）

**Patterns to follow:**
- `src/presentation/store/bootstrap-store.ts` 中其他 selector 的使用方式
- 其他 presentation component 中 Zustand store 的正確使用方式

**Test scenarios:**
- Happy path: 切換 provider profile 後，workspace 使用新的 selectedProfileId 發起 generation
- Integration: varMemory 更新後，下次生成使用更新後的變數值（reactive 讀取才能保證）
- Edge case: selectedProfileId 為 null 時，UI 正確顯示「請先選擇 provider」
- Edge case: `templateId` 為 undefined 的初始 render（bootstrap 尚未解析）時，`varMemory[templateId]` selector 返回 undefined；`?? {}` fallback 應存在且有效，不應 crash

**Verification:**
- `grep -n "\.getState()" src/presentation/generation/generator-workspace.tsx` 的讀操作行數為 0（只剩寫操作可留）
- 相關測試全綠

---

- [ ] **Unit 6: 將 DocumentService 轉換為函式模式（與其他 service 一致）**

**Goal:** 消除 `document-service.ts` 唯一使用 class pattern 的不一致，改為 `getStorage()` 函式模式

**Requirements:** R6

**Dependencies:** Unit 2（Unit 2 先加了一個新 method，Unit 6 統一轉換）

**Files:**
- Modify: `src/application/content/document-service.ts`
- Modify: 所有 import `documentService` 的地方（API routes 和其他 services）
- Test: `src/tests/unit/` 中相關的 document service 測試
- Test: `src/tests/integration/document-service.test.ts`（此文件在 module load 時 `new DocumentService(storage)`，class 刪除後需改用 `setStorage()` seam 模式）

**Approach:**
- 把 `DocumentService` class 的每個 method 轉成獨立的 exported async function，使用 `getStorage()` 取 storage
- 刪除 `export const documentService = new DocumentService(getStorage())`
- 呼叫點從 `documentService.listDrafts(id)` 改為 `listDrafts(id)` 的 named import
- 確保測試中的 `setStorage()` mock 繼續有效（因為函式模式也透過 `getStorage()` 取 storage）

**Patterns to follow:**
- `src/application/provider/provider-service.ts` — 標準函式模式
- `src/application/generation/generation-service.ts` — 標準函式模式

**Test scenarios:**
- Happy path: `listDrafts(generationId)` 返回正確的草稿列表
- Happy path: `setActiveDraft(generationId, draftId)` 更新 activeDraftId
- Integration: 轉換後與測試中的 `setStorage()` mock 正常協作（不依賴 constructor injection）

**Verification:**
- `grep -n "class DocumentService\|new DocumentService" src/` 無結果
- 所有 document service 測試全綠

---

- [ ] **Unit 7: 為 Export Service 新增 ExportPort 抽象**

**Goal:** 定義 `ExportPort` interface，讓 `export-service.ts` 透過 port 操作檔案系統，可在測試中替換

**Requirements:** R7

**Dependencies:** 無（Wave B，可與 Unit 4、Unit 5 並行；不依賴 Unit 6）

**Files:**
- Modify: `src/domain/ports/` — 新增 export-port interface（或加入現有 ports 檔案）
- Create: `src/infrastructure/export/fs-export-adapter.ts`
- Modify: `src/application/export/export-service.ts`
- Test: 新增 `src/tests/unit/export-service.test.ts`

**Approach:**
- `ExportPort` 最小介面：`writeFile(path, content): Promise<void>`、`ensureDir(path): Promise<void>`（根據 export-service.ts 實際用途，不加 readFile 除非真的有讀操作）
- `FsExportAdapter` 在 infrastructure 實作，包裝 `node:fs/promises`
- 與 `getStorage()` / `setStorage()` 一樣，實作 `getExportAdapter()` + `setExportAdapter()` 這對 seam 函式；**缺少 `setExportAdapter()` 會讓測試無法注入 mock**
- `export-service.ts` 透過 `getExportAdapter()` 取 adapter，不直接 import `fs`
- 測試中透過 `setExportAdapter(mockAdapter)` 注入 mock

**Patterns to follow:**
- `src/domain/ports/storage.ts` — Port interface 設計
- `src/infrastructure/storage/sqlite-storage.ts` — `getStorage()` / `setStorage()` seam 模式

**Test scenarios:**
- Happy path: `exportGeneration(id, format)` 正確呼叫 adapter 的 `writeFile`
- Happy path: export 目錄不存在時，先呼叫 `ensureDir`
- Integration: mock adapter 能捕獲 writeFile 的 path 和 content 參數供斷言

**Verification:**
- `grep -n "from 'node:fs'" src/application/export/export-service.ts` 無結果
- 新測試全綠

---

- [ ] **Unit 8: 新增 ESLint 規則靜態強制層邊界**

**Goal:** 透過 `import/no-restricted-paths` 規則讓 CI 靜態阻擋 presentation 直接 import infrastructure，以及 domain import application/infrastructure 的違規

**Requirements:** R8

**Dependencies:** Wave A + Wave B + Wave C 全部完成（確保所有現有違規已先修復，ESLint 才不會誤報）

**Files:**
- Modify: `eslint.config.mjs`（或 `.eslintrc.js`，依現有設定格式）
- Test: 不需要單獨測試；`pnpm lint` 即是驗證

**Approach:**
- 禁止規則 1：`src/presentation/**` 不可直接 import `src/infrastructure/**`（必須透過 application）
- 禁止規則 2：`src/domain/**` 不可 import `src/application/**` 或 `src/infrastructure/**`
- 禁止規則 3（Unit 4 設計後可安全啟用）：`src/presentation/**` 不可直接 import `src/application/**`，除了 `src/presentation/lib/**`（即 bridge 路徑是唯一允許的入口）。Unit 4 建立的 `presentation/lib/prompt-builders.ts` 使此規則對 `rewrite-actions.ts` 的 import 合法。
- 為現有的合法例外加上 `// eslint-disable-next-line` 並附原因（若有）

**Patterns to follow:**
- `eslint-plugin-import` 的 `no-restricted-paths` 設定語法
- 參考 `src/presentation/lib/preview-prompt.ts` 作為「allowed bridge」的例子

**Test scenarios:**
- Test expectation: 無行為測試；`pnpm lint` 通過代表規則生效

**Verification:**
- `pnpm lint` 無新錯誤
- 在 `src/presentation/` 中試寫一行 `import { getStorage } from '@/infrastructure/...'` 時 lint 報錯

## System-Wide Impact

- **Interaction graph**: Bootstrap store 失效後，所有使用 `useBootstrapData()` 的 component 都會在下次呼叫時 re-fetch；provider selection、template picker、preset selector 均受影響
- **Error propagation**: Unit 1 後 `loadBootstrap()` 的錯誤改由 store 的 error state 承接，呼叫方需確認 error handling 路徑一致
- **State lifecycle risks**: Unit 3 後已存在的 preset bitmask 若未含 apply-controls bit，會導致行為改變（原本無條件執行 → 可能被 preset 關掉）；遷移邏輯需設定預設值為 enabled
- **API surface parity**: Unit 3 後 `/api/bootstrap` 的 `pipelineSteps` 回傳多一個 entry，前端如有假設固定數量的程式碼需確認
- **Integration coverage**: Unit 1 + Unit 3 的交互：settings 更新 → bootstrap 失效 → 下次載入包含正確的 pipelineSteps 清單
- **Unchanged invariants**: `StoragePort` 介面不變；`LLMProviderAdapter` 介面不變；四個 store 的互不 import 原則不變；`BaseAdapter` 繼承鏈不變

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Unit 3：DB migration 讓舊安裝 preset 有 apply-controls，但 `seeds.ts` 未更新讓新安裝缺少它 | **同時更新 `seeds.ts` 的硬編碼陣列**（已列入 Unit 3 Files），確保新舊安裝行為一致 |
| Unit 3：`ALL_PIPELINE_STEPS` 未更新讓新建 preset 的 schema default 缺少 apply-controls | 明確將 `ALL_PIPELINE_STEPS` 加入 Unit 3 Files，修改前先移除 `pipeline-steps.ts` line 9 的排除注釋 |
| Unit 1：刪除 `bootstrapPromise` 後 `refetch()` 無守衛，concurrent mutations 雙重 fetch | Unit 1 實作時在 `refetch()` 開頭加 `if (state.loading) return` 守衛（已加入 Approach） |
| Unit 5 的 hook 移到 top level 可能改變 render 頻率 | Zustand selector 只在值改變時 re-render，影響極小；若有性能迴歸可改用 `useShallow` |
| Unit 6 轉換 DocumentService 破壞 integration test 的 class-injection | Unit 6 Files 明確包含 `src/tests/integration/document-service.test.ts`，需同步改寫為 `setStorage()` seam 模式 |
| Unit 8 的 Rule 3 與 `rewrite-actions.ts` import application 衝突 | Unit 4 建立 `presentation/lib/prompt-builders.ts` bridge 解決此衝突；Unit 8 必須在 Unit 4 之後 |
| Unit 7 缺少 `setExportAdapter()` 讓測試無法注入 mock | 明確加入 `setExportAdapter()` 至 Unit 7 的實作範圍（已加入 Approach） |

## Documentation / Operational Notes

- Unit 3 的 DB migration 需要 Drizzle migration script（非純 SQL），操作：JSON parse → 條件 append `"apply-controls"` → JSON stringify → 存回。純 SQL 難以處理 JSON array append。
- `enabledPipelineSteps` 是 `string[]` JSON 陣列，不是 integer bitmask。計劃中所有「bitmask」描述均指此陣列結構。
- 完成後在 `docs/solutions/best-practices/coupling-patterns.md` 記錄本次的決策和 gotchas，作為未來的 institutional memory

## Sources & References

- Related code: `src/presentation/lib/api.ts:59-79`, `src/presentation/store/bootstrap-store.ts:44-56`
- Related code: `src/plugins/pipeline/registry.ts:57,95-99`
- Related code: `src/app/api/generations/[id]/drafts/route.ts:5,21`
- Related code: `src/presentation/generation/generator-workspace.tsx:128,157,202`
- Related code: `src/presentation/generation/editor/rewrite-actions.ts`
- Related code: `src/application/content/document-service.ts`
- Related code: `src/application/export/export-service.ts:1-3`
- External: `eslint-plugin-import` `no-restricted-paths` rule docs

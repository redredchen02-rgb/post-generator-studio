---
title: "fix: 彻底修復 better-sqlite3 NODE_MODULE_VERSION ABI 不匹配"
type: fix
status: completed
date: 2026-06-26
---

> **執行結果（2026-06-26）**：發現前一 session 已實作 `scripts/ensure-native.mjs`
> 自我修復守門（未提交）。依使用者決定採「self-heal + 版本鎖」雙保險：保留守門腳本、
> 另加 `.npmrc` 的 `use-node-version=22.22.3`、`engine-strict=true` 與 `package.json#engines`。
> 已驗證：模組在 Node 22.22.3 (ABI 127) 正常載入、`pnpm` 強制走 22.22.3、`pnpm rebuild`
> 自我修復動作可用、`pnpm db:migrate` 端到端成功、`engine-strict` 下 `pnpm install` 正常。
> 僅提交原生修復檔案，未碰未提交的 S5 工作。

# fix: 彻底修復 better-sqlite3 NODE_MODULE_VERSION ABI 不匹配

## Overview

App 啟動時拋出 `INTERNAL_ERROR / 服务器处理请求失败`，底層原因是
`better_sqlite3.node` 原生模組是用 **Node 22 (ABI 127)** 編譯的，但啟動 process
的卻是 **Homebrew Node 26 (ABI 147)**，ABI 對不上 → 載入原生模組失敗。

這不是程式邏輯 bug，是「環境/工具鏈」問題：機器上有三個 Node 版本，而專案
**沒有任何機制強制使用鎖定的版本**，導致錯誤的 Node 偷溜進啟動環境。

彻底修復分兩面：①用正確的 Node 重新編譯 better-sqlite3（救活當下）；②鎖死 Node
版本並加上守門機制，讓錯誤 Node 再也混不進來（防止復發）。

## Problem Frame

- 機器上三個 Node：`~/.local/bin/node` v22.22.3 (ABI 127，PATH 第一、符合 `.nvmrc`)、
  `/usr/local/bin/node` v24.14.0 (ABI 137)、`/opt/homebrew/bin/node` v26.0.0 (ABI 147)。
- `better_sqlite3.node` 編譯產物時間為 2025-05-08，對應 ABI 127。
- 報錯要求 ABI 147 → 啟動 app 的是 Homebrew Node 26，而非專案鎖定的 22.22.3。
- 專案已在 `.nvmrc` / `.node-version` 鎖定 `22.22.3`、`packageManager: pnpm@10.33.0`，
  但**沒有 `.npmrc`、`package.json` 也沒有 `engines` 欄位**，所以版本鎖定形同虛設。

## Requirements Trace

- R1. App 能在本機正常啟動，不再出現 NODE_MODULE_VERSION 不匹配錯誤。
- R2. 無論使用者 shell 的 PATH 如何排序，`pnpm` 啟動的 app 一律使用 Node 22.22.3。
- R3. 萬一未來再發生 ABI 不匹配，能在啟動前給出清楚可行動的錯誤訊息（而非晦澀的 500）。

## Scope Boundaries

- 不升級 Node 版本（已決定維持 22.22.3）。
- 不更動 better-sqlite3 的版本（維持 `^11.10.0` / 11.10.0）。
- 不移除使用者機器上其他 Node 安裝（那是使用者全域環境，超出專案範圍）。
- 不改動任何資料層 / SQLite 業務邏輯。

## Key Technical Decisions

- **標準化在 Node 22.22.3**：沿用既有 `.nvmrc` 鎖定值，現有編譯產物已符合，風險最低。
- **用 pnpm `use-node-version` 作為主要強制手段**：在 `.npmrc` 設定後，所有 `pnpm`
  指令會自動下載並使用指定 Node，**完全不受 shell PATH 影響**——這是「彻底」的核心。
- **`engines.node` + `engine-strict=true` 作為第二層守門**：若有人繞過 pnpm 用錯版本
  安裝，會直接被擋下並提示。
- **rebuild 而非重裝**：`pnpm rebuild better-sqlite3` 比整包 reinstall 快且風險小；
  重編失敗才退回 reinstall。

## Open Questions

### Resolved During Planning

- 標準化到哪個 Node？→ 22.22.3（使用者確認）。
- 用什麼機制強制版本？→ pnpm `use-node-version`（主）+ `engines`/`engine-strict`（輔）。

### Deferred to Implementation

- 是否需要在 `start:clean` / `migrate` 前加一支 ABI 自檢腳本？→ 視 Unit 3 實作時，
  確認 better-sqlite3 是否已內建足夠清楚的錯誤訊息再決定要不要自訂 preflight。

## Implementation Units

- [x] **Unit 1: 用正確 Node 重新編譯 better-sqlite3（救活當下）**

**Goal:** 讓 `better_sqlite3.node` 對應正在使用的 Node 22.22.3 (ABI 127)，app 立即可啟動。

**Requirements:** R1

**Dependencies:** 無（但須先確認當前 shell 的 `node -v` 為 22.22.3；若不是，先
`corepack`/`.nvmrc` 切到 22.22.3 再執行）。

**Files:**
- 無原始碼變更（僅重建 `node_modules/.pnpm/better-sqlite3@11.10.0/.../build/Release/better_sqlite3.node`）

**Approach:**
- 確認執行環境 Node 為 22.22.3（ABI 127）。
- 對 better-sqlite3 執行 rebuild；若 rebuild 仍失敗，退回對該套件重新安裝。
- 重建後驗證原生模組可被該 Node 載入。

**Patterns to follow:**
- `package.json` 已將 `better-sqlite3` 列入 pnpm 的 build 允許清單（`onlyBuiltDependencies`），
  rebuild 流程與既有安裝一致。

**Test scenarios:**
- Happy path：在 Node 22.22.3 下 require better-sqlite3 成功，不拋 NODE_MODULE_VERSION 錯誤。
- Integration：`pnpm db:migrate` 能順利跑完（migrate 腳本經由 tsx 實際開啟 SQLite，
  是對「原生模組能載入」最直接的端到端驗證）。
- Error path：故意用 Node 26 載入時應重現原始錯誤，確認問題與 Node 版本綁定（診斷用，非保留測試）。

**Verification:**
- `node -p "require('better-sqlite3'); 'ok'"`（在 22.22.3 下）輸出 `ok`。
- `pnpm db:migrate` 成功；app 啟動後不再出現該錯誤。

---

- [x] **Unit 2: 用 pnpm 強制鎖定 Node 22.22.3（防止復發，核心）**

**Goal:** 不論 shell PATH 怎麼排，所有 `pnpm` 指令都自動使用 Node 22.22.3。

**Requirements:** R2

**Dependencies:** 無（與 Unit 1 可並行；建議 Unit 1 先完成以便驗證）。

**Files:**
- Create: `.npmrc`（加入 `use-node-version=22.22.3` 與 `engine-strict=true`）
- Modify: `package.json`（新增 `engines` 欄位：`node` 對應 22.22.x，並聲明 pnpm）

**Approach:**
- `.npmrc` 的 `use-node-version` 讓 pnpm 自動下載/切換到指定 Node 來執行所有腳本，
  這是不受外部 PATH 干擾的關鍵。
- `engines.node` + `engine-strict=true` 作為第二道防線：若有人不透過 pnpm 而用錯版本
  安裝，安裝會直接被擋。
- 確認與既有 `packageManager: pnpm@10.33.0` 不衝突。

**Patterns to follow:**
- 既有 `.nvmrc` / `.node-version` 的鎖定值 22.22.3 為單一事實來源，三處保持一致。

**Test scenarios:**
- Happy path：在 PATH 首位是 Homebrew Node 26 的 shell 中執行任一 `pnpm` 腳本，
  實際生效的 Node 仍為 22.22.3（可在腳本中印 `process.version` 驗證）。
- Edge case：`.npmrc` 與 `engines` 的版本值需與 `.nvmrc`/`.node-version` 完全一致，
  避免互相矛盾導致 engine-strict 擋下自己。
- Error path：將 `engines.node` 暫時設為不符合的版本，確認 `engine-strict` 會擋下安裝
  （驗證守門機制真的有效，驗證後改回正確值）。

**Verification:**
- 在「PATH 首位為 Node 26」的 shell 跑 `pnpm exec node -v` → 顯示 v22.22.3。
- `.npmrc`、`.nvmrc`、`.node-version`、`package.json#engines` 四處版本一致。

---

- [x] **Unit 3: 啟動前 ABI 自檢 + 文件化（守門與可維護性）**

**Goal:** 萬一仍出現 ABI 不匹配，能在啟動最前面給出「該怎麼修」的清楚訊息，並把
排查/修復步驟寫進專案文件。

**Requirements:** R3

**Dependencies:** Unit 1、Unit 2（自檢訊息應引導使用者執行 Unit 1 的 rebuild）。

**Files:**
- Modify: `CLAUDE.md`（在指令區補一段「Node 版本與原生模組」說明：鎖定 22.22.3、
  遇到 NODE_MODULE_VERSION 錯誤時執行 rebuild）
- （條件性）Modify: `scripts/migrate.ts` 或新增極輕量 preflight，僅在捕捉到原生模組
  載入失敗時印出可行動訊息——實作前先確認 better-sqlite3 既有錯誤是否已足夠清楚

**Approach:**
- 先評估 better-sqlite3 原生錯誤訊息是否已足夠引導；若足夠，本 Unit 退化為純文件更新
  （此時自檢部分標記為非必要）。
- 若不足，於啟動/migrate 入口包一層 try/catch，偵測到 ABI 類錯誤時印出
  「請在 Node 22.22.3 下執行 better-sqlite3 rebuild」並以非零碼結束。
- 文件需說明三個 Node 並存的風險與如何確認當前 Node。

**Execution note:** 先做文件化（必定有價值且零風險），自檢腳本視評估結果決定是否加入。

**Test scenarios:**
- Error path（若實作自檢）：模擬原生模組載入失敗，preflight 印出含「rebuild」「22.22.3」
  關鍵字的訊息並以非零碼退出。
- 文件部分：Test expectation: none — 純文件更新，無行為變更。

**Verification:**
- `CLAUDE.md` 含 Node 版本與 rebuild 指引。
- （若實作自檢）人為破壞原生模組時，啟動會給出可行動訊息而非晦澀 500。

## System-Wide Impact

- **Interaction graph:** 影響所有經由 `getStorage()` → SQLite 的路徑（generation、
  bootstrap、quality scoring、migrate、seed）——即整個資料層的可用性，但修復不改其行為。
- **Error propagation:** 原生模組載入失敗目前以 500/INTERNAL_ERROR 形式冒出；Unit 3
  把它前移到啟動期並轉成可行動訊息。
- **State lifecycle risks:** 無資料遷移、無 schema 變更，不影響既有 DB 檔案。
- **Unchanged invariants:** better-sqlite3 版本、SQLite schema、所有 application/
  infrastructure 介面均不變；本計畫只觸碰工具鏈與建置產物。

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| rebuild 在當前 shell 仍混到錯誤 Node | 執行前明確 `node -v` 確認；或先以 Unit 2 的 pnpm `use-node-version` 生效後再 rebuild |
| `engine-strict=true` 擋到 CI 或其他開發者環境 | 鎖定值取自既有 `.nvmrc`（團隊已採用）；如有 CI 需同步使用 pnpm 與相同 Node |
| `use-node-version` 觸發 pnpm 下載 Node，首次較慢/需網路 | 一次性成本；本機已有 22.22.3，pnpm 會直接重用或快速取得 |
| Homebrew/系統 Node 未來再升級 | 版本已由 pnpm 強制，與全域 Node 解耦，不再受影響 |

## Documentation / Operational Notes

- `CLAUDE.md` 補充：專案鎖定 Node 22.22.3；遇 NODE_MODULE_VERSION 錯誤的標準修法。
- 若有 CI，後續確認其 Node 與 pnpm 設定與本機一致（本計畫不含 CI 變更，列為後續注意）。

## Sources & References

- 報錯訊息：`NODE_MODULE_VERSION 127`（編譯時）vs `147`（執行時要求）
- 相關設定：`.nvmrc`、`.node-version`（皆為 22.22.3）、`package.json#packageManager`
- 相關碼路徑：`src/infrastructure/storage/sqlite-storage`（better-sqlite3 使用者）

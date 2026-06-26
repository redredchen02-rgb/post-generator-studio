---
date: 2026-06-26
topic: s4-stability-reverify
head: 07dbdb92
plan: docs/plans/2026-06-26-001-feat-comprehensive-optimization-roadmap-plan.md
unit: Unit 1 (S4 + S1)
---

# S4 穩定複核 + S1 flaky 根因判定 — Findings

對照舊回歸清單 `docs/brainstorms/2026-06-25-comprehensive-iteration-requirements.md`，
逐項複核在現 `src/` 單樹的現況。基準 HEAD `07dbdb92`（`main`）。

## S1 — `/api/bootstrap` flaky 測試

**判定：已解。根因＝並行負載下動態 import 冷啟動延遲（非 race / 非 test-isolation）。**

證據：
- `src/tests/unit/api-routes.test.ts:61,78` 兩個 bootstrap 測試已帶 `{ timeout: 10_000 }`。
- 隔離連跑 5/5 PASS，每次 ~1.3s（遠低於 10s）。
- 完整套件連跑 2/2 PASS（**323 tests / 53 files，~5s**），bootstrap 在滿載下亦綠。
- 隔離 1.3s vs 滿載總 5s → 慢的是 `await import("@/app/api/bootstrap/route")` 的冷啟動編譯，
  與 service 重試/競態無關。`{ timeout: 10_000 }` 對症。

## R 項三態（只列在單樹仍有意義者；附 file:line）

| R | 主題 | 判定 | 證據 |
|---|------|------|------|
| R1 | `loadGenerations` 丟棄 search/offset | **已修** | `src/presentation/lib/api.ts:63-68` 三個參數都進 `URLSearchParams` |
| R3 | E2E 可跑 + 接 CI | **部分已修** | `playwright.config.ts:4` testDir=`./src/tests/e2e` 路徑有效、可跑；但 `.github/workflows/ci.yml:23` 只跑 `pnpm test`，**e2e 未接 CI**（唯一殘留） |
| R7 | Generator 快捷鍵 stale closure | **已修** | `generator-workspace.tsx:101-109` `handleGenerateRef` ref 模式，binding 永讀最新 |
| R8 | History stale `selected` | **已修** | `history-workspace.tsx:29`(`resolveSelected`)、`:57`(刪除丟選取)、`:64-66`(list 變動重解析) |
| R9 | `useApi` 競態 | **已修** | `use-api.ts:25`(`latestRequestRef`)、`:28`/`:37`/`:41` 單調 id + mounted guard（ignore-stale） |
| R10 | Provider selector 只顯 enabled | **已修** | `generator-workspace.tsx:127` + `input-panel.tsx:103` filter `enabled`；`:178` disabled 守衛 |
| R11/R14/R15/R16/R17 | Hono / `packages/web` / `packages/sdk` 重構項 | **N-A** | monorepo→單樹合併、Hono→Next App Router route handlers、無 SDK package；原路徑/框架已消亡 |

## Reopen 判定

- 在用 R 項中**僅 R3 的「e2e 未接 CI」為殘留**，且**不碰儲存層不變量、非架構變更**（只是 CI 加一行）。
- 儲存層相關（R7-R10 stale-state/race）**全部已修** → **S5（U4/U4b）硬閘可解除**。
- 計劃三承諾（P1 成員 / P1+P2 可發布 / 不大改架構）**轉為確定**——無在用 R 項在架構意義上「仍成立」。

## 後續（非本批次強制）

- **R3 殘留（可選小修）**：`ci.yml` 加 `pnpm exec playwright install --with-deps` + `pnpm test:e2e`。
  屬 outward-facing CI 變更（會拉長 CI、需快取瀏覽器），判斷題，留給使用者決定，不在低風險批次內擅自改。

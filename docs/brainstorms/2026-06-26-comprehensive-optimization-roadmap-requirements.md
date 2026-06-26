---
date: 2026-06-26
topic: comprehensive-optimization-roadmap
---

# Post Generator Studio — 全面優化路線圖（穩定 · 體驗 · 功能）

## Problem Frame

工具的對象是單人、本地優先的內容作者。經過一輪實地盤點，三條優化線的真實落差與直覺不同：

- **穩定性大致穩固（前提待補強）。** 已點名核實的項目確實修掉了：全庫零 `as any`、strict TS、CI 齊全、`foreign_keys = ON`、`abortRef` 在用（非死碼）、刪除已用事務、有 migration parity 測試。**但**舊 `comprehensive-iteration` 是針對已回退的 `packages/` monorepo 所寫，其 R1/R7-R10/R14-R23 是否在現 `src/` 樹仍成立**尚未逐條複核**；且 S1 的「flaky 超時」本身可能是 race/perf 的徵兆而非單純小修。故「縮編為收尾」這個決定**依賴一次 R1-R23 複核 + S1 根因判定**（見 Outstanding Questions）。
- **UI/UX 人性化是真正沒人碰過的缺口。** 設計系統地基有（Tailwind/CSS 變數/動畫），但「成品感」那層薄：刪除無確認、狀態字串中英夾雜、新人沒有上手引導、無障礙與回饋不足。
- **功能線進度比初稿所載更前面（且仍在推進）。** 截至 2026-06-26（branch `feat/generation-controls-unit7`、HEAD `812ca557`，以已提交程式碼/測試核實）：**U1–U8 已提交完成**——含 U7 生成控制（`generationControlsSchema`+`applyControlsStep`+UI+測試）與 **U8 大綱優先**（`outline-panel.tsx` 已 tracked、259 測試綠）。真正待做：**U9 評分、U10 多變體、U11 版本 UI、U12 從歷史恢復**。⚠️ 此清單時效極短——光是本文件兩輪審查之間 HEAD 就從 `2f19c20b` 推進到 `812ca557`（多了 U8）；**規劃前務必 `git log` 重核**。

本文件把「穩定收尾 + UI/UX 打磨 + 功能完成」合併成一份**分階段路線圖**：快贏先行、價值早交付，重型功能押後。功能線的**實作細節（HOW）沿用既有 `006` 計劃**，本文件只定義產品行為、範圍與排序。

> **北極星成果指標**：整份路線圖服務同一個用戶成果——**「從生成到一篇可發布稿所需的重生成/改稿次數下降」**。穩定與體驗讓打磨不被打斷、功能讓打磨更省力；P3/P4 是否值得做，以是否再推動此指標為準。

## Phasing Overview

優化按交付價值與成本排序，分四階段。早期階段成本低、移除風險高（資料遺失、中英夾雜），先交付；功能按依賴與成本遞增押後。**F1(U7) 生成控制已完成，不再列為階段**（見 Requirements F1）。

| 階段 | 主軸線 | 納入項 | 為什麼放這裡 |
|------|--------|--------|--------------|
| **P1 收尾快贏** | 穩定 + 高危體驗 | **S4(穩定複核, 首件)** · S1 · S2 · S3 · **S5(DB 備份/匯出)** · H1(刪除確認) · H3(狀態 i18n) | 先複核確認穩定假設，再移除「資料遺失」與「中英夾雜」兩個立即痛點 |
| **P2 體驗人性化** | UI/UX | H2(toast) · H4(上手/空狀態) · H5(a11y, 精簡) · H6(回饋/重試) · H7(行動端, 可選) | 讓現有功能「感覺像成品」；地基已有，純前端 |
| **P3 版本閉環** | 功能 | F3 (U11) · F4 (U12) | 草稿地基(U3)已備，主要是 UI；完成打磨閉環 |
| **P4 選配功能** | 功能 | F2 (U9 評分, 按需) · F5(U10 多變體, 可選) | 皆為選配：價值未證實或 token 成本高，想做才做（U8 已完成，不在此列） |

> **可獨立發布的增量**：P1 + P2 合起來就是一個對使用者有感、可單獨發布的版本（穩定收尾 + 體驗成品感），不必等到 P3/P4 才交付價值。每個階段結束都是一個重估點（見 Key Decisions「階段重估閘門」）。
>
> 三條線與你的三個訴求對應：**穩定使用** → P1 的 S 項；**人性化 UI/UX** → P1-P2 的 H 項；**功能** → P3-P4 的 F 項。

## Requirements

每條需求對應一個可觀測的成功標準。功能線（F）的 HOW 回溯到 `docs/plans/2026-06-25-006-feat-editor-optimization-roadmap-plan.md` 對應 Unit。

**穩定收尾（Stability — 暫定收尾，前提先經 S4 複核確認）**

- S1. 修復 `/api/bootstrap` flaky 測試：`GET /api/bootstrap > returns aggregated bootstrap data` 在 CI/離線環境因 5s 預設超時間歇性失敗。應 mock 服務呼叫或提高該測試超時，使 CI 穩定綠燈。
- S2. Provider adapter `parseChunk` 的「結構正確但欄位異常」缺口（源自舊文件 R13，已收窄）：`base-adapter.ts` 的 `safeParseChunk` **已**對「非物件 / 拋例外」的 chunk 浮出可觀測錯誤。真正殘留的窄缺口是：adapter 內 `raw as XChunk` 之後，一個「能 parse 成物件、但巢狀欄位形狀不符」的回應會讓欄位存取得到 `undefined`、**靜默不產出 token**。應在 `parseChunk` 內針對各 adapter 加**欄位形狀驗證**（疊在現有 `safeParseChunk` 之上，勿重造外層 guard）。先核實實際受影響的 adapter 數（anthropic 的 completion 路徑已有部分驗證，串流路徑待查；ollama/gemini/openai-compatible 確有未驗證 `as`）。
- S3. `generation.update()` 以事務包裹（修正真實 race）：真正的競爭**不是多用戶**，而是**同一用戶內** cancel 請求（status→cancelled）與串流完成 update（status→completed）對同一 generation 的 read-modify-write 競爭——目前僅靠事務外的 `canTransition` 守衛。`delete()` 已是事務、repo 也已有 `tx.update` 模式，故包裹 `update()` 是幾行的縱深防禦。（原「單用戶風險低」的理由誤判了風險來源。）
- S4.（P1 首件）**穩定複核**：在把穩定線定為「收尾」前，逐條核對舊 `comprehensive-iteration` 的 R1/R7-R10/R14-R23 在現 `src/` 樹的現況，並判定 S1 flaky 的根因是延遲還是 race。複核若翻出仍成立的回歸，補進穩定線（可能重開範圍）。這是便宜的前置保險，先做。
- S5. **資料持久性：DB 備份 / 全量匯出**：本地單用戶最大的不可逆風險是整個 SQLite 檔損壞/遺失。提供一鍵「全量匯出」（所有 generations + drafts + presets/templates/providers 設定，machine-readable）作為使用者可自救的備份；可選自動定期快照。護住比「誤刪單筆（H1）」更大的風險。

**UI/UX 人性化（Humanization — 真正缺口）**

- H1. 所有破壞性操作加二次確認：刪除 generation / provider / template / preset 目前一鍵即刪、無 undo。應加確認對話框，避免誤刪不可恢復的內容。**（高嚴重度：資料遺失風險）**
- H2. 引入 toast/通知元件：成功/失敗目前只有 inline 文字，無視覺區分。**預設採 `@radix-ui/react-toast`**（專案已裝 7 個 Radix 套件，一致性與維護成本都勝過自建；除非規劃時撞到具體限制才自建）。行為依類型分流：**成功/資訊 toast 自動消失；錯誤 toast 持久顯示直到關閉，並承載重試動作**（與 H6 對齊，避免重試入口隨 toast 自動消失而失效）。所有確認/狀態統一走此通道，取代散落的 `setStatus()` 文字。複製/儲存等確認若同時經 `aria-live`（H5），須共用單一 region 避免重複播報。
- H3. 生成狀態與錯誤字串全面 i18n：`use-generation-stream.ts` 有 8 處硬編碼狀態英文（Ready / Generating / Regenerating / Streaming response / Tokens received / Streaming failed / Cancelled / unavailable），**外加錯誤路徑**的 "Streaming response unavailable"(line 79)、"Streaming failed"(line 118)，以及直接渲染的原始 provider 錯誤訊息（常為英文）。全部納入 `messages/*.json`；原始 provider 訊息的呈現由 H6 失敗回饋負責包裝，確保「zh-CN 全程無英文殘留」這條成功標準在失敗路徑也成立。
- H4. 首次上手與空狀態引導：新用戶若 provider 未配好，點 Generate 直接報錯而不知所措。應偵測未配置狀態並引導先設定 provider；Generator / History / Settings 的空狀態給「下一步該做什麼」的提示（如「尚無 provider — 前往設定新增」），而非空白或無動作的 "None"。
- H5. 無障礙修復（**範圍依「使用者=開發者本人桌面」精簡為人人受惠項**）：(b) Settings tab 加 `role="tab"`/`aria-selected`；(c) 編輯/關閉表單時管理焦點；(d) 改寫工具條 busy 時 `aria-disabled`；(e) 錯誤訊息與欄位以 `aria-describedby` 關聯。**(a) `aria-live` 螢幕報讀器狀態播報降為可選**——若日後確認有報讀器使用者再補。
- H6. 操作回饋與失敗重試：(a) 複製/儲存給視覺「已複製/已儲存」確認（非只更新狀態文字）；(b) 生成失敗時提供「重試」入口，不必重填參數——重試入口須在**持久**的失敗介面（持久錯誤 toast 或 inline banner，見 H2），不可隨自動消失的成功 toast 一起消失。
- H7. 行動端與觸控打磨（**整項降為可選**——桌面為主，行動端非真實使用場景）：若要做則含觸控目標 ≥44×44px、list item 標題 truncate/line-clamp、config sidebar 行動端收合抽屜。否則順延。

**功能完成（Features — 編輯器 roadmap v0.2/v0.3，HOW 見 006 計劃）**

- F1. ✅ **已完成（U7，commit `2f19c20b`）**：生成前可填「自定義指令」並設語氣/長度/受眾、請求級、注入 prompt、全空逐字一致——schema/pipeline/UI/測試均已落地。**殘留待驗**：prompt 預覽是否真的反映控制項（F1 原要求「反映在預覽」）、控制項標籤是否已 i18n。此二者併入 P1 的驗證清單，不另開階段。
- F2.（**按需才做、可降級** — 對自用單用戶價值未證實，標為與 F5 同級的選配；想做才做）LLM-as-Judge 質量評分（= 006 Unit 9）：實作既有 `generator-quality-spec.md` 的五維 rubric 評分，含偏差緩解（用不同 model、二元標籤、單輸出評分），以「試讀者建議」口吻呈現而非權威判決；按需觸發、不阻塞生成、結果持久化。**前置環境假設**：偏差緩解的「不同 model」需使用者**已配置 ≥2 個 provider/model**；若只有一個（如僅 Ollama），fallback 為「停用評分並提示」或「同模型評分但打折」。
- F3. 版本工作流 UI（= 006 Unit 11）：在已備的草稿表上提供自動保存 working draft、「存為版本」、版本切換與版本對比；版本切換入口須顯眼。**切換版本時若當前 working draft 有未存編輯，須先保護**（預設 auto-save-first，否則明確確認）——這是與 H1 同類的資料遺失邊界。
- F4. 從 History 恢復（= 006 Unit 12）：History 一鍵把過往生成「恢復編輯」載入工作區（含活躍草稿），繼續打磨。**恢復前若工作區有未存編輯，須先保護**（同 F3 規則），達成「恢復無丟失」這條成功標準。
- F5.（可選增強，不阻塞）大綱優先（U8，**已在進行中**）與多變體並排對比（U10）：U8 完成後即落 P4；U10 時間/預算允許才納入，否則順延，不阻塞主線。

## Success Criteria

- **P1 後**：舊 R1-R23 已逐條複核並記錄現況、回歸（若有）已收進範圍（S4）；`pnpm test` + CI 穩定全綠、S1 根因已判定（S1）；一鍵全量匯出可產出完整可還原的備份檔（S5）；餵給 adapter 一個結構異常但可 parse 的回應會浮出可觀測錯誤而非靜默吞 token（S2）；刪除任一實體都需確認（H1）；zh-CN 下生成全程（含失敗路徑）無英文殘留狀態（H3）；F1 控制項已在 prompt 預覽反映且標籤已 i18n（F1 殘留驗證）。
- **P2 後**：未配置 provider 的新用戶能被引導完成首次生成而不撞錯誤牆（H4）；成功/失敗有視覺化 toast、錯誤 toast 持久（H2）；以鍵盤可走完生成主流程、Settings tab 與表單焦點/錯誤關聯正確（H5 精簡範圍；aria-live 播報為可選增強）；生成失敗可一鍵重試（H6）；（若做 H7）觸控目標達 44×44px、list item 標題過長自動 truncate/line-clamp。
- **P3 後**：一篇文章可存多版本、來回切換與對比；從 History 恢復舊文續寫並存新版本；**切換/恢復時若有未存編輯會先被保護**，全程無丟失（F3/F4）。
- **P4 後**：可對一篇生成觸發評分，徽章顯總分、展開見五維 + 一句理由、刷新仍在、文案為建議口吻；**只有單一 model 時評分有明確 fallback 行為**（F2）。

## Scope Boundaries

- **不做** 多用戶 / 雲同步 / 即時協作 — 本地優先單用戶定位不變（沿用 006）。
- **不做** TipTap/ProseMirror 富文本、WebSocket、Yjs/CRDT — 內容維持 markdown 字串、SSE 已足夠（沿用 006）。
- **不做** 大改穩定性架構 — S1-S3 是收尾而非重建（前提：S4 先複核確認）。
- **不做** 自動 SEO / 配圖 / 發布到外部平台。
- **不重寫** 已過時的 `comprehensive-iteration-requirements.md` — 其多數項目已完成；其 R13 的殘留部分已收窄併入本文件 S2，R1/R7-R10/R14-R23 的現況由 S4 複核（不預設已全解）。
- **資料持久性已納入**：整個 SQLite 檔損壞/遺失才是最大不可逆風險（>誤刪單筆），故新增 S5「DB 備份/全量匯出」進 P1，而非默默略過。
- **可選/可降級**：F2（評分，按需）、F5（U8 大綱、U10 多變體）、H7（行動端整項）— 時間緊可順延，不阻塞主線。

## Key Decisions

- **「完整計劃」= 完整地圖，不等於承諾走完每條路**：三條線都納入是為了給你一張全景圖，但**範圍納入 ≠ 序列承諾**。用 P1→P4 排序確保快贏與高危修復先交付。
- **階段重估閘門**：P1（+P2）交付後是一個明確重估點——先把「穩定收尾 + 體驗成品感」這個可發布增量做出來、確認工具值得繼續深化，再決定是否投入 P3 版本工作流與 P4 選配。避免靠慣性走完四階段、過度投資一個自用工具。
- **穩定線暫定縮編為收尾（前提待驗）**：已點名核實的項目確實已修；但「縮編」這決定**依賴**一次 R1-R23 在 `src/` 樹的逐條複核 + S1 flaky 根因判定。若複核翻出新洞，穩定範圍須重開。
- **功能線 HOW 不重寫**：006 計劃已對 U9/U11/U12 做過重型 deepening，本文件只定產品行為與排序，實作沿用 006。**F1(U7) 已完成**故移出階段。
- **H1 刪除確認進 P1**：它是「誤刪單筆即不可恢復」的高頻風險，故優先；但它**不是唯一**的資料遺失風險——整庫損壞（見 Scope Boundaries 資料持久性）與 F3 自動保存覆寫是更大/相鄰的風險，須一併權衡。
- **F2 評分降為選配（本輪已決）**：帶 token 成本、judge 偏差複雜度、且依賴 ≥2 model；對自用單用戶其「機器評分 vs 自己讀稿」的價值未證實，故降為與 F5 同級的「按需才做」、置於 P4 選配，而非排定必做階段。

## Dependencies / Assumptions

- 目前分支 `feat/generation-controls-unit7`、HEAD `2f19c20b`。**U1-U7 已提交完成**、**U8 進行中**（以已提交程式碼/測試核實，非僅檔案存在）。規劃前應再 `git log` 複核一次，因分支會持續推進。
- **F1(U7) 已完成**（僅剩預覽反映/標籤 i18n 的殘留驗證）；F3 依賴 U3 草稿地基 + U4（皆已完成）；**F4(U12) 依賴 F3(U11)**（須先完成 F3，故 P3 內 F3 在前、F4 在後）；F2 依賴 U2 `complete()`（已完成，已核實）。
- 假設 H4 採**輕量引導**（偵測未配置 → 橫幅/空狀態提示導向 Settings），而非完整多步精靈——符合單用戶工具的 YAGNI。若你要完整 onboarding wizard 請提出（會改變 H4 範圍）。
- **使用者身分（本輪已確認）**：唯一使用者=開發者本人、桌面為主。據此 H5 已精簡（aria-live 播報降可選）、H7 已整項降可選。若日後轉為對外分發，再重開 H5/H7 範圍。

## Outstanding Questions

### Resolve Before Planning

（已清空——document-review 浮現的 5 個策略決策已於本輪拍板，轉為下列明確決策。）

**本輪已決（採推薦預設）：**
1. **使用者 = 開發者本人、桌面為主** → H5 精簡為人人受惠項（aria-live 播報降可選）、H7 整項可選。
2. **資料持久性納入** → 新增 S5（DB 備份 / 全量匯出），進 P1。
3. **先做穩定複核** → 新增 S4，列為 P1 首件；確認穩定假設再續。
4. **北極星成果指標** → 「到可發布稿的重生成/改稿次數下降」（見 Problem Frame）。
5. **F2 評分降為選配** → 與 F5 同級「按需才做」，移入 P4 選配。

### Deferred to Planning

- [影響 F2][技術] 評分用哪個 provider/model + 單一 model 時的 fallback（停用/同模型打折）。
- [影響 S2][Needs research] `parseChunk` 欄位驗證用手寫 type guard 還是 Zod（逐 provider 評估 bundle/維護成本；疊在現有 `safeParseChunk` 上）。
- [影響 H4][設計] Generator / History / Settings 三個面的空狀態文案與 CTA（各自「下一步」不同，需分別定）。
- [影響 F1][設計] tone/length/audience 的輸入控件型態（下拉 / chips / 滑桿 / 自由文本）與預覽是顯示組裝後 prompt 還是僅輸出。
- [影響 F3][設計] 版本「對比」的呈現（並排 / inline diff / 變更高亮）與能否比較 >2 版本。
- [影響 F2/F3][設計] score 徽章的 pending/失敗狀態；新功能（控制/版本切換/評分徽章）在現有 IA 的擺放位置。

## Next Steps

→ **無阻塞項**（5 個策略決策已拍板），可執行 `/ce:plan` 進行結構化實施規劃。功能線 P3-P4 可直接引用 `006` 計劃對應 Unit；規劃重心放在 P1-P2 的穩定收尾與 UI/UX 人性化。**規劃前務必 `git log` 再核一次完成度**（分支持續推進中，本文件的「已完成」清單有時效）。

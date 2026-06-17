# 排錯記錄：result 頁無限重載（畫面「亂跳」）

> 類型：debug / 事後記錄（非 plan）
> 日期：2026-06-16
> 影響頁面：`/result`（如 `/result?district=不限&type=all&setting=both`）

## 症狀

開啟 `/result` 後畫面瘋狂「亂跳」，DevTools Network 看到 `generate`（`page.tsx:26`）
與頁面 document 不停反覆送出。首頁 `/` 完全正常。

## 量測（用專案內建 Playwright 自動驗證）

| 指標 | 壞掉時 | 修復後 |
|------|--------|--------|
| 4 秒內 `/api/generate` 呼叫數 | **102** | 1 |
| 3 秒內 document 請求數（= 整頁重載） | **71** | 1 |
| HMR `reloadPage` 訊息數 | 數十 | 0 |
| console error | 無 | 無 |

關鍵：在頁面元件插入 render 計數器後發現 `window.__rc` 會**歸零重來**（1,2,3,4 → 1,2,3,4…），
證明是**整頁 document reload**，而非單純 React re-render 迴圈。

## 定位過程

1. 先懷疑 `useEffect` 依賴不穩定造成重抓 → 印出 deps，發現每次 render 的
   `district/typeParam/setting` 值都相同，`fetchItineraries` 理應穩定 → **排除**。
2. 懷疑 `PaletteSwitcher`（root layout，每頁都載入）的 MutationObserver 自觸發 →
   它只監看 `class`，內部 `setProperty` 改的是 `style`，不會自觸發 → **排除**。
3. 懷疑 `/api/generate` 每次請求寫檔，觸發 Turbopack 檔案監看 → 監看 `data/` 目錄，
   迴圈期間檔案 mtime 沒有變動（generate 只 `readCombinedPlaces()`，不寫檔）→ **排除**。
4. 隔離測試：首頁 1 次 document 載入、result 頁 71 次 → **問題是 result 頁特有**。
5. 攔截 HMR websocket 訊息，抓到反覆出現的：

```json
{"type":"reloadPage","data":"error in HMR event subscription for
 static/chunks/src_app_result_page_tsx_*.js:
 TurbopackInternalError: Failed to write app endpoint /result/page

Caused by:
- Next.js package not found

Debug info:
- Execution of Project::hmr_version_state failed
- Execution of hmr_version_operation failed
- Execution of VersionedContentMap::get failed"}
```

## 根因

**不是應用程式碼的 bug**，而是執行中的 **dev server（Next 16 + Turbopack）建置狀態損壞**。

Turbopack 對 `result/page.tsx` 套用 HMR（hot update）時內部失敗（`Failed to write app
endpoint /result/page` / `Next.js package not found`），於是退而求其次送出 `reloadPage`
要求瀏覽器整頁重載；重載後重新跑頁面的 `useEffect`→`fetch('/api/generate')`，
Turbopack 下一次 HMR 又失敗 → 再 `reloadPage` → **building → reloadPage → building 無限迴圈**。

成因通常是 dev server 長時間執行 + 多次改檔後，`.next` 快取與執行中的 process 對不上
（本次 session 期間新增了 sync 來源、又數次編輯 `result/page.tsx`）。
此類錯誤不會在 console 顯示 JS error，只透過 HMR websocket 的 `reloadPage` 傳遞，
所以單看 console 看不出來。

## 修復

清掉 Turbopack/Next 快取並重啟 dev server：

```bash
tmux kill-session -t dev
rm -rf .next
tmux new-session -d -s dev "npm run dev"
```

重啟後用 Playwright 複測：document 載入 1 次、`/api/generate` 1 次、`reloadPage` 0 次、
正常渲染 2 組行程。迴圈消失。

## 如何快速判斷是否同類問題

- 單一路由狂重載、其他路由正常。
- console 沒有 JS error，但 Network 看到 document/同一支 API 高頻重打。
- 用 Playwright 監聽 `websocket` 的 `framereceived`，payload 出現 `{"type":"reloadPage", ... TurbopackInternalError ...}`。

符合以上 → 多半是 dev server 快取損壞，`rm -rf .next` + 重啟即可，不用改程式碼。

## 備註

- 此問題僅影響本機開發（dev / Turbopack HMR），不影響 production build。
- 與本次新增的 `mna` 售票來源無關（純屬同時段巧合）。

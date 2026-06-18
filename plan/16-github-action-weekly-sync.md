# 16 - GitHub Action 每週自動 sync（保留本機同步）

## 目標

用 **GitHub Actions** 每週固定時間自動跑一次資料 sync，把重新產生的共用 catalog（`data/combined/*.json`）**commit 回 repo → push master → 觸發 Vercel 自動部署**，讓線上資料每週自動更新。整套 **$0**（public repo Actions 免費、Vercel Hobby 免費、Firebase 沒碰）。

同時：
- **保留本機同步能力**：新增 `npm run sync`，本機與 CI 跑的是同一支腳本。
- 把同步指令寫進 README。
- 更新 README 已過時的「資料來源 / 資料儲存位置」段落（美食來源已移除、新增 MNA 售票來源）。
- 移除首頁那顆在 production 必定失敗（403）的死 sync 按鈕。

## 非目標（這份方案不做）

- 不把 catalog 搬進 Firestore / DB（維持靜態檔出貨的設計）。
- 不在 Vercel runtime 跑 sync（架構上不可行，見下）。
- 不改任何 sync 來源的爬蟲邏輯（16 個來源原封不動）。
- 不移除「瀏覽美食」頁面（該頁改由使用者口袋名單供料，屬另一條線，不在此處理）。

---

## 先回答你的關鍵問題：JSON 要不要一起 commit 回 GitHub？

**要，而且這是整個流程的核心，不 commit 就完全沒意義。** 原因：

1. `data/combined/*.json` 是 **git 版控的檔案**（`.gitignore` 特地用 `!data/combined/*.json` 把它們留在版控內），它們會**隨 Vercel build 出貨**，`/api/generate` 與各瀏覽頁讀的就是這批檔。
2. **Vercel 是從 git 部署的**：線上只會服務「最後一次部署當下 commit 進去的那份資料」。
3. 所以 GitHub Action 在雲端跑完 sync、產生新的 `data/combined/*.json` 後，如果**不 commit**，這些檔只會留在 CI runner 上、跑完即丟，**永遠到不了線上**。
4. 必須 `git add data/combined && git commit && git push` →（Vercel 收到 push webhook）→ **自動重新部署** → 新資料才上線。

一句話：**「更新線上資料」＝「把新的 combined JSON commit 進 repo 並重新部署」**。GitHub Action 做的就是把這串「本機手動流程」自動化。

---

## 現況盤點（已驗證）

| 項目 | 現況 | 影響 |
|---|---|---|
| sync 觸發點 | 首頁 `SyncButton`（`page.tsx:3,58`）→ `POST /api/sync`（SSE 串流） | production 一律回 403（`route.ts:66`）→ 線上按了必失敗 |
| sync 執行條件 | 寫檔（`writeFileSync` → `data/raw/*`、`data/combined/*`）+ 2 個來源用 Playwright（opentix、kktix） | Vercel runtime 檔案系統唯讀、無瀏覽器 → 無法在 Vercel 跑 |
| combined 是否進 git | 是（`.gitignore` `!data/combined/*.json`，`git ls-files` 確認 8 個 json 都在版控） | 具備「commit→部署→上線」的條件 ✅ |
| 來源數量 | route.ts 實際 **16 個**（14 fast + 2 slow） | README 只記 15 個（漏 MNA） |
| 美食來源 | `combine.ts` 註解：餐廳只來自使用者口袋名單（Firestore），不再併入共用 catalog；`data/combined/restaurants.json` = `[]` | README「美食（手動精選）」整段過時；curated json 檔已不存在 |
| 本機跑 sync 的唯一入口 | 首頁按鈕（dev 下 `NODE_ENV !== production` 才動得了） | 一旦移除按鈕，需有替代入口（→ `npm run sync`） |
| `tsx` | **未安裝** | 需加 devDependency 才能跑獨立 TS 腳本 |
| `.github/` | **不存在** | 需新建 workflow 目錄 |

### 來源對照（route.ts 為準，共 16）

- **展覽（5）**：culture、huashan、songshan、twtc、ntsec
- **演唱會/音樂會/戲劇（8）**：culture-music、culture-theater、tixcraft、era-ticket（ticket.com.tw）、kham、**mna（ticket.mna.com.tw ← README 漏列的新來源）**、opentix、kktix
- **電影（1）**：atmovies
- **景點（2）**：taipei-attraction（手動精選）、taoyuan（觀光 API）
- **美食**：✗ 已無同步來源（改由各使用者 Firestore 口袋名單）

---

## 架構決策

### 1. 為什麼用 GitHub Actions 而非 Vercel Cron

| | GitHub Actions | Vercel Cron |
|---|---|---|
| 能寫檔 / commit catalog | ✅ runner 是完整 Linux VM | ❌ runtime 檔案系統唯讀 |
| 能跑 Playwright（opentix/kktix）| ✅ `playwright install` 即可 | ❌ 無頭瀏覽器跑不動 |
| 貼合現有「靜態檔出貨」設計 | ✅ 等於自動化現有手動 runbook | ❌ 得把 catalog 搬進 DB、重寫所有讀取端 |
| 費用 | ✅ public repo 免費、不限分鐘 | （即使可行，Hobby cron 也有限制） |

→ **GitHub Actions**。它做的事 = 自動化 DEPLOYMENT.md §7「更新活動 catalog」那條手動流程。

### 2. 排程時間：台灣每週一 00:00

GitHub Actions cron **以 UTC 計算**。台灣（UTC+8）週一 00:00 = UTC 週日 16:00：

```
cron: '0 16 * * 0'      # 每週日 16:00 UTC = 每週一 00:00 台灣
```

- 想改成其他日：例如台灣週日 00:00 = `0 16 * * 6`（UTC 週六 16:00）。
- **注意**：GitHub 排程在高負載時可能延遲數分鐘、偶爾更久甚至略過——對「每週刷新一次資料」完全可接受。
- 一律加 `workflow_dispatch`，讓你隨時能在 Actions 頁面手動按一次。
- 加 `concurrency` 防止與手動觸發重疊。

### 3. 本機 / 雲端共用同一支腳本

sync 現在綁在 `/api/sync`（要起 Next server + SSE）。抽出獨立腳本 `scripts/sync.mts`，直接 import 既有的 `syncXxx()` + `combineAllPlaces()`，本機 (`npm run sync`) 與 CI 跑同一份，行為一致。`tsconfig.json` 已有 `@/* → src/*` 與 `**/*.mts`，用 `tsx` 即可解析路徑別名。

---

## 實作步驟

### Step 1 — 新增獨立 sync 腳本（保留本機同步）

新增 `scripts/sync.mts`，邏輯比照 `src/app/api/sync/route.ts`（fast 來源並行、slow 來源序列），但把 SSE 改成 `console.log` 進度：

```ts
// scripts/sync.mts
import { syncCulture, syncCultureMusic, syncCultureTheater } from "@/lib/sync/culture";
import { syncHuashan } from "@/lib/sync/huashan";
// ...（其餘 13 個來源 import，與 route.ts 相同）
import { combineAllPlaces } from "@/lib/combine";
import type { SyncResult } from "@/types";

const FAST = [ /* 14 個 { name, fn }，同 route.ts */ ];
const SLOW = [ /* opentix、kktix */ ];

async function main() {
  await Promise.all(FAST.map(async ({ name, fn }) => {
    const r = await fn();
    console.log(`✔ ${name}: ${r.status} (${r.count})`);
  }));
  for (const { name, fn } of SLOW) {            // Playwright，序列跑
    const r = await fn();
    console.log(`✔ ${name}: ${r.status} (${r.count})`);
  }
  const all = combineAllPlaces();               // 寫出 data/combined/*.json
  console.log(`done: ${all.length} places`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

> 為避免與 route.ts 重複維護一份來源清單，可把 `FAST/SLOW` 來源陣列抽到 `src/lib/sync/registry.ts`，讓 route.ts 與腳本都 import（選做，可後續再重構）。

### Step 2 — 加 `tsx` 與 `npm run sync`

`package.json`：
```jsonc
"scripts": {
  // ...
  "sync": "tsx scripts/sync.mts"
},
"devDependencies": {
  // ...
  "tsx": "^4"
}
```
（`npm i -D tsx`）

### Step 3 — 建立 GitHub Actions workflow

新增 `.github/workflows/weekly-sync.yml`：

```yaml
name: weekly-sync
on:
  schedule:
    - cron: '0 16 * * 0'        # 每週一 00:00 台灣時間
  workflow_dispatch: {}          # 可手動觸發
concurrency:
  group: weekly-sync
  cancel-in-progress: false
permissions:
  contents: write                # 讓 GITHUB_TOKEN 能 commit 回 repo
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium   # opentix / kktix 需要
      - run: npm run sync
      - name: Commit & push if data changed
        run: |
          git config user.name  "noidea-sync-bot"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add data/combined
          if git diff --staged --quiet; then
            echo "No data changes."
          else
            git commit -m "chore(data): weekly auto-sync"
            git push
          fi
```

機制說明：
- 用內建 `GITHUB_TOKEN`（搭配 `permissions: contents: write`）即可 push，**不需要 PAT**。
- `GITHUB_TOKEN` 的 push 不會觸發其他 GitHub workflow（防迴圈），但**會觸發 Vercel 的 Git 部署 webhook** → 線上自動更新。
- repo 每週有自動 commit＝有活動，不會踩到 GitHub「60 天無活動自動停用排程」。

### Step 4 — 移除首頁死 sync 按鈕（含連帶清理）

- `src/app/page.tsx`：刪 `import SyncButton`（L3）與 `<SyncButton />`（L58）。
- 刪 `src/components/SyncButton.tsx`（無其他引用）。
- **建議**一併刪 `src/app/api/sync/route.ts`（唯一呼叫者是 SyncButton；本機改用 `npm run sync` 取代）。
  - 若想保留 API 觸發方式也可不刪（它在 production 仍 403、本機可用），但會變成與腳本重複的維護點。

### Step 5 — 更新 README（見下方明細）

把同步指令、來源清單、資料儲存位置改成現況。

---

## 要新增 / 修改的檔案

| 動作 | 檔案 |
|---|---|
| 新增 | `scripts/sync.mts` |
| 新增 | `.github/workflows/weekly-sync.yml` |
| 修改 | `package.json`（加 `sync` script + `tsx` devDep）|
| 修改 | `README.md`（指令 + 來源 + 儲存位置）|
| 修改 | `src/app/page.tsx`（移除按鈕）|
| 刪除 | `src/components/SyncButton.tsx` |
| 刪除（建議）| `src/app/api/sync/route.ts` |
| 自動變動 | `data/combined/*.json`（每週由 Action commit）|

---

## README 更新明細（來源已不準）

1. **第一次使用（L27-34）**：移除「點底部同步按鈕」步驟，改為：
   - 本機要更新資料：終端機跑 `npm run sync`（不必開 server / 瀏覽器）。
   - 線上資料每週一 00:00（台灣）由 GitHub Action 自動更新並重新部署。
2. **功能說明「同步資料」列（L53）**：改述為「由 `npm run sync`（本機）或每週 GitHub Action（線上）自動抓取」。
3. **資料來源 → 演唱會/音樂會/戲劇表（L77-87）**：**新增一列** `MNA 售票 | ticket.mna.com.tw`。
4. **資料來源 → 美食段（L102-109）**：刪除 `restaurants-curated.json` / `restaurants-taoyuan-curated.json`（台北50/桃園15）整段，改述為「美食只來自各使用者的口袋名單（存 Firestore `users/{uid}`），不在共用 catalog；`data/combined/restaurants.json` 恆為空」。
5. **資料儲存位置樹（L123-151）**：
   - 改 `performances-era-ticket.json` → `performances-era.json`（實際檔名）。
   - 新增 `performances-mna.json`。
   - 刪 `restaurants-curated.json`、`restaurants-taoyuan-curated.json`、`custom-places.json`（已不存在；自訂地點/口袋名單已移至 Firestore）。
   - 備註 `combined/restaurants.json` 現恆為 `[]`。
6. **新增「同步資料」章節**，寫清楚指令：
   ```bash
   npm run sync   # 本機抓最新 16 來源 → 重生 data/combined/*.json
   # 要讓線上跟著更新：
   git add data/combined && git commit -m "chore(data): sync" && git push
   ```
   並說明「線上每週一 00:00（台灣）自動 sync，無需手動」。
7. **（選做）** `cd where-to-date`（L10）為過時目錄名，順手改為實際 repo 目錄。

---

## 驗證方式

1. **本機腳本**：`npm run sync` → 終端機印出 16 來源結果與總筆數；`git status` 看到 `data/combined/*.json` 有變動；`npm run dev` 確認推薦/瀏覽頁讀得到新資料。
2. **Workflow 手動觸發**：push 後到 GitHub → Actions → `weekly-sync` → Run workflow，確認：跑綠、若有差異產生一筆 `chore(data): weekly auto-sync` commit、Vercel 接著自動部署。
3. **線上**：部署完開正式站，確認資料是最新、且首頁不再有 sync 按鈕。
4. **排程**：等第一個週一 00:00（台灣）過後，回 Actions 確認排程有自動觸發。

---

## 風險與注意事項

- **GitHub 排程會漂移/偶爾略過**（高負載時）；每週刷新可接受，必要時手動 `workflow_dispatch`。
- **爬蟲從 GitHub（美國）IP 跑**：個別台灣網站理論上可能回應不同或暫時失敗；sync 各來源已各自 try/catch（單一來源失敗不影響其他），最壞情況是該次某來源 0 筆，下週再補。
- **Playwright 安裝**：CI 每次 `playwright install` 約增加數十秒；可接受（每週一次）。
- **無資料變動時不 commit**（`git diff --staged --quiet` 守門），不會產生空 commit / 無謂部署。
- **移除 `/api/sync` 後**，唯一 sync 入口是 `npm run sync`；本機更新能力不減反增（不必開 server）。

---

## 成本

| 項目 | 費用 |
|---|---|
| GitHub Actions（public repo）| $0（不限分鐘）|
| commit / push、Vercel Hobby 部署 | $0 |
| Firebase | 完全沒碰，維持 Spark 免費 |
| **總計** | **$0** |
</content>
</invoke>

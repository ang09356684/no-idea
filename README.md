# No Idea - 不知道要幹嘛？

幫你在沒想法時快速產生台北 / 桃園行程建議。

---

## 啟動

```bash
cd noidea
npm install   # 第一次使用需安裝依賴
npm run dev
```

啟動後打開瀏覽器：http://localhost:3000

## 關閉

在執行 `npm run dev` 的終端按 `Ctrl + C`。

## 確認是否在執行

瀏覽器打開 http://localhost:3000 ，有畫面就是在跑。

---

## 第一次使用

1. 啟動 server（`npm run dev`）
2. 打開 http://localhost:3000
3. 選擇地點 / 類型 / 場景 → 點「幫我安排！」

> 共用活動資料（展覽 / 演出 / 電影 / 景點）已隨專案出貨，開箱即用。要抓最新資料見下方「更新資料（同步）」。

---

## 功能說明

| 功能 | 說明 |
|------|------|
| 幫我安排 | 依條件隨機產生 2 組行程，每組 3 個地點 |
| 🎲 再給我一組 | 排除已顯示的地點，換一組新的 |
| 瀏覽展覽 | 查看所有展覽列表，可按來源篩選 |
| 瀏覽演唱會 | 查看演唱會列表（拓元 / 年代 / 寬宏 / MNA / KKTIX 等） |
| 瀏覽音樂會 | 查看古典音樂、音樂會列表 |
| 瀏覽戲劇 | 查看戲劇表演列表 |
| 瀏覽電影 | 查看所有上映中電影列表 |
| 瀏覽景點 | 查看台北 / 桃園景點列表 |
| 瀏覽美食 | 查看美食列表（資料來自你的口袋名單）|
| 我的最愛 | 收藏喜歡的地點，可從最愛直接安排行程 |
| 口袋名單 | 自己收集的地點（含美食 / 自訂地點），存雲端 Firestore、跨裝置同步 |
| 更新資料 | 本機 `npm run sync`，或每週由 GitHub Action 自動同步（見下） |

## 篩選條件

| 條件 | 選項 |
|------|------|
| 地點 | 不限 / 台北（可展開 12 區）/ 桃園（可展開 6 區）|
| 類型 | 不限 / 展覽 / 演唱會 / 音樂會 / 戲劇 / 電影 / 景點 / 美食 |
| 場景 | 都可以 / 室內 / 室外 |

---

## 更新資料（同步）

共用活動 catalog（`data/combined/*.json`）是隨部署出貨的**靜態檔**。更新方式兩種：

### 本機手動

```bash
npm run sync   # 抓最新 16 個來源 → 重新產生 data/combined/*.json
```

要讓**線上**也跟著更新，把產生的資料 commit 後推上去（push 到 `master` 會觸發 Vercel 自動部署）：

```bash
git add data/combined
git commit -m "chore(data): sync"
git push
```

> `npm run sync` 不需開 server / 瀏覽器；本機與 CI 跑的是同一支腳本 `scripts/sync.mts`。

### 線上自動（每週）

GitHub Action（`.github/workflows/weekly-sync.yml`）每週一 00:00（台灣時間）自動跑一次 sync，**若資料有變動**就 commit 回 repo 並觸發 Vercel 重新部署。也可到 GitHub → Actions → `weekly-sync` → Run workflow 手動觸發。**平時無需手動維護。**

> 為什麼要 commit JSON？因為線上只服務「最後一次部署 commit 進去的那份資料」——sync 產生的 `data/combined/*.json` 不 commit 就到不了線上。

---

## 資料來源

### 展覽（自動同步）

| 來源 | 網站 |
|------|------|
| 文化部 Open Data | cloud.culture.tw |
| 華山1914文創園區 | huashan1914.com |
| 松山文創園區 | songshanculturalpark.org |
| 台北世貿中心 | twtc.com.tw |
| 國立科教館 | ntsec.gov.tw |

### 演唱會 / 音樂會 / 戲劇（自動同步）

| 來源 | 網站 |
|------|------|
| 文化部音樂類 | cloud.culture.tw |
| 文化部戲劇類 | cloud.culture.tw |
| 拓元售票 | tixcraft.com |
| 年代售票 | ticket.com.tw |
| 寬宏售票 | kham.com.tw |
| MNA 售票 | ticket.mna.com.tw |
| 兩廳院 OPENTIX | opentix.life |
| KKTIX | kktix.com |

### 電影（自動同步）

| 來源 | 網站 |
|------|------|
| 開眼電影網 | atmovies.com.tw |

### 景點（自動同步 + 手動）

| 來源 | 說明 |
|------|------|
| 台北景點 | 手動精選 25 個（步道、公園、博物館等）|
| 桃園觀光 API | travel.tycg.gov.tw（自動同步）|

### 美食 / 自訂地點（使用者口袋名單，非同步來源）

美食與使用者自訂地點**不再是共用同步來源**，改存各使用者的 **Cloud Firestore**（`users/{uid}`，見 `DEPLOYMENT.md`），於產生行程時由前端帶入合併。因此 `data/combined/restaurants.json` 恆為空陣列 `[]`。

> 新增方式：首頁「🔖 口袋名單」→ 新增地點，選分類（含「美食」）並填名稱 / 地址。

---

## 資料儲存位置

```
data/
├── raw/                                 ← 各來源原始資料（npm run sync 會更新；不進 git）
│   ├── exhibitions-culture.json
│   ├── exhibitions-huashan.json
│   ├── exhibitions-songshan.json
│   ├── exhibitions-twtc.json
│   ├── exhibitions-ntsec.json
│   ├── performances-music.json          ← 文化部音樂類
│   ├── performances-theater.json        ← 文化部戲劇類
│   ├── performances-tixcraft.json
│   ├── performances-era.json
│   ├── performances-kham.json
│   ├── performances-mna.json
│   ├── performances-opentix.json
│   ├── performances-kktix.json
│   ├── movies-atmovies.json
│   ├── attractions-taipei.json
│   └── attractions-taoyuan.json
└── combined/                            ← 程式自動彙整（隨部署出貨、進 git；勿手動改）
    ├── all-places.json
    ├── exhibitions.json
    ├── concerts.json
    ├── music.json
    ├── theater.json
    ├── movies.json
    ├── restaurants.json                 ← 恆為 []（美食改存各使用者 Firestore）
    └── attractions.json
```

> 口袋名單 / 最愛已改存 Cloud Firestore（見 `DEPLOYMENT.md`），不再是 `data/` 下的檔案。

---

## 技術架構

- **Framework**: Next.js 16 + TypeScript + Tailwind CSS v4
- **部署**: Vercel（前端 + API routes）；Google 登入 + Cloud Firestore（見 `DEPLOYMENT.md`）
- **共用 catalog**: JSON 靜態檔（無資料庫），隨 build 出貨
- **使用者資料**: 口袋名單 / 最愛存 Firestore；UI 偏好（配色 / 深淺色）存 localStorage
- **資料抓取**: 文化部 JSON API + HTML scraping（華山 / 松菸 / 世貿 / 科教館 / 開眼 / 各售票網站）+ 桃園觀光 API；kktix 用 Playwright
- **自動更新**: GitHub Actions 每週排程跑 `npm run sync` → commit → 觸發 Vercel 部署

# 12 — 新增 MNA 售票資料來源

## 背景

現有 sync 流程已涵蓋多個售票/展演來源（拓元、年代 `ticket.com.tw`、寬宏、KKTIX、兩廳院…）。
`ticket.mna.com.tw`（年代旗下另一售票網域）為缺漏的來源，需補進 sync 流程，
讓其節目資料一併出現在站內。

該站與年代/寬宏共用同一套 utiki 售票後台，列表頁路徑為 `UTK0101_`，
節目連結為 `UTK0201_?PRODUCT_ID=...`，與既有 `era-ticket`、`kham` 解析方式相近。

## 目標

- 新增 `mna` 來源，於 sync 時抓取 `https://ticket.mna.com.tw/UTK0101_` 列表頁。
- 解析出節目名稱、日期、圖片、節目連結。
- **逐筆抓詳情頁取得真實場館**（地點為必要資訊，不留空、不杜撰），存成 raw JSON。
- 併入 `combineAllPlaces()` 的 performances，type 為 `concert`。

## 頁面結構（實測）

列表頁每個節目為一個 anchor：

```html
<a href="https://ticket.mna.com.tw/Application/UTK02/UTK0201_.aspx?PRODUCT_ID=P1AH1KJY">
  <h2>2026/07/10 - 2026/07/19</h2>                          <!-- 日期 -->
  <div class="element hvr-float">
    <div class="image" style="background-image: url(...jpg)"></div>  <!-- 圖片 -->
    <div class="content">
      <h1 class="ellipsis">&#x300A;&#x9B54;&#x5973;…&#x300B;</h1>     <!-- 標題（HTML hex entity 編碼）-->
    </div>
  </div>
</a>
```

注意事項：
- 同頁亦有 banner 廣告 anchor（`class="rsImg"` 的 `<img>`，**無 `<h1>`**）需略過。
- 標題為 HTML 十六進位 entity（`&#x300A;` 等），需解碼。
- 以 `PRODUCT_ID` 去重。
- **列表頁不含場館**，場館要從詳情頁取得（見下）。

### 詳情頁取場館 `UTK0201_?PRODUCT_ID=...`

場館位於詳情頁「節目場次」區塊（CMS 自由文字），格式類似：

```
節目場次
2026/06/28 (日) 13:30 臺北國家音樂廳
2026/06/28 (日) 18:00 臺北國家音樂廳
```

注意事項：
- HTML 標籤常把字拆開（`<strong>臺</strong><strong>北…</strong>`），去標籤後需**移除所有空白**才能比對到「臺北」等連續字串。
- **同場館不同時間 → 視為同一地點（去重後 1 筆）**；
  **同節目橫跨不同場館（巡演）→ 每個場館各產生一筆**（實例：《魔女宅急便》音樂劇在台北與台中各一場，為兩個 `PRODUCT_ID`，產出兩筆）。
- ⚠️ 頁尾常出現 `臺北市松山區敦化南路一段3號`，那是 **MNA 售票部辦公室地址**，非場館，務必不可當地點（會把台中場誤標成台北）。

## 變更檔案

### 1. `src/lib/sync/mna.ts`（新增）

匯出兩個函式 + 三個 helper：

- `syncMna(): Promise<SyncResult>`
  - 列表頁 `fetch(LIST_URL)`（10s timeout）取 HTML。
  - 以 `/<a[^>]*href="([^"]*PRODUCT_ID=[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi` 逐一比對 anchor。
  - 無 `<h1>` 的 anchor（banner）跳過；以 `PRODUCT_ID` 去重。
  - 標題（`<h1>` 去標籤 + `decodeEntities()`）、日期（`<h2>`）、圖片（`background-image: url(...)`）。
  - **逐筆並行 `fetch(DETAIL_URL(productId))`** 取詳情頁，`extractVenues()` 取場館清單。
    - 每個場館各 push 一筆 `MnaRaw`（含 `venue`）。
    - **場館抓不到（空清單）或詳情頁失敗 → 略過該筆，不寫入無場館資料**。
  - 寫入 `performances-mna.json`；來源代號 `mna`。
- `mnaPlaces(): Place[]`
  - 讀 `performances-mna.json`，map 成 `Place`：
    `id: mna-{i}`、`type: "concert"`、`source: "mna"`、`category: "indoor"`、
    `address: item.venue`（真實場館）、`district: venueToDistrict(item.venue)`、
    `goodFor: "both"`、帶 `imageUrl`/`sourceUrl`。
- helper：
  - `decodeEntities()`：解碼 `&#xHH;`、`&#NN;` 及常見命名 entity。
  - `extractVenues(html)`：鎖定「節目場次」區段 → 去標籤 + 去空白 → 用 `CITY + 場館關鍵字` 正則抓取，回傳**去重、保留順序**的場館清單。
  - `venueToDistrict(venue)`：知名場館 → 行政區對照（國家音樂廳/戲劇院→中正區、流行音樂中心→南港區、小巨蛋→松山區…）；場館字串含「X區」且在台北則直接採用；對不到 → `其他`。

#### 地點處理（重要）

MNA 列表頁**不含場館/縣市**，節目也**不一定在台北**（巡迴、外縣市場次皆有，例：台中場）。
因此場館從詳情頁取得後填入 `address`：
- `address` = 真實場館（如 `臺北國家音樂廳`、`臺中國家歌劇院`）。`matchesCity()` 以 `.includes("臺北"/"台北")` 比對（`generate.ts:115`），場館字串已含縣市，城市篩選即正確；台中場含「臺中」→ 不會誤入「台北」精準層。
- `district` = `venueToDistrict()` 推得行政區，對應首頁子區篩選；對不到（外縣市/未知場館）給 `其他`。
- **不再硬寫 `"台北市"`、不留空** —— 地點是必要資訊。

### 2. `src/app/api/sync/route.ts`

- `import { syncMna } from "@/lib/sync/mna";`
- `SOURCE_LABELS` 加入 `mna: "MNA年代"`。
- `FAST_SOURCES` 加入 `{ name: "mna", fn: syncMna }`（fetch-based，可並行）。

### 3. `src/lib/combine.ts`

- `import { mnaPlaces } from "@/lib/sync/mna";`
- `performances` 陣列加入 `...mnaPlaces()`。

> `Place.source` 為 `string`（`src/types/index.ts`），無需改型別。

## 驗證

1. `npx tsc --noEmit` → 通過。
2. dev server（`tmux`，:3000）`POST /api/sync`：
   - 收到 `{"source":"mna","label":"MNA年代","status":"success","count":5,...}`。
   - `data/raw/performances-mna.json` 每筆都有真實 `venue`，無空值。
   - combined 資料中 mna 各筆 `address`/`district` 正確（台中場 → `其他`、台北場 → 對應行政區）。
3. 《魔女宅急便》音樂劇正確呈現為兩筆（臺北國家戲劇院 + 臺中國家歌劇院）。

實測結果（2026-06-16）：

| venue | district | 節目 |
|-------|----------|------|
| 臺北國家音樂廳 | 中正區 | FINAL FANTASY 水晶迴響音樂會 |
| 臺北流行音樂中心 | 南港區 | 迪士尼《冰雪奇緣》動畫交響音樂會 |
| 臺北流行音樂中心 | 南港區 | Top Gun: Maverick in Concert |
| 臺北國家戲劇院 | 中正區 | 《魔女宅急便》音樂劇 |
| 臺中國家歌劇院 | 其他 | 《魔女宅急便》音樂劇 |

## 風險 / 後續

- 解析依賴頁面 HTML 結構，網站改版時 regex 需同步調整（與其他售票來源相同風險）。
- 場館擷取依賴「節目場次」自由文字；若某節目無此區塊或格式特殊，該筆會被略過（寧缺勿錯）。
- `venueToDistrict` 的對照表僅涵蓋常見場館，新場館需補表，否則落到 `其他`。
- 詳情頁為逐筆額外請求（目前約 5 筆，並行抓取），節目變多時 sync 會略慢。
- 與年代 `ticket.com.tw` 可能有重複節目；`combine.ts` 的 `normalizeForDedup` 會處理同名去重。
- ⚠️ 切勿採用頁尾「敦化南路一段3號」售票部地址當場館。

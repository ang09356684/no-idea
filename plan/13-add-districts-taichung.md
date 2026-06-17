# 13 — 擴充篩選行政區（補上台中）

## 背景

目前首頁地點篩選只有 **不限 / 台北 / 桃園 / 宜蘭** 三個縣市（`InputForm.tsx`），
而資料中已有非這三縣市的活動（例：MNA 的《魔女宅急便》在**臺中國家歌劇院**，
目前 district 落到「其他」，無法被精準篩選）。

本plan 補上 **台中市**，並以
[vinta 的台灣縣市行政區清單](https://gist.github.com/vinta/079cb8d4da486f471365c31388ed1b85)
作為行政區資料來源（格式為 `area_data = { '臺中市': ['中區','東區',...], ... }`，共 29 區）。

## 目標

- 首頁地點篩選新增「台中」城市，點開後可選台中各行政區。
- 資料端能把台中活動的地址解析成正確行政區，對應到篩選。
- 為避免日後逐一手刻，建立一份**共用的縣市/行政區資料模組**，由 UI 與比對邏輯共用。

## 現況觸點（會動到的地方）

| 檔案 | 現況 | 需求 |
|------|------|------|
| `src/components/InputForm.tsx` | `CITIES`（不限/台北/桃園/宜蘭）+ `SUB_DISTRICTS` 手寫 map | 新增台中城市與其 29 區 |
| `src/lib/generate.ts` | `CITY_KEYWORDS = {台北,桃園,宜蘭}`；city-wide 用 `address.includes(kw)`；specific 用 `p.district === district` | 新增台中關鍵字；處理跨縣市同名區衝突 |
| `src/lib/sync/culture.ts` | `extractDistrict` 只比對 `(臺北市\|台北市)(.{2,3}區)` | 一般化成可解析台中（及其他縣市） |
| `src/lib/sync/mna.ts` | `venueToDistrict` 只對應台北場館 | 補台中場館（如臺中國家歌劇院→西屯區） |

## ⚠️ 關鍵風險：跨縣市同名行政區

`大安區` **同時存在於臺北市與臺中市**（清單中兩市皆有）。
現行 `generate.ts` 的 specific-district 比對是 `p.district === "大安區"`，**不分縣市**，
一旦同時開放台北、台中，選台北大安會混入台中大安（反之亦然）。

其他潛在同名：`北區/南區/東區/西區/中區`（台中有，台北無，但未來擴充其他縣市會撞）、
`大雅/清水…`（台中特有，無衝突）。

**對策（擇一，實作時定案）：**
- (A) district 值改為「縣市+區」複合，如 `臺中市大安區` / `臺北市大安區`，比對也用複合鍵。
  最乾淨，但要同步改所有 sync 來源寫入的 district 與 `generate.ts` 比對、`InputForm` 的 value。
- (B) 在 `Place` 增加 `city` 欄位，比對時 `city + district` 一起比。改動較分散但語意清楚。
- (C) 暫時只做 city-wide「台中」（靠 `address.includes("臺中")`），**先不開放台中的子行政區**，
  避免同名衝突。最小改動，先讓台中活動可被「台中」篩到。

> 建議：先做 (C) 讓台中可用，再視需求升級到 (A)。實作前確認。

## 變更檔案（規劃）

### 1. 新增 `src/lib/districts.ts`（共用資料）

從 gist 整理出靜態常數（不在 runtime 抓網路），例如：

```ts
export const CITY_DISTRICTS: Record<string, string[]> = {
  台北: ["中正區","大同區","中山區","萬華區","信義區","松山區","大安區","南港區","北投區","內湖區","士林區","文山區"],
  桃園: [/* 既有 */],
  宜蘭: [/* 既有 */],
  台中: ["中區","東區","南區","西區","北區","北屯區","西屯區","南屯區","太平區","大里區","霧峰區","烏日區","豐原區","后里區","東勢區","石岡區","新社區","和平區","神岡區","潭子區","大雅區","大肚區","龍井區","沙鹿區","梧棲區","清水區","大甲區","外埔區","大安區"],
};

export const CITY_KEYWORDS: Record<string, string[]> = {
  台北: ["臺北","台北"],
  桃園: ["桃園"],
  宜蘭: ["宜蘭"],
  台中: ["臺中","台中"],
};
```

`InputForm.tsx` 與 `generate.ts` 改為 import 這份，移除各自重複的硬寫清單。

### 2. `src/components/InputForm.tsx`

- `CITIES` 增加 `{ value: "台中", label: "台中" }`。
- `SUB_DISTRICTS` 改由 `CITY_DISTRICTS` 動態產生（含 `台中-不限` 選項）。
- 若採對策 (C)：台中的子區暫不顯示（或顯示但 value 用 city-wide）。

### 3. `src/lib/generate.ts`

- `CITY_KEYWORDS` 改 import 共用版（含台中）。
- city-wide「台中-all」：`matchesCity` 已是 `address.includes(kw)`，補關鍵字即可運作。
- specific district：依採用的對策調整比對鍵（見上風險段）。

### 4. `src/lib/sync/culture.ts`（與其他用地址的來源）

`extractDistrict` 一般化：

```ts
function extractDistrict(address: string): string {
  const m = address.match(/(臺北市|台北市|臺中市|台中市|桃園市|宜蘭縣)(.{1,3}區|.{1,3}[鄉鎮市])/);
  return m ? m[2] : "其他";
}
```

（若採對策 (A)，回傳改為含縣市的複合鍵。）

### 5. `src/lib/sync/mna.ts`

`venueToDistrict` 補台中場館對應，例：

```ts
[/臺中國家歌劇院|臺中歌劇院/, "西屯區"],
[/中山堂.*臺中|臺中.*中山堂/, "中區"],
```

## 驗證

1. `npx tsc --noEmit` 通過。
2. `POST /api/sync` 後，台中活動（如魔女台中場）combined 的 `district` 為台中區（非「其他」）。
3. 首頁選「台中」→ `/result?district=台中-all`：台中活動出現在精準層。
4. （若做子區）選台中某區，台北同名區（大安）不互相污染。
5. 既有台北/桃園/宜蘭篩選行為不變。

## 後續

- 之後可把新北、高雄等其他縣市用同一份 `districts.ts` 逐步加入。
- 同名行政區衝突若擴及多縣市，建議直接上對策 (A)/(B)。
- 此 plan 僅規劃；實作前先確認同名衝突採哪個對策。

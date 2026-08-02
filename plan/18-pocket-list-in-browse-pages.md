# 18 - 口袋名單併入分類瀏覽頁（修正「美食」分類永遠空白）

## 目標

讓使用者加進**口袋名單**的項目，依 `type` 出現在對應的**分類瀏覽頁**（`/food`、`/attractions`、`/exhibitions`…），而不是只在「產生行程」時才被吃到。

直接症狀：線上 https://no-idea-green.vercel.app/ 首頁點「美食」永遠是空的，即使口袋名單裡有美食。

非目標（這份方案不做）：

- 補共用的美食資料來源（爬蟲 / curated）。美食**刻意**只來自口袋名單（見下方根因），要不要補來源是另一個產品決定。
- 讓 server 端讀得到使用者的口袋名單（Firebase Admin SDK + ID token）。口袋名單是個人資料，client 已經拿得到，不值得為此在 server 加一套憑證。
- 口袋名單的跨裝置 / 跨分頁即時同步行為改動（維持 plan 15 / 17 現狀）。

---

## 根因：兩條資料流從來沒接起來

分類頁與口袋名單走的是完全不相交的兩條路：

| | 分類瀏覽頁 | 口袋名單 |
|---|---|---|
| 元件 / hook | `BrowseList` → `fetch('/api/list?type=…')` | `usePocketList()` |
| 實際來源 | server 端讀 repo 內的 `data/combined/all-places.json`（爬蟲產物，build 時打包） | Firestore `users/{uid}/pocketList`；未設定 Firebase 時走 localStorage |
| 誰讀得到 | 所有人（共用 catalog） | 只有該使用者的瀏覽器 |

`/api/list` 是 server route，既沒帶 ID token 也沒有 Admin SDK，**本來就讀不到**使用者的 Firestore；而 `BrowseList` 從頭到尾沒有 import `usePocketList`。兩邊沒有任何交集。

再加上第二刀：commit `8a2a40d`（plan 13）移除了 curated 美食來源，commit message 寫得很清楚 ——

> 移除 curated 餐廳來源（restaurants-curated / restaurants-taoyuan-curated），**美食只來自使用者口袋名單**

但當時只有「產生行程」那條路被接上口袋名單（`mergeWithPocket()`，加於 `86cf5c9`），**分類頁沒有**。於是 `/food` 的資料來源等於：共用 catalog 的 food（0 筆）＋ 沒有讀取的口袋名單 = 永遠 0 筆。

實測佐證（改動前；catalog 筆數每週被 auto-sync 換掉，以下為當時數字）：

```
$ curl 'https://no-idea-green.vercel.app/api/list?type=food'
{"places":[],"total":0}

data/combined/all-places.json → 773 筆
  { exhibition:115, music:253, concert:86, theater:208, movie:74, attraction:37 }  # food 不存在
data/combined/restaurants.json → []
```

也就是說：**設計意圖是對的，只實作了一半。** 這份方案補上另一半。

---

## 架構決策

1. **在 client 端合併，不動 API。** `BrowseList` 直接用 `usePocketList()`，把 `type` 相符的口袋項目併進 `/api/list` 回來的 catalog。選 client 而不選 server 的理由見「非目標」——server 要讀個人資料得多一整套 Admin SDK 憑證。
2. **去重規則與產生行程共用一套。** 沿用 `mergeWithPocket()` 的規則：以正規化後的名稱比對，**同名以 catalog 為準**，口袋項目捨棄。兩條路徑看到的東西才會一致。
3. **`normalizeForDedup` 抽成 `src/lib/dedup.ts`。** 原本住在 `combine.ts`，而 `combine.ts` 會 `import { writeCombinedJson } from "@/lib/data"` → 連帶把 `fs` 拉進 client bundle。抽成獨立、無相依的一支，client / server 共用。
4. **口袋項目排在最前面。** 使用者自己存的東西優先級最高，尤其 `/food` 除了口袋名單什麼都沒有。（產生行程那邊是 append 到尾端，但後面會 shuffle，順序無意義，不必一致。）
5. **loading 只在 catalog 為空時才等口袋名單。**
   `loading = catalogLoading || (pocketLoading && catalog.length === 0)`
   - catalog 有東西（展覽、景點…）→ 立刻渲染，**不讓 Firestore 慢或連不上時整頁卡在 skeleton**。這些頁面在改動前完全不依賴 Firebase，不能因為這次改動多出一個外部失敗點。
   - catalog 是空的（美食）→ 等口袋名單，避免先閃一次「共 0 筆」。最壞情況也只是本來就空的頁面顯示 skeleton。
6. **`usePocketList` 的 `loading` 納入 auth loading。** 原本 auth 尚未解析時 `user` 還是 `null` → `loading=false` → 會先回一次空清單，等 `user` 進來才變 loading，`/food` 因此閃「共 0 筆 → skeleton → 有資料」。語意上「還不確定最終清單」就該是 loading。`/pocket-list` 不受影響（它包在 `SignInGate` 裡，auth loading 期間本來就顯示「載入中…」）。
7. **來源標籤共用。** `pocket → 口袋名單` 放進 `PlaceItem` 匯出的 `SOURCE_LABELS`，讓分類頁、行程卡、最愛三處都不會露出生的 `pocket` 字串；分類頁的 `sourceLabels` prop 仍可覆寫。

---

## 連帶修正：收藏口袋項目會被誤判「已下架」

`/favorites` 會把所有收藏的 id 丟給 `/api/check-favorites` 比對共用 catalog，不在裡面的就標成**已下架**、灰掉、排除在「用最愛排行程」之外，還會被「清除已下架」一鍵刪掉。

口袋名單項目**永遠不在共用 catalog 裡**，所以一旦收藏就必然被誤判。這是既有 bug（從行程卡收藏口袋美食就會中），但這次改動讓分類頁也能收藏口袋項目、大幅提高踩到的機率，所以一併修掉：送去比對前先濾掉 `source === "pocket"`。

---

## 檔案異動清單

### 新增

| 檔案 | 作用 |
|------|------|
| `src/lib/dedup.ts` | `normalizeForDedup()`，從 `combine.ts` 抽出。無相依，client / server 共用 |

### 修改

| 檔案 | 改什麼 |
|------|------|
| `src/components/BrowseList.tsx` | 主要改動。加 `usePocketList()`，依 `type` 併入 catalog（去重、口袋優先排前）；`loading` 改為條件式等待；來源標籤合併 `SOURCE_LABELS`；`fetch` 補 `?? []` 與 `.catch`（原本 API 掛掉會讓 `items` 變 `undefined` → render 直接爆） |
| `src/components/PlaceItem.tsx` | 匯出共用 `SOURCE_LABELS`（`pocket → 口袋名單`）；新增選用 prop `sourceLabel` |
| `src/lib/usePocketList.ts` | `loading` 納入 `authLoading`（決策 6） |
| `src/lib/combine.ts` | 移除 `normalizeForDedup` 定義，改 import `@/lib/dedup` |
| `src/lib/generate.ts` | `normalizeForDedup` 的 import 來源改 `@/lib/dedup` |
| `src/app/favorites/page.tsx` | `checkExpired()` 送出前濾掉 `source === "pocket"` |
| `src/app/food/page.tsx` | 移除死掉的 `sourceLabels`（`curated` / `taoyuan-curated` / `custom` 三個來源早已不存在，`custom` 更是 plan 09 改名前的舊稱） |

### 不動

- `/api/list`、`/api/check-favorites`、`src/lib/data.ts` — server 端維持只服務共用 catalog。
- `usePocketList` 的對外介面與儲存行為（Firestore / localStorage 雙軌不變）。
- 其餘 6 個分類頁（`exhibitions` / `concerts` / `music` / `theater` / `movies` / `attractions`）— 合併邏輯在 `BrowseList` 內，各頁零改動即生效。
- `mergeWithPocket()`（產生行程）— 規則不變，只是去重函式換了 import 路徑。

---

## 關鍵程式碼

### `src/components/BrowseList.tsx`

```tsx
const { places: pocketPlaces, loading: pocketLoading } = usePocketList();

// 共用 catalog（/api/list，server 端的爬蟲資料）＋ 使用者自己的口袋名單（Firestore /
// localStorage，只有 client 讀得到）。口袋項目依 type 落到對應分類頁，排在最前面。
// 去重規則與產生行程的 mergeWithPocket() 一致：同名以 catalog 為準，避免一筆顯示兩次。
const items = useMemo(() => {
  const seen = new Set(catalog.map((p) => normalizeForDedup(p.name)));
  const mine = pocketPlaces.filter((p) => {
    if (p.type !== apiType) return false;
    const key = normalizeForDedup(p.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...mine, ...catalog];
}, [catalog, pocketPlaces, apiType]);

// catalog 是空的（例如美食目前沒有共用來源）才等口袋名單，免得先閃一次「共 0 筆」。
// catalog 有東西就直接渲染 —— Firestore 慢或連不上時不該讓整頁卡在 skeleton。
const loading = catalogLoading || (pocketLoading && catalog.length === 0);
```

### `src/lib/usePocketList.ts`

```ts
// loading =「還不確定最終清單」。auth 尚未解析時也算，否則 user 從 null 變成已登入的瞬間
// 會先閃一次空清單（BrowseList 併口袋名單時看得出來）。
const loading = useLocal
  ? local === null
  : authLoading || (!!user && !(snap && snap.uid === user.uid));
```

---

## 邊界情況

- **未登入訪客（線上組態）**：`user` 為 null → 口袋名單為空 → 分類頁只顯示 catalog，與改動前完全相同；`/food` 顯示「共 0 筆」而非卡住。
- **Firestore 慢 / 連不上**：有 catalog 的頁面照常渲染（決策 5）。只有 `/food` 會停在 skeleton，而它本來就是空的。
- **同名項目**：口袋名單存了一筆與 catalog 同名的（例：象山步道）→ 只顯示 catalog 那筆，不會重複。
- **來源篩選鈕**：`showSourceFilter` 的條件是來源數 > 2。`/attractions` 併入後多出「口袋名單」選項；`/food` 只有 pocket 一種來源 → 不顯示篩選，符合預期。
- **React key**：口袋 id 一律 `pocket-{timestamp}-{rand}` 前綴，不會與 catalog id 相撞。
- **localStorage 模式**（未設定 Firebase）：走同一段合併程式碼，`places` 來源不同而已，行為一致。

---

## 測試 / 驗收

### 自動（已通過）

- [x] `npx tsc --noEmit` 無錯。
- [x] `npm run lint` 無錯。
- [x] `npm run build` 通過（19 頁 prerender 正常；特別驗證抽出 `dedup.ts` 後 client bundle 不再牽連 `fs`）。

### Playwright 實測

腳本在 scratchpad，非 repo 產物；三組共 **39/39 通過**。

**A. localStorage 模式**（`next dev` 清空 Firebase env，走 `usePocketList` 的 `!configured` 分支，合併邏輯與 Firestore 模式同一段）。種入 3 筆口袋名單：美食 ×1、景點 ×1、與 catalog 同名的景點 ×1。

- [x] 種入前 `/food` = 共 0 筆（重現原始症狀）
- [x] 種入後 `/food` = 共 1 筆，看得到品名，來源顯示「口袋名單」而非 `pocket`
- [x] `/attractions` = 共 38 個景點（catalog 37 + 口袋 1，同名那筆被去重）
- [x] 口袋項目排在列表最前面
- [x] 「象山步道」只出現一次（去重生效）
- [x] 出現「口袋名單」來源篩選鈕，點下去剩 1 筆
- [x] `/exhibitions` = 共 115 檔（沒混進不同 type 的口袋項目）
- [x] 收藏口袋美食後進 `/favorites`：看得到，且**沒有**被標成「已下架」

**B. 七種 type 全覆蓋**（localStorage 模式，每種 type 各種一筆口袋名單）

新增表單的 7 個選項（`pocket-list/add/page.tsx:36` 的 `TYPES`）與 7 個分類頁的 `apiType` 字串 1:1 對得上，逐頁實測：

catalog 筆數每週被 auto-sync 換掉，所以斷言的是相對關係「**catalog + 1**」而非絕對數字（腳本從 `/api/list` 動態取）。下表為 rebase 到 `1858df4` 後那次執行的實際數字：

| 頁面 | type | catalog | 併入後 |
|---|---|---|---|
| `/exhibitions` | exhibition | 129 | 130 ✅ |
| `/concerts` | concert | 33 | 34 ✅ |
| `/music` | music | 282 | 283 ✅ |
| `/theater` | theater | 271 | 272 ✅ |
| `/movies` | movie | 64 | 65 ✅ |
| `/attractions` | attraction | 37 | 38 ✅ |
| `/food` | food | 0 | 1 ✅ |

- [x] 七頁的口袋項目都出現，且排在列表最前面
- [x] 七頁都**沒有**混進其他 type 的口袋項目（type 篩選正確，不會溢出）

**C. Firebase 已設定 + 未登入訪客**（`next dev` 用真實 `.env.local`，模擬線上訪客）

- [x] `/exhibitions` 115 檔、`/attractions` 37 個、`/food` 共 0 筆，皆正常渲染
- [x] 三頁 skeleton 都確實消失（`.animate-pulse` 計數為 0）—— 驗證不會因為等 Firestore 而卡住

### 部署後手動確認（需真實 Google 帳號，自動化測不到）

- [ ] 線上登入 → 口袋名單新增一筆美食 → 首頁點「美食」看得到。
- [ ] 同一筆在「幫我安排」選美食時仍會被排進行程（`mergeWithPocket` 未受影響）。
- [ ] 換一台裝置登入同帳號，分類頁同樣看得到（Firestore 同步）。

---

## 實作階段

| Phase | 內容 |
|------|------|
| 1 | 抽出 `src/lib/dedup.ts`，`combine.ts` / `generate.ts` 改 import |
| 2 | `PlaceItem` 匯出 `SOURCE_LABELS` + `sourceLabel` prop |
| 3 | `BrowseList` 併入口袋名單（去重、排序、loading 策略、來源標籤） |
| 4 | `usePocketList.loading` 納入 auth loading |
| 5 | `favorites` 已下架誤判修正、`food/page.tsx` 死標籤清理 |
| 6 | `tsc` + `lint` + `build` + 兩組 Playwright 驗證 |

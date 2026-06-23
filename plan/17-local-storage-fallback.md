# 17 - 未設定 Firebase 時以 localStorage 儲存(口袋名單 / 最愛)

## 目標

**方案 A**:當 runtime **沒有 Firebase 設定**(`isFirebaseConfigured === false`)時,口袋名單與最愛改存**瀏覽器 localStorage**,讓「clone 下來本地直接 `npm run dev`」也能完整使用這兩個功能,且**完全不碰任何雲端**。

有設定 Firebase 時(本機填了 `.env.local`、或線上 Vercel)**行為完全不變**,仍走 Firestore。

非目標(這份方案不做):

- 改動登入 / 登出的 soft-gate 行為(有設定但未登入時,維持現狀:點愛心引導 Google 登入)。
- localStorage ↔ Firestore 的雙向遷移 / 合併(那是方案 B,複雜度高,不做)。
- 跨分頁即時同步(Firestore 的 `onSnapshot` 才有;localStorage 模式不做)。

---

## 判斷訊號:用 `configured`,不要用 dev/prod

核心原則:**依「能力」判斷(有沒有 Firebase),不依「環境」判斷(dev/prod)**。

| 情境 | 用 `configured` 判斷 | 用 `NODE_ENV` dev/prod 判斷 |
|------|------|------|
| 本機 dev + **有**填 `.env.local` | → Firestore ✅(可測真雲端) | → 被迫 localStorage ❌ |
| 本機 dev + 沒填 | → localStorage ✅ | → localStorage ✅ |
| 別人 clone(無設定) | → localStorage ✅ | clone 跑 `build && start` 變 prod ❌ |
| 線上 Vercel(有設定) | → Firestore ✅ | → Firestore ✅ |

`configured`(= `isFirebaseConfigured` = `Boolean(projectId)`,`firebase.ts:20`)四格全對;dev/prod 在「本機想測真雲端」與「cloner 跑 production build」兩格會錯。

判斷式現成一行,且兩個 hook 已經透過 `useAuth()` 拿到 `configured`:

```ts
const useLocal = !configured;
```

> (選配,本方案不做)如要「有 Firebase 仍強制走本地」當測試開關,可再加 `NEXT_PUBLIC_USE_LOCAL_STORE === "true"` 做 OR。先不加,保持乾淨——要測本地版把 `.env.local` 的 Firebase 那幾行註解掉即可。

---

## 歷史盤點:之前怎麼存的、能不能沿用(已查 git 驗證)

| 資料 | 遷移前(`86cf5c9^`)怎麼存 | 能否沿用為 fallback |
|------|------|------|
| **最愛** | localStorage,key `noidea-favorites`(per-browser、純 client) | ✅ **直接沿用**舊版邏輯,介面一致 |
| **口袋名單** | 伺服器 API `/api/pocket-list` 寫 `data/raw/pocket-list.json`,`combine.ts:63` 全域共用、API 已刪除 | ❌ 非 localStorage、全域共用(缺陷)、已退役 → **需新設計** |

### 為何口袋名單不還原舊的伺服器檔版(替代方案否決)

- 舊版是**全域單一檔、所有人共用**(plan 15 列為缺陷),不是 per-browser。
- server-side 檔案 I/O 較重,且需還原已刪除的 route。
- 與「最愛走 localStorage」不對稱,維護心智負擔高。
- Vercel serverless **唯讀 fs 寫不了**(雖然線上一定有 Firebase 不會走到此分支,但語意不乾淨)。

→ 對「本地單機開發」的目標,**localStorage 對兩者都最合適**。

---

## 架構決策

1. **判斷訊號** = `configured`(見上)。
2. **最愛**:沿用舊 localStorage 版邏輯,key 維持 `noidea-favorites`(順帶讓遷移前殘留的舊資料自動回來)。
3. **口袋名單**:新設計 localStorage 版,key `noidea-pocket-list`,鏡像最愛 pattern。
4. **抽共用 helper** `src/lib/localStore.ts`(SSR-safe 讀寫),兩個 hook 共用,避免重複 try/catch/JSON 與 hydration 處理。
5. **對外介面完全不變**(consumers 零改動):
   - `useFavorites` → `{ favorites, isFavorite, toggle, remove, clear }`
   - `usePocketList` → `{ places, loading, add, remove, replaceAll }`
6. **函式簽名維持 `async`**(即使 localStorage 是同步操作),讓現有 `await toggle(...)` / `await add(...)` 等呼叫端不用改。
7. **不違反 Hooks 規則**:`useState` / `useEffect` / `useMemo` / `useCallback` 一律無條件呼叫,只在 effect 與 callback **內部**用 `useLocal` 分支(不能條件式呼叫 hook)。

---

## SSR / Hydration 安全(關鍵)

比照 `PaletteSwitcher`(commit `7e5daa3` 修過同類 hydration mismatch)與舊 `favorites.ts`:

- SSR 與**首次 client render** 一律回**空陣列**(伺服器沒有 `localStorage`)。
- **mount 後**才在 `useEffect` 內讀 `localStorage` 並 `setState`。
- `loading`:localStorage 模式下 mount 前為 `true`、讀完為 `false`(與 Firestore 模式語意一致)。

---

## 檔案異動清單

### 新增

| 檔案 | 作用 |
|------|------|
| `src/lib/localStore.ts` | SSR-safe localStorage helper:`readLocal<T>(key, fallback)` / `writeLocal<T>(key, value)` |

### 修改

| 檔案 | 改什麼 |
|------|------|
| `src/lib/favorites.ts` | 加 `useLocal` 分支:`!configured` 走 localStorage(沿用舊邏輯),否則維持 Firestore。介面不變 |
| `src/lib/usePocketList.ts` | 加 `useLocal` 分支:`!configured` 走 localStorage(新),否則維持 Firestore。介面不變 |
| `src/components/SignInGate.tsx` | **（實作後測試補修）** `!configured` 原本顯示「尚未設定 Firebase」死路、擋住內容 → 改成直接放行 `children`。沒 Firebase 時登入本就不可能/無意義（`signInWithGoogle` 會 throw），資料走 localStorage、不需登入；否則 hook 的 localStorage fallback 永遠被頁面 gate 擋住、UI 到不了 |
| `README.md` | 補一段「未設定 Firebase 時:登入停用,口袋名單 / 最愛改存瀏覽器 localStorage(僅本機、不跨裝置),其餘正常」 |
| `.env.example` | 頂部補註解:留空也能跑,此時口袋名單 / 最愛存 localStorage |

### 不動

- `AuthProvider.tsx`(`configured` 已正確導出,登入 soft-gate 行為不變)。
- 所有 hook 的 consumer 頁面(`result` / `favorites` / `pocket-list` / `pocket-list/add` / `BrowseList`)——介面相容,零改動。
- 線上部署 / Firestore / rules——完全不受影響(線上永遠 `configured`)。

---

## 關鍵程式碼骨架

### `src/lib/localStore.ts`(新增)

```ts
// SSR-safe localStorage 讀寫。伺服器端 / 讀寫失敗一律回 fallback。
export function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / 隱私模式:忽略 */
  }
}
```

### `src/lib/usePocketList.ts`(加分支,骨架)

```ts
const POCKET_KEY = "noidea-pocket-list";

export function usePocketList() {
  const { user, configured } = useAuth();
  const useLocal = !configured;

  // Firestore 模式狀態(現有,以 uid 把關避免換帳號殘留)
  const [snap, setSnap] = useState<{ uid: string; places: Place[] } | null>(null);
  // localStorage 模式狀態(null = 尚未讀,代表 loading)
  const [local, setLocal] = useState<Place[] | null>(null);

  useEffect(() => {
    if (useLocal) {
      setLocal(readLocal<Place[]>(POCKET_KEY, [])); // mount 後才讀,SSR 安全
      return;
    }
    if (!user) return;
    const col = collection(db, "users", user.uid, "pocketList");
    return onSnapshot(col, (s) =>
      setSnap({ uid: user.uid, places: s.docs.map((d) => d.data() as Place) })
    );
  }, [useLocal, user]);

  const places = useMemo<Place[]>(
    () =>
      useLocal
        ? local ?? []
        : user && snap && snap.uid === user.uid
          ? snap.places
          : [],
    [useLocal, local, user, snap]
  );
  const loading = useLocal
    ? local === null
    : !!configured && !!user && !(snap && snap.uid === user.uid);

  const add = useCallback(
    async (input: Omit<Place, "id" | "source">) => {
      const id = newPocketId();
      const place: Place = { ...input, id, source: "pocket" };
      if (useLocal) {
        const next = [...readLocal<Place[]>(POCKET_KEY, []), place];
        writeLocal(POCKET_KEY, next);
        setLocal(next);
        return place;
      }
      if (!user) throw new Error("not-signed-in");
      await setDoc(doc(db, "users", user.uid, "pocketList", id), clean(place));
      return place;
    },
    [useLocal, user]
  );

  // remove / replaceAll:同樣 useLocal 分支(localStorage 直接覆寫整個 key);
  // 介面回傳維持 { places, loading, add, remove, replaceAll }
}
```

### `src/lib/favorites.ts`(加分支,沿用舊版邏輯)

```ts
const FAV_KEY = "noidea-favorites"; // 沿用遷移前 key

export function useFavorites() {
  const { user, configured, signInWithGoogle } = useAuth();
  const useLocal = !configured;

  const [snap, setSnap] = useState<{ uid: string; items: Place[] } | null>(null);
  const [local, setLocal] = useState<Place[] | null>(null);

  useEffect(() => {
    if (useLocal) {
      setLocal(readLocal<Place[]>(FAV_KEY, []));
      return;
    }
    if (!user) return;
    const col = collection(db, "users", user.uid, "favorites");
    return onSnapshot(col, (s) =>
      setSnap({ uid: user.uid, items: s.docs.map((d) => d.data() as Place) })
    );
  }, [useLocal, user]);

  const favorites = useMemo<Place[]>(
    () =>
      useLocal
        ? local ?? []
        : user && snap && snap.uid === user.uid
          ? snap.items
          : [],
    [useLocal, local, user, snap]
  );

  // isFavorite 不變;toggle 在 useLocal 時讀/寫 FAV_KEY + setLocal,
  // 否則維持「未登入引導登入 / 登入後寫 Firestore」。remove / clear 同理。
}
```

---

## 邊界情況

- **模式切換不自動合併**:同一瀏覽器先「沒設定(localStorage)」後又「設定了 Firebase(Firestore)」,兩份資料各自獨立,不自動搬移(方案 B 才做)。文件註明即可。
- **`replaceAll`(匯入)localStorage 模式**:直接覆寫整個 key。
- **`add` 回傳**:回傳建立的 `Place`(與現行一致,`pocket-list/add/page.tsx` 可能用到)。
- **`toggle` / `remove` / `clear` / `add`**:維持 `async` 簽名,呼叫端零改動。
- **多分頁同步**:localStorage 模式不做即時跨分頁同步(可選監聽 `storage` 事件,非必要,先不做)。
- **隱私模式 / quota 滿**:`writeLocal` try/catch 吞錯,不讓 app crash。

---

## 測試 / 驗收

### 自動

- [ ] `npm run lint` 通過。
- [ ] `npm run build` 通過(型別 + 編譯 + 各頁 prerender;含 Firestore 分支不回歸)。
- [ ] 暫時 `mv .env.local .env.local.bak` → `npm run build` 通過(驗證 `!configured` 分支 SSR/prerender 不 throw)→ 完成後 `mv` 還原。

### 手動(本地)

把 `.env.local` 暫時移開(或註解 Firebase 那幾行)→ `npm run dev`:

- [ ] 首頁 / 瀏覽 / 產生行程正常。
- [ ] 口袋名單可新增,重整後仍在;devtools → Application → Local Storage 看到 `noidea-pocket-list`。
- [ ] 最愛可收藏,重整後仍在;看到 `noidea-favorites`。
- [ ] console 無 hydration warning。

還原 `.env.local` → `npm run dev`:

- [ ] 仍走 Firestore(登入後讀寫雲端),行為與現在一致。

---

## 實作階段

| Phase | 內容 |
|------|------|
| 1 | 新增 `src/lib/localStore.ts` helper |
| 2 | `favorites.ts` 加 `useLocal` 分支(沿用舊 localStorage 邏輯) |
| 3 | `usePocketList.ts` 加 `useLocal` 分支(新 localStorage 實作) |
| 4 | `README.md` + `.env.example` 補說明 |
| 5 | `lint` + `build` + 手動測試(上方驗收) |

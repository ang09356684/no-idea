# 15 - Firebase Google 登入 + Firestore（部署上網）

## 目標

讓 app 部署到網路上（Vercel），每個使用者用 **Google 帳號登入**，把「口袋名單」「最愛」存到 **Cloud Firestore**，跨裝置同步、不怕清快取遺失。共用的活動 catalog 維持靜態檔，不進 DB。

非目標（這份方案不做）：把 sync catalog 搬進 Firestore、自動排程 sync、Admin SDK 伺服器端讀取（留作後續）。

---

## 現況盤點（已驗證）

| 項目 | 現在 | 問題 |
|---|---|---|
| 口袋名單 | `/api/pocket-list` 寫 `data/raw/pocket-list.json` + `combineAllPlaces()` | serverless 唯讀檔案系統會寫失敗；且是**全域單一檔**，所有人共用 |
| 最愛 | `favorites.ts` → localStorage `noidea-favorites` | 已是 per-user，但綁單一瀏覽器、不跨裝置 |
| catalog（725 筆） | `data/combined/*.json`，`generate.ts` 伺服器端讀 | **`.gitignore` 排除 `data/**`，catalog 沒進 git** → 直接部署線上是空的 |
| 配色 / 深淺色 | localStorage `palette-id` / `theme`（`layout.tsx:37` 同步讀）| 維持不動 |
| sync | `/api/sync`，含 Playwright（opentix/kktix）| 無法在 Vercel runtime 跑 |

關鍵風險點：**catalog 沒進 git**（`.gitignore` 第 47–50 行 `data/**` 只留 `.gitkeep`）。不處理的話，部署後 `readCombinedPlaces()` 回傳 `[]`，完全沒推薦。

---

## 架構決策

### 1. 資料分流（性質決定存哪，不為了統一全塞 DB）

| 資料 | 存哪 | 理由 |
|---|---|---|
| 口袋名單 | **Firestore** `users/{uid}/pocketList` | 使用者自建內容、無可取代、要跨裝置 |
| 最愛 | **Firestore** `users/{uid}/favorites` | per-user，與口袋名單同性質 |
| catalog（725 筆） | **靜態 build 產物**（commit `data/combined/`）| 所有人共用、唯讀、只 sync 時變；放 DB 會吃讀取 quota（725 reads/次推薦）|
| 配色 / 深淺色 | **localStorage**（不動）| UI 偏好、需載入瞬間同步讀（`layout.tsx:37` 反閃爍）、跨裝置價值低 |

### 2. 登入模型：可瀏覽、儲存才需登入（soft gate）

app 核心（從 catalog 產生行程）**不需要登入也能用**。只有「加入口袋名單 / 收藏」需要 per-user 空間。

- 未登入：可瀏覽、可產生行程；按「儲存 / 收藏」時跳出 Google 登入。
- 登入後：解鎖儲存與同步，到任何裝置都看到自己的清單。
- 用 `signInWithPopup`（桌機友善）；popup 被擋時 fallback `signInWithRedirect`。

### 3. catalog 怎麼上線（解 gitignore 問題）

- **取消忽略 `data/combined/`**，把 725 筆 catalog commit 進 repo，隨部署出貨。
- `data/raw/` 維持忽略（中間產物）。
- 維護流程：本機 `npm run dev` → 打 `/api/sync` → `combineAllPlaces()` 重生 `data/combined/` → commit → 部署。

### 4. 使用者口袋名單怎麼進推薦引擎

`generate.ts` 在伺服器端跑、讀靜態 catalog，看不到使用者的 Firestore 資料。MVP 採「**client 帶上去**」：

- `result/page.tsx` 從 Firestore 讀口袋名單 → 放進 `POST /api/generate` 的 body（`pocketList: Place[]`）。
- `generate.ts` 把 `靜態 catalog + 帶上來的 pocketList` 合併（對 pocketList 套一樣的 `normalizeDistrict` + 去重）再篩。
- 伺服器全程無狀態、不寫檔、不需 Firebase 憑證。
- （後續可換 Admin SDK：驗 ID token → 照 uid 在伺服器讀，client 就不用整包送。本方案先不做。）

> 註：移除 catalog 的口袋名單來源後，`restaurants.json` 會變 0 筆（美食只來自使用者口袋名單）。這是預期行為——餐廳改成「使用者自己的 Firestore 名單，在 generate 時合併」。

### 5. `/api/sync` 去處

維持為**本機維護工具**（含 Playwright，本來就跑不了 Vercel）。production 不呼叫；可加 guard 在 `NODE_ENV === "production"` 時回 403。`combine.ts` 移除口袋名單來源後，sync 仍正常重生共用 catalog。

---

## Firestore 資料模型

```
users/{uid}/
  pocketList/{placeId}   → Place 整筆（使用者自建，含 source: "pocket"）
  favorites/{placeId}    → { id: string, savedAt: number }   // 活引用，顯示時對 catalog 補資料

（留在 localStorage，不進 Firestore）
  palette-id, theme
```

最愛存「ID + 時間」而非整筆：catalog 項目會過期（演唱會結束就從 catalog 消失），既有 `/api/check-favorites` 就是拿收藏 ID 比對現行 catalog 剪枝，存 ID 與此設計一致。

### Security Rules（`firestore.rules`，上線前**必須**部署）

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

沒設這條 = 任何人能讀寫所有人的資料。Firestore 預設 test-mode 規則會過期或全開，務必換成上面這條。

---

## Firebase 專案設定（一次性）

1. Firebase console 建立專案。
2. 新增 **Web App** → 取得 config（apiKey、authDomain、projectId、storageBucket、messagingSenderId、appId）。
3. Authentication → Sign-in method → 啟用 **Google**。
4. Firestore Database → 建立（production mode）。
5. 部署 `firestore.rules`（`firebase deploy --only firestore:rules`，或 console 貼上）。
6. Authentication → Settings → Authorized domains → 加入 Vercel 正式網域（`localhost` 預設已在）。

---

## 環境變數

Firebase web config 是**公開的**（會 inline 進 client bundle），用 `NEXT_PUBLIC_` 前綴。安全性靠上面的 Auth + Rules，不是靠藏 key。

`.env.example`（commit，給隊友參考）/ `.env.local`（gitignored，實際值）：

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
# 本機開發用 emulator 時設 true
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=
```

- 本機：填 `.env.local`。
- Vercel：在專案 Settings → Environment Variables 設同一組（**注意 `NEXT_PUBLIC_` 在 `next build` 時被凍結 inline，改值要重新部署**）。

---

## 檔案異動清單

### 新增

| 檔案 | 作用 |
|---|---|
| `src/lib/firebase.ts` | client SDK 單例（app/auth/db）+ dev 時接 emulator |
| `src/components/AuthProvider.tsx` | `"use client"` context：`user`/`loading`/`signInWithGoogle`/`signOutUser` |
| `src/lib/usePocketList.ts` | `"use client"` hook，Firestore `users/{uid}/pocketList` |
| `src/components/AuthButton.tsx` | 登入/登出 UI（放 header 或 PaletteSwitcher 旁）|
| `firestore.rules` | 安全規則 |
| `.env.example` | 環境變數範本 |

### 修改

| 檔案 | 改什麼 |
|---|---|
| `src/app/layout.tsx` | `{children}` 外包 `<AuthProvider>`（server layout 內渲染 client provider，theme inline script 不動）|
| `src/lib/favorites.ts` | localStorage → Firestore `users/{uid}/favorites`，**維持 hook 介面** `{ favorites, isFavorite, toggle, remove, clear }` 讓 `result/page.tsx` 幾乎不用改 |
| `src/app/pocket-list/page.tsx` | 用 `usePocketList()` 取代 `fetch("/api/pocket-list")`；匯出/匯入改對 Firestore 讀寫 |
| `src/app/pocket-list/add/page.tsx` | `usePocketList().add()` 取代 `POST /api/pocket-list`（`parse-gmap` 保留）|
| `src/app/result/page.tsx` | 讀口袋名單 → 放進 `/api/generate` body 的 `pocketList` |
| `src/lib/combine.ts` | 移除第 63 行 `readRawJson("pocket-list.json")` 來源 |
| `src/lib/generate.ts` | 接 `req.pocketList`，合併 + `normalizeDistrict` + 去重後再篩 |
| `src/types/index.ts` | `GenerateRequest` 加 `pocketList?: Place[]` |
| `.gitignore` | 取消忽略 `data/combined/`（新增 `!data/combined/*.json`）|
| `package.json` | 加 `firebase` 依賴；（選）emulator 腳本 |

### 移除 / 退役

| 檔案 | 處置 |
|---|---|
| `src/app/api/pocket-list/route.ts` | 刪除（GET/POST/PUT/DELETE 寫檔行為由 Firestore 取代）|
| `src/app/api/pocket-list/parse-gmap/route.ts` | **保留**（無狀態解析 Google Maps，serverless OK）|
| `src/app/api/check-favorites/route.ts` | 保留（剪枝過期最愛仍有用，改用 Firestore 最愛 ID 呼叫）|
| `src/app/api/sync/route.ts` | 保留為本機工具，加 production guard |

---

## 關鍵程式碼骨架

### `src/lib/firebase.ts`

```ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(config);
export const auth = getAuth(app);
export const db = getFirestore(app);

// dev：接 emulator（用 globalThis flag 避免 HMR 重複連線）
if (
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true" &&
  typeof window !== "undefined" &&
  !(globalThis as { __fbEmu?: boolean }).__fbEmu
) {
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "localhost", 8080);
  (globalThis as { __fbEmu?: boolean }).__fbEmu = true;
}
```

### `src/components/AuthProvider.tsx`

```tsx
"use client";
import { createContext, useContext, useEffect, useState } from "react";
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

type Ctx = {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
};
const AuthCtx = createContext<Ctx>(null!);
export const useAuth = () => useContext(AuthCtx);

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); }), []);

  const signInWithGoogle = async () => {
    await signInWithPopup(auth, new GoogleAuthProvider());
  };
  const signOutUser = () => signOut(auth);

  return (
    <AuthCtx.Provider value={{ user, loading, signInWithGoogle, signOutUser }}>
      {children}
    </AuthCtx.Provider>
  );
}
```

### `src/lib/usePocketList.ts`（鏡像現有 favorites 介面）

```ts
"use client";
import { useEffect, useState, useCallback } from "react";
import {
  collection, doc, setDoc, deleteDoc, onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import type { Place } from "@/types";

export function usePocketList() {
  const { user } = useAuth();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setPlaces([]); setLoading(false); return; }
    const col = collection(db, "users", user.uid, "pocketList");
    return onSnapshot(col, (snap) => {
      setPlaces(snap.docs.map((d) => d.data() as Place));
      setLoading(false);
    });
  }, [user]);

  const add = useCallback(async (p: Omit<Place, "id" | "source">) => {
    if (!user) throw new Error("not-signed-in");
    const id = `pocket-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const place: Place = { ...p, id, source: "pocket" };
    await setDoc(doc(db, "users", user.uid, "pocketList", id), place);
  }, [user]);

  const remove = useCallback(async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "pocketList", id));
  }, [user]);

  // 匯入：逐筆 setDoc（量小，免 batch）；匯出：JSON.stringify(places)
  return { places, loading, add, remove };
}
```

### `src/lib/generate.ts`（合併使用者口袋名單）

```ts
// 把 combine.ts 的 normalizeForDedup / normalizeDistrict 抽成共用，或在此重用
export function generateItineraries(req: GenerateRequest, count = 2): Itinerary[] {
  const catalog = readCombinedPlaces();
  const pocket = (req.pocketList ?? []).map((p) => ({
    ...p,
    district: normalizeDistrict(p.address, p.district),
  }));
  // 合併 + 依正規化名稱去重（catalog 優先）
  const merged = dedupeByName([...catalog, ...pocket]);
  const excludeSet = new Set(req.exclude ?? []);
  const baseFiltered = merged.filter((p) => matchesBase(p, req, excludeSet));
  // ...其餘地點篩選邏輯不變
}
```

### `src/app/layout.tsx`（包 provider）

```tsx
import AuthProvider from "@/components/AuthProvider";
// ...
<body className="...">
  <AuthProvider>
    <PaletteSwitcher />
    {children}
  </AuthProvider>
</body>
```

### `.gitignore`（讓 catalog 上線）

```diff
 data/**
 !data/
 !data/raw/
 !data/combined/
+!data/combined/*.json
 !data/**/.gitkeep
```

---

## 本機開發

兩種模式：

**A. 直接連雲端 Firestore（最快）**：填 `.env.local` 的 Firebase config（不設 `USE_FIREBASE_EMULATOR`）→ `npm run dev`。寫入直接進雲端那份（與線上共用，個人專案可接受）。

**B. Firebase Emulator Suite（推薦，隔離、離線、免費）**：
```bash
npm i -D firebase-tools
npx firebase init emulators   # 勾 Auth + Firestore
npx firebase emulators:start --import=.emulator-data --export-on-exit
```
`.env.local` 設 `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` → `firebase.ts` 自動接 `localhost`。Emulator UI 在 `localhost:4000`；Auth emulator 提供模擬 Google 登入，可離線測。`--export-on-exit` 把資料存檔，最接近現在「寫本機檔」手感。

**sync 維護流程不變**：`npm run dev` → 打 `/api/sync` → 重生 `data/combined/` → commit。

---

## 部署（Vercel）

1. push repo（**含已 commit 的 `data/combined/*.json`**）。
2. Vercel import 專案。
3. Settings → Environment Variables 設 6 個 `NEXT_PUBLIC_FIREBASE_*`。
4. Firebase console → Auth → Authorized domains 加 Vercel 正式網域。
5. Deploy。

部署後：catalog 走靜態出貨、per-user 走 Firestore、`/api/generate` 無狀態合併。改 `NEXT_PUBLIC_*` 要重新部署（build 時 inline）。

---

## 既有資料遷移（選做）

登入後一次性把 localStorage 的 `noidea-favorites` 寫進 Firestore 再清空。個人專案資料量小，可手動匯出/匯入代替，優先度低。

---

## 實作階段

| Phase | 內容 | 完成後狀態 |
|---|---|---|
| 0 | Firebase 專案 + `.env` + `firebase.ts` + `AuthProvider` + `AuthButton` | Google 登入可用，尚無資料讀寫 |
| 1 | 取消忽略 `data/combined/`、`combine.ts` 移除口袋名單來源、commit catalog | **可部署且有推薦**（尚無 per-user 儲存）|
| 2 | 口袋名單 → Firestore（`usePocketList`）、改 add/list 頁、退役 `/api/pocket-list`、`generate` 合併 `pocketList` | 登入後可存口袋名單並影響推薦 |
| 3 | 最愛 → Firestore（重構 `favorites.ts`，維持介面）| 最愛跨裝置同步 |
| 4 | Emulator 開發設定 + 部署 Vercel + Authorized domains | 上線 |

可先做 0+1 確認「部署 + 登入 + 有推薦」，再做 2/3 的儲存。

---

## 風險與邊界情況

- **catalog 沒 commit** → 線上零推薦。Phase 1 必做。
- **Security Rules 沒部署** → 資料全裸。上線前必做。
- **`NEXT_PUBLIC_*` build 時凍結** → 改值要重新部署。
- **popup 被擋** → fallback `signInWithRedirect`。
- **最愛指向過期 catalog ID** → 保留 `check-favorites` 剪枝。
- **auth 為非同步** → UI 要處理 `loading`，避免閃動；theme 仍走 `layout.tsx:37` 同步 script（不受影響）。
- **Firestore 免費額度**：1 GiB / 5 萬 reads / 2 萬 writes 每日，此規模綽綽有餘。

## 驗收 checklist

- [ ] 未登入可瀏覽、可產生行程
- [ ] Google 登入 / 登出正常
- [ ] 登入後新增口袋名單 → 重整 / 換裝置仍在
- [ ] 口袋名單的美食出現在產生的行程中
- [ ] 收藏跨裝置同步；過期項目被剪枝
- [ ] 登出後他人帳號看不到我的資料（Rules 生效）
- [ ] Vercel 線上有推薦（catalog 有出貨）
- [ ] 本機 `npm run dev` + emulator 可離線開發與寫入
```
// SSR-safe localStorage 讀寫。伺服器端（無 window）或讀寫失敗一律回 fallback。
// 給「未設定 Firebase 時」的口袋名單 / 最愛 fallback 用
// （見 usePocketList.ts / favorites.ts 的 !configured 分支）。

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
    /* quota 滿 / 隱私模式：忽略 */
  }
}

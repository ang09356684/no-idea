"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  writeBatch,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import { readLocal, writeLocal } from "@/lib/localStore";
import type { Place } from "@/types";

// 未設定 Firebase 時，最愛改存這個瀏覽器的 localStorage（沿用遷移前的 key，
// 順帶讓舊資料自動回來）。僅本機、不跨裝置、不連雲端。
const LOCAL_KEY = "noidea-favorites";

// place.id 拿來當 Firestore doc id。實測 catalog id 皆為安全字元，
// 仍用 encodeURIComponent 當安全網（避免未來來源出現 "/" 等非法字元）。
function favDocId(placeId: string): string {
  return encodeURIComponent(placeId);
}

// Firestore 不接受值為 undefined 的欄位
function clean<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

/**
 * 我的最愛 hook。
 * - 有設定 Firebase：存當前登入使用者的 Firestore（users/{uid}/favorites），跨裝置同步；
 *   未登入時點愛心會觸發 Google 登入（soft gate）。
 * - 未設定 Firebase（!configured）：改存瀏覽器 localStorage（key noidea-favorites），
 *   本地單機可用、不需登入、不連雲端。
 * 兩種模式對外介面相同：{ favorites, isFavorite, toggle, remove, clear }。
 */
export function useFavorites() {
  const { user, configured, signInWithGoogle } = useAuth();
  const useLocal = !configured;

  // Firestore 模式：以 uid 把關避免換帳號殘留。
  const [snap, setSnap] = useState<{ uid: string; items: Place[] } | null>(null);
  // localStorage 模式：null = 尚未讀。
  const [local, setLocal] = useState<Place[] | null>(null);

  useEffect(() => {
    if (useLocal) {
      // Hydration-safe init：SSR/首次 render 為空，mount 後才讀 localStorage。
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocal(readLocal<Place[]>(LOCAL_KEY, []));
      return;
    }
    if (!user) return;
    const col = collection(db, "users", user.uid, "favorites");
    return onSnapshot(col, (s) => {
      setSnap({ uid: user.uid, items: s.docs.map((d) => d.data() as Place) });
    });
  }, [useLocal, user]);

  // useMemo 穩定參考：未登入時不會每次 render 產生新 []（避免下游 effect/依賴抖動）
  const favorites = useMemo<Place[]>(
    () =>
      useLocal
        ? local ?? []
        : user && snap && snap.uid === user.uid
          ? snap.items
          : [],
    [useLocal, local, user, snap]
  );

  const isFavorite = useCallback(
    (id: string) => favorites.some((f) => f.id === id),
    [favorites]
  );

  const toggle = useCallback(
    async (place: Place) => {
      if (useLocal) {
        const cur = readLocal<Place[]>(LOCAL_KEY, []);
        const next = cur.some((f) => f.id === place.id)
          ? cur.filter((f) => f.id !== place.id)
          : [...cur, clean(place)];
        writeLocal(LOCAL_KEY, next);
        setLocal(next);
        return;
      }
      if (!user) {
        // 未登入：引導登入，登入後再點一次即可收藏
        await signInWithGoogle().catch(() => {});
        return;
      }
      const ref = doc(db, "users", user.uid, "favorites", favDocId(place.id));
      if (favorites.some((f) => f.id === place.id)) {
        await deleteDoc(ref);
      } else {
        await setDoc(ref, clean(place));
      }
    },
    [useLocal, favorites, user, signInWithGoogle]
  );

  const remove = useCallback(
    async (id: string) => {
      if (useLocal) {
        const next = readLocal<Place[]>(LOCAL_KEY, []).filter((f) => f.id !== id);
        writeLocal(LOCAL_KEY, next);
        setLocal(next);
        return;
      }
      if (!user) return;
      await deleteDoc(doc(db, "users", user.uid, "favorites", favDocId(id)));
    },
    [useLocal, user]
  );

  const clear = useCallback(async () => {
    if (useLocal) {
      writeLocal(LOCAL_KEY, []);
      setLocal([]);
      return;
    }
    if (!user) return;
    const col = collection(db, "users", user.uid, "favorites");
    const snapshot = await getDocs(col);
    const batch = writeBatch(db);
    snapshot.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }, [useLocal, user]);

  return { favorites, isFavorite, toggle, remove, clear };
}

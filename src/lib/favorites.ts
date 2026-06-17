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
import type { Place } from "@/types";

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
 * 我的最愛 hook：資料存在當前登入使用者的 Firestore
 * （users/{uid}/favorites，存整筆 Place 以利「我的最愛」頁顯示）。
 * 介面與原 localStorage 版相同：{ favorites, isFavorite, toggle, remove, clear }。
 * 未登入時點愛心會觸發 Google 登入（soft gate）。
 */
export function useFavorites() {
  const { user, configured, signInWithGoogle } = useAuth();
  // 只在 onSnapshot callback 內 setState；未登入/換帳號時靠 derive 出空陣列
  const [snap, setSnap] = useState<{ uid: string; items: Place[] } | null>(null);

  useEffect(() => {
    if (!configured || !user) return;
    const col = collection(db, "users", user.uid, "favorites");
    return onSnapshot(col, (s) => {
      setSnap({ uid: user.uid, items: s.docs.map((d) => d.data() as Place) });
    });
  }, [user, configured]);

  // useMemo 穩定參考：未登入時不會每次 render 產生新 []（避免下游 effect/依賴抖動）
  const favorites = useMemo<Place[]>(
    () => (user && snap && snap.uid === user.uid ? snap.items : []),
    [user, snap]
  );

  const isFavorite = useCallback(
    (id: string) => favorites.some((f) => f.id === id),
    [favorites]
  );

  const toggle = useCallback(
    async (place: Place) => {
      if (!configured) return;
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
    [favorites, user, configured, signInWithGoogle]
  );

  const remove = useCallback(
    async (id: string) => {
      if (!user) return;
      await deleteDoc(doc(db, "users", user.uid, "favorites", favDocId(id)));
    },
    [user]
  );

  const clear = useCallback(async () => {
    if (!user) return;
    const col = collection(db, "users", user.uid, "favorites");
    const snap = await getDocs(col);
    const batch = writeBatch(db);
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }, [user]);

  return { favorites, isFavorite, toggle, remove, clear };
}

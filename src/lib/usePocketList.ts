"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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

function newPocketId(): string {
  return `pocket-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// Firestore 不接受值為 undefined 的欄位，寫入前先濾掉
function clean<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

/**
 * 口袋名單 hook：資料存在當前登入使用者的 Firestore
 * （users/{uid}/pocketList）。未登入 / 未設定 Firebase 時回空陣列。
 */
export function usePocketList() {
  const { user, configured } = useAuth();
  // 只在 onSnapshot callback 內 setState（react-hooks/set-state-in-effect 允許的模式）；
  // 未登入 / 切換使用者時，靠下方 derive 出空陣列，不在 effect 內同步 setState。
  const [snap, setSnap] = useState<{ uid: string; places: Place[] } | null>(null);

  useEffect(() => {
    if (!configured || !user) return;
    const col = collection(db, "users", user.uid, "pocketList");
    return onSnapshot(col, (s) => {
      setSnap({ uid: user.uid, places: s.docs.map((d) => d.data() as Place) });
    });
  }, [user, configured]);

  // 只採用「屬於當前使用者」的 snapshot，避免登出/換帳號時殘留他人資料。
  // useMemo 穩定參考：未登入時不會每次 render 產生新 []，避免下游 effect 無限重跑。
  const places = useMemo<Place[]>(
    () => (user && snap && snap.uid === user.uid ? snap.places : []),
    [user, snap]
  );
  const loading = !!configured && !!user && !(snap && snap.uid === user.uid);

  const add = useCallback(
    async (input: Omit<Place, "id" | "source">) => {
      if (!user) throw new Error("not-signed-in");
      const id = newPocketId();
      const place: Place = { ...input, id, source: "pocket" };
      await setDoc(doc(db, "users", user.uid, "pocketList", id), clean(place));
      return place;
    },
    [user]
  );

  const remove = useCallback(
    async (id: string) => {
      if (!user) return;
      await deleteDoc(doc(db, "users", user.uid, "pocketList", id));
    },
    [user]
  );

  /** 匯入：整批取代現有口袋名單 */
  const replaceAll = useCallback(
    async (next: Place[]) => {
      if (!user) throw new Error("not-signed-in");
      const col = collection(db, "users", user.uid, "pocketList");
      const existing = await getDocs(col);
      const batch = writeBatch(db);
      existing.forEach((d) => batch.delete(d.ref));
      for (const p of next) {
        const id = p.id || newPocketId();
        batch.set(doc(col, id), clean({ ...p, id, source: p.source || "pocket" }));
      }
      await batch.commit();
    },
    [user]
  );

  return { places, loading, add, remove, replaceAll };
}

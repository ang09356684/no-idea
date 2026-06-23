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
import { readLocal, writeLocal } from "@/lib/localStore";
import type { Place } from "@/types";

// 未設定 Firebase 時，口袋名單改存這個瀏覽器的 localStorage（僅本機、不跨裝置、不連雲端）。
const LOCAL_KEY = "noidea-pocket-list";

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
 * 口袋名單 hook。
 * - 有設定 Firebase：存當前登入使用者的 Firestore（users/{uid}/pocketList），跨裝置同步。
 * - 未設定 Firebase（!configured，例如 clone 後沒填 .env.local）：改存瀏覽器 localStorage，
 *   本地單機可完整使用，且完全不連雲端。
 * 兩種模式對外介面相同：{ places, loading, add, remove, replaceAll }。
 */
export function usePocketList() {
  const { user, configured } = useAuth();
  const useLocal = !configured;

  // Firestore 模式：只在 onSnapshot callback 內 setState；以 uid 把關避免換帳號殘留。
  const [snap, setSnap] = useState<{ uid: string; places: Place[] } | null>(null);
  // localStorage 模式：null = 尚未讀（loading）。SSR/首次 render 都還沒讀，避免 hydration mismatch。
  const [local, setLocal] = useState<Place[] | null>(null);

  useEffect(() => {
    if (useLocal) {
      // Hydration-safe init：SSR/首次 render 為空，mount 後才讀 localStorage。
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocal(readLocal<Place[]>(LOCAL_KEY, []));
      return;
    }
    if (!user) return;
    const col = collection(db, "users", user.uid, "pocketList");
    return onSnapshot(col, (s) => {
      setSnap({ uid: user.uid, places: s.docs.map((d) => d.data() as Place) });
    });
  }, [useLocal, user]);

  // useMemo 穩定參考：未登入時不會每次 render 產生新 []，避免下游 effect 無限重跑。
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
        const next = [...readLocal<Place[]>(LOCAL_KEY, []), place];
        writeLocal(LOCAL_KEY, next);
        setLocal(next);
        return place;
      }
      if (!user) throw new Error("not-signed-in");
      await setDoc(doc(db, "users", user.uid, "pocketList", id), clean(place));
      return place;
    },
    [useLocal, user]
  );

  const remove = useCallback(
    async (id: string) => {
      if (useLocal) {
        const next = readLocal<Place[]>(LOCAL_KEY, []).filter((p) => p.id !== id);
        writeLocal(LOCAL_KEY, next);
        setLocal(next);
        return;
      }
      if (!user) return;
      await deleteDoc(doc(db, "users", user.uid, "pocketList", id));
    },
    [useLocal, user]
  );

  /** 匯入：整批取代現有口袋名單 */
  const replaceAll = useCallback(
    async (next: Place[]) => {
      const normalized = next.map((p) =>
        clean({ ...p, id: p.id || newPocketId(), source: p.source || "pocket" })
      );
      if (useLocal) {
        writeLocal(LOCAL_KEY, normalized);
        setLocal(normalized);
        return;
      }
      if (!user) throw new Error("not-signed-in");
      const col = collection(db, "users", user.uid, "pocketList");
      const existing = await getDocs(col);
      const batch = writeBatch(db);
      existing.forEach((d) => batch.delete(d.ref));
      for (const p of normalized) {
        batch.set(doc(col, p.id), p);
      }
      await batch.commit();
    },
    [useLocal, user]
  );

  return { places, loading, add, remove, replaceAll };
}

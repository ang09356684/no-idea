"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import PlaceItem from "@/components/PlaceItem";
import ItineraryCard from "@/components/ItineraryCard";
import { useFavorites } from "@/lib/favorites";
import SignInGate from "@/components/SignInGate";
import type { Place, Itinerary } from "@/types";

const TYPE_TABS = [
  { value: "all", label: "全部" },
  { value: "exhibition", label: "展覽" },
  { value: "concert", label: "音樂" },
  { value: "theater", label: "戲劇" },
  { value: "movie", label: "電影" },
  { value: "attraction", label: "景點" },
  { value: "food", label: "美食" },
];

function isFood(type: string) {
  return type === "food";
}

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export default function FavoritesPage() {
  const { favorites, isFavorite, toggle, remove, clear } = useFavorites();
  const [tab, setTab] = useState("all");
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [showItineraries, setShowItineraries] = useState(false);
  const [expiredIds, setExpiredIds] = useState<Set<string>>(new Set());

  // Check which favorites are still in the latest data
  const checkExpired = useCallback(async () => {
    if (favorites.length === 0) return;
    try {
      const res = await fetch("/api/check-favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: favorites.map((f) => f.id) }),
      });
      const { results } = await res.json();
      const expired = new Set<string>();
      for (const [id, active] of Object.entries(results)) {
        if (!active) expired.add(id);
      }
      setExpiredIds(expired);
    } catch {
      // ignore
    }
  }, [favorites]);

  useEffect(() => {
    checkExpired();
  }, [checkExpired]);

  const expiredCount = favorites.filter((f) => expiredIds.has(f.id)).length;

  const clearExpired = () => {
    for (const f of favorites) {
      if (expiredIds.has(f.id)) remove(f.id);
    }
    setExpiredIds(new Set());
  };

  const filtered =
    tab === "all"
      ? favorites
      : tab === "expired"
        ? favorites.filter((p) => expiredIds.has(p.id))
        : tab === "food"
          ? favorites.filter((p) => isFood(p.type))
          : favorites.filter((p) => p.type === tab);

  const generateFromFavorites = () => {
    // Only use active (non-expired) favorites
    const activeFavs = favorites.filter((f) => !expiredIds.has(f.id));
    const activities = shuffle(
      activeFavs.filter(
        (p) =>
          ["exhibition", "concert", "theater", "movie", "attraction"].includes(
            p.type
          )
      )
    );
    const foods = shuffle(activeFavs.filter((p) => isFood(p.type)));

    const results: Itinerary[] = [];
    const usedIds = new Set<string>();

    for (let round = 0; round < 2; round++) {
      const places: Place[] = [];

      for (const p of activities) {
        if (!usedIds.has(p.id) && places.length < 2) {
          usedIds.add(p.id);
          places.push(p);
        }
      }

      for (const p of foods) {
        if (!usedIds.has(p.id) && places.length < 3) {
          usedIds.add(p.id);
          // Insert food in the middle
          places.splice(1, 0, p);
          break;
        }
      }

      // Fill remaining
      for (const p of [...activities, ...foods]) {
        if (!usedIds.has(p.id) && places.length < 3) {
          usedIds.add(p.id);
          places.push(p);
        }
      }

      if (places.length > 0) {
        results.push({
          id: `fav-${round}`,
          places,
        });
      }
    }

    setItineraries(results);
    setShowItineraries(true);
  };

  const allTabs = [
    ...TYPE_TABS,
    ...(expiredCount > 0
      ? [{ value: "expired", label: "已下架" }]
      : []),
  ];

  const tabCounts = allTabs.map((t) => ({
    ...t,
    count:
      t.value === "all"
        ? favorites.length
        : t.value === "expired"
          ? expiredCount
          : t.value === "food"
            ? favorites.filter((p) => isFood(p.type)).length
            : favorites.filter((p) => p.type === t.value).length,
  })).filter((t) => t.value === "all" || t.count > 0);

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-8">
      <div className="w-full max-w-lg">
        <Link
          href="/"
          className="mb-4 inline-block text-sm text-gray-400 hover:text-gray-600"
        >
          &larr; 返回首頁
        </Link>

        <SignInGate message="登入以查看我的最愛">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
              我的最愛
            </h1>
            <p className="text-sm text-gray-400">
              共 {favorites.length} 筆
            </p>
          </div>
          {favorites.length > 0 && (
            <button
              onClick={clear}
              className="text-xs text-red-400 hover:text-red-600"
            >
              清空全部
            </button>
          )}
        </div>

        {/* Expired warning */}
        {expiredCount > 0 && (
          <div className="mb-4 flex items-center justify-between rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
            <p className="text-sm text-amber-700 dark:text-amber-400">
              有 {expiredCount} 筆已下架的項目
            </p>
            <button
              onClick={clearExpired}
              className="rounded-full bg-amber-100 dark:bg-amber-800 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-700"
            >
              清除已下架
            </button>
          </div>
        )}

        {/* Action buttons */}
        {favorites.length >= 2 && (
          <button
            onClick={generateFromFavorites}
            className="mb-6 w-full rounded-full py-3 text-base font-semibold transition-opacity hover:opacity-90"
            style={{
              backgroundColor: "var(--theme-accent)",
              color: "var(--theme-on-accent)",
            }}
          >
            從最愛安排行程
          </button>
        )}

        {/* Generated itineraries from favorites */}
        {showItineraries && itineraries.length > 0 && (
          <div className="mb-8 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                從你的最愛安排的行程
              </h2>
              <button
                onClick={() => setShowItineraries(false)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                收起
              </button>
            </div>
            {itineraries.map((it, i) => (
              <ItineraryCard
                key={it.id}
                itinerary={it}
                index={i}
                isFavorite={isFavorite}
                onToggleFavorite={toggle}
              />
            ))}
          </div>
        )}

        {/* Type filter tabs */}
        {favorites.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {tabCounts.map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  tab === t.value
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                }`}
              >
                {t.label} ({t.count})
              </button>
            ))}
          </div>
        )}

        {/* Favorites list */}
        {favorites.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <p className="text-4xl mb-4">🤍</p>
            <p className="text-lg">還沒有最愛</p>
            <p className="mt-2 text-sm">
              在瀏覽展覽、電影、演出時，點右側愛心加入最愛
            </p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-full px-6 py-2"
              style={{
                backgroundColor: "var(--theme-accent)",
                color: "var(--theme-on-accent)",
              }}
            >
              去逛逛
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => (
              <div key={item.id} className="relative">
                {expiredIds.has(item.id) && (
                  <div className="absolute -top-1 -right-1 z-10 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                    已下架
                  </div>
                )}
                <div className={expiredIds.has(item.id) ? "opacity-60" : ""}>
                  <PlaceItem
                    place={item}
                    isFavorite={isFavorite(item.id)}
                    onToggleFavorite={toggle}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        </SignInGate>
      </div>
    </main>
  );
}

"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, Suspense } from "react";
import ItineraryCard from "@/components/ItineraryCard";
import { useFavorites } from "@/lib/favorites";
import { districtDisplay } from "@/lib/districts";
import type { Itinerary } from "@/types";
import Link from "next/link";

// 篩選標籤顯示：不限 / 城市(city-wide) / 行政區（複合鍵去縣市前綴）
function districtLabel(district: string): string {
  if (district === "不限") return "不限";
  if (district.endsWith("-all")) return district.replace("-all", "");
  return districtDisplay(district);
}

function ResultContent() {
  const searchParams = useSearchParams();
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [loading, setLoading] = useState(true);
  const [excluded, setExcluded] = useState<string[]>([]);
  const { isFavorite, toggle } = useFavorites();

  const district = searchParams.get("district") ?? "不限";
  const typeParam = searchParams.get("type") ?? "all";
  const types = typeParam.split(",").filter(Boolean);
  const setting = searchParams.get("setting") ?? "both";

  const fetchItineraries = useCallback(
    async (excludeIds: string[]) => {
      setLoading(true);
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            district,
            type: types,
            setting,
            exclude: excludeIds,
          }),
        });
        const data = await res.json();
        setItineraries(data.itineraries);
      } catch {
        setItineraries([]);
      } finally {
        setLoading(false);
      }
    },
    [district, typeParam, setting]
  );

  useEffect(() => {
    fetchItineraries([]);
  }, [fetchItineraries]);

  const handleShuffle = () => {
    const currentIds = itineraries.flatMap((it) =>
      it.places.map((p) => p.id)
    );
    const newExcluded = [...excluded, ...currentIds];
    setExcluded(newExcluded);
    fetchItineraries(newExcluded);
  };

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-8">
      <div className="w-full max-w-lg">
        <Link
          href="/"
          className="mb-4 inline-block text-sm text-gray-400 hover:text-gray-600"
        >
          &larr; 重新選擇
        </Link>

        <div className="mb-6 flex flex-wrap gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1">
            {districtLabel(district)}
          </span>
          {types.map((t) => (
            <span key={t} className="rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1">
              {{ all: "不限", exhibition: "展覽", concert: "演唱會", music: "音樂會", theater: "戲劇", movie: "電影", attraction: "景點", food: "美食" }[t] ?? t}
            </span>
          ))}
          <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1">
            {setting === "indoor"
              ? "室內"
              : setting === "outdoor"
                ? "室外"
                : "都可以"}
          </span>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-48 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800"
              />
            ))}
          </div>
        ) : itineraries.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <p className="text-lg">找不到符合條件的行程</p>
            <p className="mt-2 text-sm">
              試試放寬條件，或先點「同步資料」抓取最新展覽/電影
            </p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-full bg-gray-900 px-6 py-2 text-white"
            >
              返回首頁
            </Link>
          </div>
        ) : (
          <div className="space-y-6 pb-24">
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
      </div>

      {!loading && itineraries.length > 0 && (
        <button
          onClick={handleShuffle}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full px-8 py-3 text-lg font-semibold shadow-lg transition-opacity hover:opacity-90"
          style={{
            backgroundColor: "var(--theme-accent)",
            color: "var(--theme-on-accent)",
          }}
        >
          🎲 再給我一組
        </button>
      )}
    </main>
  );
}

export default function ResultPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center">
          <div className="h-48 w-full max-w-lg animate-pulse rounded-2xl bg-gray-100" />
        </main>
      }
    >
      <ResultContent />
    </Suspense>
  );
}
